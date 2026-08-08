import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { InventoryPostingEngine } from '../../src/features/inventory/application/inventoryPostingEngine.js';
import type { InventoryRepository } from '../../src/features/inventory/application/inventoryRepository.js';
import {
  deterministicInventoryBalanceId,
  emptyInventoryBalance,
  type InventoryBalance,
  type InventoryMovement,
  type InventoryQuantityBucket,
  type StockLocation,
} from '../../src/features/inventory/domain/index.js';
import {
  applyPurchaseOrderReceipt,
  assertProcurementAuthority,
  assertSupplier,
  assertWarehouseDestination,
  type ProcurementMembership,
  type PurchaseOrderDocument,
  PurchaseOrderError,
  reversePurchaseOrderReceipt,
} from './purchaseOrderLifecycle.js';

type Data = Record<string, unknown>;
type ReceiptLine = {
  lineId: string; productId: string; deliveredQuantity: number; acceptedQuantity: number;
  damagedQuantity: number; quarantinedQuantity: number; rejectedQuantity: number;
  unitCost?: number; batchNumber?: string; unitOfMeasure?: string;
};

const clean = <T>(value: T): T => Array.isArray(value) ? value.map(clean) as T
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, clean(item)])) as T
    : value;

function required(data: Data, key: string): string {
  const value = String(data[key] ?? '').trim();
  if (!value) throw new HttpsError('invalid-argument', `${key} is required.`);
  return value;
}

function safeId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `${value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 72)}_${(hash >>> 0).toString(16)}`;
}

function number(value: unknown, label: string): number {
  const resolved = Number(value ?? 0);
  if (!Number.isFinite(resolved) || resolved < 0) throw new HttpsError('invalid-argument', `${label} must be finite and non-negative.`);
  return resolved;
}

function lines(value: unknown): ReceiptLine[] {
  if (!Array.isArray(value) || value.length === 0) throw new HttpsError('invalid-argument', 'lines are required.');
  const seen = new Set<string>(); const products = new Set<string>();
  return value.map((item, index) => {
    const raw = item as Data;
    const productId = required(raw, 'productId');
    const lineId = String(raw.lineId || `line_${index + 1}_${productId}`).trim();
    if (seen.has(lineId)) throw new HttpsError('invalid-argument', 'Receipt line identifiers must be unique.');
    if (products.has(productId)) throw new HttpsError('invalid-argument', 'A product may appear only once per receipt.');
    seen.add(lineId);
    products.add(productId);
    const deliveredQuantity = number(raw.deliveredQuantity ?? raw.quantity, 'deliveredQuantity');
    const acceptedQuantity = number(raw.acceptedQuantity, 'acceptedQuantity');
    const damagedQuantity = number(raw.damagedQuantity, 'damagedQuantity');
    const quarantinedQuantity = number(raw.quarantinedQuantity, 'quarantinedQuantity');
    const rejectedQuantity = number(raw.rejectedQuantity, 'rejectedQuantity');
    const accounted = acceptedQuantity + damagedQuantity + quarantinedQuantity + rejectedQuantity;
    if (deliveredQuantity <= 0 || Math.abs(deliveredQuantity - accounted) > 1e-9) {
      throw new HttpsError('invalid-argument', 'Each line must satisfy delivered = accepted + damaged + quarantined + rejected.');
    }
    return clean({ lineId, productId, deliveredQuantity, acceptedQuantity, damagedQuantity, quarantinedQuantity, rejectedQuantity,
      unitCost: raw.unitCost === undefined ? undefined : number(raw.unitCost, 'unitCost'),
      batchNumber: raw.batchNumber === undefined ? undefined : String(raw.batchNumber),
      unitOfMeasure: raw.unitOfMeasure === undefined ? undefined : String(raw.unitOfMeasure) });
  });
}

function mapError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof PurchaseOrderError) {
    const denied = ['unauthenticated', 'non_member', 'wrong_tenant', 'missing_permission'].includes(error.code);
    throw new HttpsError(error.code === 'unauthenticated' ? 'unauthenticated' : denied ? 'permission-denied' : 'failed-precondition', error.message, { reasonCode: error.code });
  }
  const reasonCode = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : 'internal';
  throw new HttpsError(['INSUFFICIENT_STOCK', 'LOCATION_INACTIVE', 'LOCATION_UNLICENSED'].includes(reasonCode) ? 'failed-precondition' : 'internal', error instanceof Error ? error.message : 'Supplier receipt command failed.', { reasonCode });
}

function maybeFail(data: Data, point: string): void {
  if (process.env.FUNCTIONS_EMULATOR === 'true' && data.testFailurePoint === point) throw new HttpsError('aborted', `Injected failure at ${point}.`);
}

async function authority(tx: Transaction, firestore: Firestore, uid: string | undefined, vendorId: string): Promise<ProcurementMembership> {
  if (!uid) return assertProcurementAuthority(uid, vendorId, null, 'receiving.approve');
  const memberSnapshot = await tx.get(firestore.doc(`vendors/${vendorId}/memberships/${uid}`));
  const member = assertProcurementAuthority(uid, vendorId, memberSnapshot.exists ? memberSnapshot.data() as ProcurementMembership : null, 'receiving.approve');
  const role = await tx.get(firestore.doc(`vendors/${vendorId}/roles/${member.roleId}`));
  if (role.exists && ['suspended', 'archived', 'inactive'].includes(String(role.data()!.status || '').toLowerCase())) throw new PurchaseOrderError('non_member', 'The assigned role is not active.');
  return member;
}

function approvalIsValid(value: Data | undefined, vendorId: string, receiptId: string, warehouseId: string): boolean {
  return Boolean(value && String(value.vendorId || value.tenantId) === vendorId &&
    ['APPROVED', 'COMPLETED'].includes(String(value.status)) && (value.status === 'APPROVED' || value.outcome === 'APPROVED') &&
    String(value.resourceId || value.entityId) === receiptId && String(value.warehouseId) === warehouseId &&
    ['SUPPLIER_STOCK_RECEIPT', 'SUPPLIER_RECEIPT'].includes(String(value.resourceType || value.entityType)));
}

function warehouseLocation(vendorId: string, warehouseId: string, value: Data): StockLocation {
  return {
    id: warehouseId, tenantId: vendorId, vendorId, type: 'WAREHOUSE', name: String(value.name || warehouseId), code: String(value.code || warehouseId),
    status: String(value.status).toLowerCase() === 'active' ? 'ACTIVE' : 'SUSPENDED',
    licenceStatus: String(value.licenseStatus || value.licenceStatus).toLowerCase() === 'licensed' ? 'LICENSED' : 'UNLICENSED',
    createdAt: String(value.createdAt || new Date(0).toISOString()), updatedAt: String(value.updatedAt || value.createdAt || new Date(0).toISOString()),
  };
}

function inventoryRepository(
  tx: Transaction, firestore: Firestore, vendorId: string, warehouse: StockLocation,
  balances: Map<string, InventoryBalance>, legacy: Map<string, Data>, movements: Map<string, InventoryMovement>,
): InventoryRepository {
  return {
    async getStockLocation(id) { return id === warehouse.id ? warehouse : null; },
    async getBalance(_tenantId, _vendorId, _locationId, productId) { return balances.get(productId) || null; },
    async getMovementByIdempotencyKey(_tenantId, _vendorId, key) { return movements.get(key) || null; },
    async saveMovement(movement) {
      movements.set(movement.idempotencyKey, movement);
      tx.create(firestore.doc(`vendors/${vendorId}/inventory_movements/${movement.id}`), clean(movement));
    },
    async saveBalance(balance) {
      balances.set(balance.productId, balance);
      tx.set(firestore.doc(`vendors/${vendorId}/inventory_balances/${balance.id}`), clean(balance));
      const legacyId = `${vendorId}_${balance.stockLocationId}_${balance.productId}`;
      tx.set(firestore.doc(`vendors/${vendorId}/warehouse_inventory/${legacyId}`), clean({ ...(legacy.get(balance.productId) || {}), id: legacyId,
        tenantId: vendorId, vendorId, warehouseId: balance.stockLocationId, productId: balance.productId, quantity: balance.onHandQty,
        reservedQuantity: balance.reservedQty, inTransitQuantity: balance.inTransitQty, quarantinedQuantity: balance.quarantinedQty,
        damagedQuantity: balance.damagedQty, version: balance.version, lastUpdated: balance.updatedAt }));
    },
    async runAtomic<T>(operation: (repository: InventoryRepository) => Promise<T>) { return operation(this); },
  };
}

function event(tx: Transaction, firestore: Firestore, vendorId: string, receiptId: string, warehouseId: string, supplierId: string, actorId: string, commandId: string, eventType: string, now: string, reason?: string): void {
  const eventId = safeId(`${eventType}:${commandId}`);
  const body = clean({ id: eventId, eventId, eventType, eventVersion: 1, tenantId: vendorId, vendorId, warehouseId, supplierId,
    userId: actorId, actorId, receiptId, entityType: 'SUPPLIER_STOCK_RECEIPT', entityId: receiptId, commandId,
    idempotencyKey: commandId, outcome: 'COMPLETED', reasonCode: reason, occurredAt: now, recordedAt: now, offlineEvent: false });
  tx.create(firestore.doc(`vendors/${vendorId}/audit_events/${eventId}`), body);
  tx.create(firestore.doc(`vendors/${vendorId}/bi_events/${eventId}`), body);
}

export function createSupplierReceiptCallables(firestore: Firestore) {
  const postSupplierReceipt = onCall(async request => {
    const data = request.data as Data; const vendorId = required(data, 'vendorId'); const receiptId = required(data, 'receiptId');
    const commandId = required({ commandId: data.commandId ?? data.idempotencyKey }, 'commandId');
    try {
      return await firestore.runTransaction(async tx => {
        const member = await authority(tx, firestore, request.auth?.uid, vendorId);
        const warehouseId = required(data, 'warehouseId'); const supplierId = required(data, 'supplierId');
        const purchaseOrderId = required(data, 'purchaseOrderId'); const approvalRequestId = required(data, 'approvalRequestId');
        const receiptLines = lines(data.lines); const commandRef = firestore.doc(`vendors/${vendorId}/supplier_receipt_commands/${safeId(commandId)}`);
        const refs = [commandRef, firestore.doc(`vendors/${vendorId}/supplier_receipts/${receiptId}`), firestore.doc(`vendors/${vendorId}/warehouses/${warehouseId}`),
          firestore.doc(`vendors/${vendorId}/suppliers/${supplierId}`), firestore.doc(`vendors/${vendorId}/purchase_orders/${purchaseOrderId}`),
          firestore.doc(`vendors/${vendorId}/approval_requests/${approvalRequestId}`),
          ...(data.overReceiptApprovalId ? [firestore.doc(`vendors/${vendorId}/approval_requests/${String(data.overReceiptApprovalId)}`)] : []),
          ...receiptLines.map(line => firestore.doc(`vendors/${vendorId}/products/${line.productId}`)),
          ...receiptLines.map(line => firestore.doc(`vendors/${vendorId}/inventory_balances/${deterministicInventoryBalanceId({ tenantId: vendorId, vendorId, stockLocationId: warehouseId, productId: line.productId })}`)),
          ...receiptLines.map(line => firestore.doc(`vendors/${vendorId}/warehouse_inventory/${vendorId}_${warehouseId}_${line.productId}`)),
          ...receiptLines.flatMap(line => (['ON_HAND', 'DAMAGED', 'QUARANTINED'] as const).map(bucket => firestore.doc(`vendors/${vendorId}/inventory_movements/${safeId(`supplier-receipt:${receiptId}:${line.lineId}:${bucket}`)}`))),
        ];
        const snapshots = await tx.getAll(...refs); let cursor = 0;
        const prior = snapshots[cursor++];
        if (prior.exists) {
          const value = prior.data()!;
          if (value.action !== 'POST' || value.commandId !== commandId || value.receiptId !== receiptId) throw new HttpsError('already-exists', 'Command identity is already assigned.');
          return value.result;
        }
        const existingReceipt = snapshots[cursor++]; if (existingReceipt.exists) throw new HttpsError('already-exists', 'Receipt identity already exists.');
        const warehouseSnapshot = snapshots[cursor++]; const supplierSnapshot = snapshots[cursor++]; const orderSnapshot = snapshots[cursor++]; const approvalSnapshot = snapshots[cursor++];
        if (!warehouseSnapshot.exists || !supplierSnapshot.exists || !orderSnapshot.exists) throw new HttpsError('not-found', 'Warehouse, supplier, or purchase order was not found.');
        assertWarehouseDestination(vendorId, warehouseId, 'WAREHOUSE', { id: warehouseId, ...warehouseSnapshot.data() }, member);
        assertSupplier(vendorId, supplierId, { id: supplierId, ...supplierSnapshot.data() });
        const order = orderSnapshot.data() as PurchaseOrderDocument;
        if (order.vendorId !== vendorId || order.tenantId !== vendorId || order.supplierId !== supplierId || order.destinationWarehouseId !== warehouseId) throw new PurchaseOrderError('wrong_tenant', 'Receipt authority does not match the purchase order.');
        if (!approvalIsValid(approvalSnapshot.data(), vendorId, receiptId, warehouseId)) throw new HttpsError('failed-precondition', 'An approved supplier-receipt request is required.');
        let overApproved = false; let overApprovalRef: FirebaseFirestore.DocumentReference | undefined; let overApproval: Data | undefined;
        if (data.overReceiptApprovalId) {
          overApprovalRef = refs[6]; overApproval = snapshots[cursor++].data();
          const payload = overApproval?.dataPayload as Data | undefined;
          const standalone = overApproval?.resourceId === purchaseOrderId && overApproval?.requestedAction === 'ALLOW_OVER_RECEIPT';
          const bundled = String(overApproval?.resourceId || overApproval?.entityId) === receiptId &&
            payload?.overReceiptExceptionRequested === true && Boolean(String(payload.overReceiptReason || '').trim());
          overApproved = Boolean(overApproval && String(overApproval.vendorId || overApproval.tenantId) === vendorId && ['APPROVED', 'COMPLETED'].includes(String(overApproval.status)) &&
            (overApproval.status === 'APPROVED' || overApproval.outcome === 'APPROVED') && (standalone || bundled) &&
            (!overApproval.consumedByCommandId || overApproval.consumedByCommandId === commandId));
          if (!overApproved) throw new HttpsError('failed-precondition', 'Over-receipt approval is invalid or already consumed.');
        }
        const productSnapshots = snapshots.slice(cursor, cursor + receiptLines.length); cursor += receiptLines.length;
        productSnapshots.forEach((snapshot, index) => { const value = snapshot.data(); if (!snapshot.exists || String(value?.vendorId) !== vendorId || ('tenantId' in (value || {}) && String(value?.tenantId) !== vendorId) || String(value?.status).toLowerCase() !== 'active') throw new HttpsError('not-found', `Product ${receiptLines[index].productId} is not active and tenant-owned.`); });
        const canonicalSnapshots = snapshots.slice(cursor, cursor + receiptLines.length); cursor += receiptLines.length;
        const legacySnapshots = snapshots.slice(cursor, cursor + receiptLines.length); cursor += receiptLines.length;
        const movementSnapshots = snapshots.slice(cursor);
        const now = new Date().toISOString(); const warehouse = warehouseLocation(vendorId, warehouseId, warehouseSnapshot.data()!);
        const balanceMap = new Map<string, InventoryBalance>(); const legacyMap = new Map<string, Data>(); const movementMap = new Map<string, InventoryMovement>();
        receiptLines.forEach((line, index) => {
          const canonical = canonicalSnapshots[index].data() as InventoryBalance | undefined; const legacy = legacySnapshots[index].data() as Data | undefined;
          legacyMap.set(line.productId, legacy || {});
          balanceMap.set(line.productId, canonical || (legacy ? { ...emptyInventoryBalance({ tenantId: vendorId, vendorId, stockLocationId: warehouseId, productId: line.productId }, now),
            onHandQty: Number(legacy.quantity || 0), reservedQty: Number(legacy.reservedQuantity || 0), inTransitQty: Number(legacy.inTransitQuantity || 0), quarantinedQty: Number(legacy.quarantinedQuantity || 0), damagedQty: Number(legacy.damagedQuantity || 0), version: Number(legacy.version || 0), updatedAt: String(legacy.lastUpdated || now) } : emptyInventoryBalance({ tenantId: vendorId, vendorId, stockLocationId: warehouseId, productId: line.productId }, now)));
        });
        movementSnapshots.forEach(snapshot => { if (snapshot.exists) { const movement = snapshot.data() as InventoryMovement; movementMap.set(movement.idempotencyKey, movement); } });
        const updatedOrder = applyPurchaseOrderReceipt(order, receiptLines.map(line => ({ lineId: line.lineId, productId: line.productId, quantity: line.deliveredQuantity })), overApproved, member.userUid, commandId, now);
        const repository = inventoryRepository(tx, firestore, vendorId, warehouse, balanceMap, legacyMap, movementMap); const engine = new InventoryPostingEngine(repository, async ({ productId }) => receiptLines.some(line => line.productId === productId), () => now);
        const movementIds: string[] = [];
        for (const line of receiptLines) for (const [bucket, quantity] of [['ON_HAND', line.acceptedQuantity], ['DAMAGED', line.damagedQuantity], ['QUARANTINED', line.quarantinedQuantity]] as Array<[InventoryQuantityBucket, number]>) {
          if (quantity <= 0) continue; const idempotencyKey = `supplier-receipt:${receiptId}:${line.lineId}:${bucket}`; const movementId = safeId(idempotencyKey);
          const posted = await engine.post({ commandId: movementId, idempotencyKey, tenantId: vendorId, vendorId, productId: line.productId, movementType: 'SUPPLIER_RECEIPT', quantity,
            quantityBucket: bucket, destinationLocationId: warehouseId, referenceType: 'SUPPLIER_STOCK_RECEIPT', referenceId: receiptId, actorId: member.userUid,
            approvalRequestId, occurredAt: now, correlationId: receiptId }); movementIds.push(posted.movement.id);
        }
        maybeFail(data, 'AFTER_INVENTORY');
        tx.set(firestore.doc(`vendors/${vendorId}/purchase_orders/${purchaseOrderId}`), clean(updatedOrder));
        tx.set(firestore.doc(`vendors/${vendorId}/approval_requests/${approvalRequestId}`), clean({ ...approvalSnapshot.data(), status: 'COMPLETED', outcome: 'APPROVED', consumedByCommandId: commandId, consumedAt: now, updatedAt: now }), { merge: true });
        if (overApprovalRef && overApproval) tx.set(overApprovalRef, clean({ ...overApproval, status: 'COMPLETED', outcome: 'APPROVED', consumedByCommandId: commandId, consumedAt: now, updatedAt: now }));
        maybeFail(data, 'AFTER_PURCHASE_ORDER');
        const receipt = clean({ id: receiptId, receiptId, tenantId: vendorId, vendorId, warehouseId, supplierId, purchaseOrderId, approvalRequestId,
          referenceNo: String(data.referenceNo || ''), status: 'POSTED', lines: receiptLines, movementIds, postedBy: member.userUid, postedAt: now, createdAt: now, updatedAt: now, version: 1 });
        tx.create(firestore.doc(`vendors/${vendorId}/supplier_receipts/${receiptId}`), receipt);
        event(tx, firestore, vendorId, receiptId, warehouseId, supplierId, member.userUid, commandId, 'SUPPLIER_RECEIPT_POSTED', now);
        const result = { receipt, purchaseOrder: updatedOrder, duplicate: false };
        tx.create(commandRef, clean({ tenantId: vendorId, vendorId, receiptId, purchaseOrderId, action: 'POST', commandId, actorId: member.userUid, createdAt: now, result }));
        maybeFail(data, 'AFTER_EVENTS');
        return result;
      });
    } catch (error) { return mapError(error); }
  });

  const reverseSupplierReceipt = onCall(async request => {
    const data = request.data as Data; const vendorId = required(data, 'vendorId'); const receiptId = required(data, 'receiptId');
    const commandId = required({ commandId: data.commandId ?? data.idempotencyKey }, 'commandId'); const reason = required(data, 'reason');
    try {
      return await firestore.runTransaction(async tx => {
        const member = await authority(tx, firestore, request.auth?.uid, vendorId);
        const commandRef = firestore.doc(`vendors/${vendorId}/supplier_receipt_commands/${safeId(commandId)}`); const receiptRef = firestore.doc(`vendors/${vendorId}/supplier_receipts/${receiptId}`);
        const [prior, receiptSnapshot] = await tx.getAll(commandRef, receiptRef);
        if (prior.exists) { const value = prior.data()!; if (value.action !== 'REVERSE' || value.commandId !== commandId || value.receiptId !== receiptId) throw new HttpsError('already-exists', 'Command identity is already assigned.'); return value.result; }
        if (!receiptSnapshot.exists) throw new HttpsError('not-found', 'Supplier receipt was not found.');
        const receipt = receiptSnapshot.data()!; if (receipt.vendorId !== vendorId || receipt.tenantId !== vendorId) throw new HttpsError('permission-denied', 'Receipt belongs to another tenant.');
        if (receipt.status === 'REVERSED') throw new HttpsError('failed-precondition', 'Supplier receipt is already reversed.');
        if (receipt.status !== 'POSTED') throw new HttpsError('failed-precondition', 'Only a posted supplier receipt can be reversed.');
        const receiptLines = lines(receipt.lines); const warehouseId = String(receipt.warehouseId); const supplierId = String(receipt.supplierId); const purchaseOrderId = String(receipt.purchaseOrderId);
        const refs = [firestore.doc(`vendors/${vendorId}/warehouses/${warehouseId}`), firestore.doc(`vendors/${vendorId}/purchase_orders/${purchaseOrderId}`),
          ...receiptLines.map(line => firestore.doc(`vendors/${vendorId}/products/${line.productId}`)),
          ...receiptLines.map(line => firestore.doc(`vendors/${vendorId}/inventory_balances/${deterministicInventoryBalanceId({ tenantId: vendorId, vendorId, stockLocationId: warehouseId, productId: line.productId })}`)),
          ...receiptLines.map(line => firestore.doc(`vendors/${vendorId}/warehouse_inventory/${vendorId}_${warehouseId}_${line.productId}`)),
          ...(receipt.movementIds as string[]).map(id => firestore.doc(`vendors/${vendorId}/inventory_movements/${id}`)),
          ...receiptLines.flatMap(line => (['ON_HAND', 'DAMAGED', 'QUARANTINED'] as const).map(bucket => firestore.doc(`vendors/${vendorId}/inventory_movements/${safeId(`supplier-receipt-reversal:${receiptId}:${line.lineId}:${bucket}`)}`))),
        ];
        const snapshots = await tx.getAll(...refs); let cursor = 0; const warehouseSnapshot = snapshots[cursor++]; const orderSnapshot = snapshots[cursor++];
        if (!warehouseSnapshot.exists || !orderSnapshot.exists) throw new HttpsError('not-found', 'Receipt warehouse or purchase order was not found.');
        assertWarehouseDestination(vendorId, warehouseId, 'WAREHOUSE', { id: warehouseId, ...warehouseSnapshot.data() }, member);
        const productSnapshots = snapshots.slice(cursor, cursor + receiptLines.length); cursor += receiptLines.length;
        productSnapshots.forEach((snapshot, index) => { if (!snapshot.exists) throw new HttpsError('not-found', `Product ${receiptLines[index].productId} was not found.`); });
        const canonicalSnapshots = snapshots.slice(cursor, cursor + receiptLines.length); cursor += receiptLines.length;
        const legacySnapshots = snapshots.slice(cursor, cursor + receiptLines.length); cursor += receiptLines.length;
        const originals = snapshots.slice(cursor, cursor + (receipt.movementIds as string[]).length); cursor += (receipt.movementIds as string[]).length;
        if (originals.some(snapshot => !snapshot.exists)) throw new HttpsError('failed-precondition', 'Original immutable inventory movement is missing.');
        const reversalSnapshots = snapshots.slice(cursor); const now = new Date().toISOString(); const warehouse = warehouseLocation(vendorId, warehouseId, warehouseSnapshot.data()!);
        const balanceMap = new Map<string, InventoryBalance>(); const legacyMap = new Map<string, Data>(); const movementMap = new Map<string, InventoryMovement>();
        receiptLines.forEach((line, index) => { const canonical = canonicalSnapshots[index].data() as InventoryBalance | undefined; const legacy = legacySnapshots[index].data() as Data | undefined;
          if (!canonical && !legacy) throw new HttpsError('failed-precondition', 'Inventory balance required for reversal was not found.'); legacyMap.set(line.productId, legacy || {});
          balanceMap.set(line.productId, canonical || { ...emptyInventoryBalance({ tenantId: vendorId, vendorId, stockLocationId: warehouseId, productId: line.productId }, now), onHandQty: Number(legacy!.quantity || 0),
            reservedQty: Number(legacy!.reservedQuantity || 0), inTransitQty: Number(legacy!.inTransitQuantity || 0), quarantinedQty: Number(legacy!.quarantinedQuantity || 0), damagedQty: Number(legacy!.damagedQuantity || 0), version: Number(legacy!.version || 0), updatedAt: String(legacy!.lastUpdated || now) }); });
        reversalSnapshots.forEach(snapshot => { if (snapshot.exists) { const movement = snapshot.data() as InventoryMovement; movementMap.set(movement.idempotencyKey, movement); } });
        const updatedOrder = reversePurchaseOrderReceipt(orderSnapshot.data() as PurchaseOrderDocument, receiptLines.map(line => ({ lineId: line.lineId, productId: line.productId, quantity: line.deliveredQuantity })), member.userUid, commandId, now, reason);
        const originalByKey = new Map(originals.map(snapshot => { const movement = snapshot.data() as InventoryMovement; return [`${movement.productId}:${movement.quantityBucket || 'ON_HAND'}`, movement]; }));
        const repository = inventoryRepository(tx, firestore, vendorId, warehouse, balanceMap, legacyMap, movementMap); const engine = new InventoryPostingEngine(repository, async () => true, () => now); const reversalMovementIds: string[] = [];
        for (const line of receiptLines) for (const [bucket, quantity] of [['ON_HAND', line.acceptedQuantity], ['DAMAGED', line.damagedQuantity], ['QUARANTINED', line.quarantinedQuantity]] as Array<[InventoryQuantityBucket, number]>) {
          if (quantity <= 0) continue; const original = originalByKey.get(`${line.productId}:${bucket}`); if (!original) throw new HttpsError('failed-precondition', 'Original disposition movement is missing.');
          const idempotencyKey = `supplier-receipt-reversal:${receiptId}:${line.lineId}:${bucket}`; const movementId = safeId(idempotencyKey);
          const posted = await engine.post({ commandId: movementId, idempotencyKey, tenantId: vendorId, vendorId, productId: line.productId, movementType: 'SUPPLIER_RECEIPT_REVERSAL', quantity,
            quantityBucket: bucket, sourceLocationId: warehouseId, referenceType: 'SUPPLIER_STOCK_RECEIPT_REVERSAL', referenceId: receiptId, actorId: member.userUid,
            occurredAt: now, correlationId: receiptId, reasonCode: reason, reversalOfMovementId: original.id }); reversalMovementIds.push(posted.movement.id);
        }
        maybeFail(data, 'AFTER_INVENTORY'); tx.set(firestore.doc(`vendors/${vendorId}/purchase_orders/${purchaseOrderId}`), clean(updatedOrder)); maybeFail(data, 'AFTER_PURCHASE_ORDER');
        const updatedReceipt = clean({ ...receipt, status: 'REVERSED', reversal: { commandId, reason, reversedBy: member.userUid, reversedAt: now, movementIds: reversalMovementIds }, updatedAt: now, version: Number(receipt.version || 1) + 1 });
        tx.set(receiptRef, updatedReceipt); event(tx, firestore, vendorId, receiptId, warehouseId, supplierId, member.userUid, commandId, 'SUPPLIER_RECEIPT_REVERSED', now, reason);
        const result = { receipt: updatedReceipt, purchaseOrder: updatedOrder, duplicate: false }; tx.create(commandRef, clean({ tenantId: vendorId, vendorId, receiptId, purchaseOrderId, action: 'REVERSE', commandId, actorId: member.userUid, createdAt: now, result }));
        maybeFail(data, 'AFTER_EVENTS'); return result;
      });
    } catch (error) { return mapError(error); }
  });
  return { postSupplierReceipt, reverseSupplierReceipt };
}
