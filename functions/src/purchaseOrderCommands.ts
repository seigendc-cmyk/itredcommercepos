import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  ApprovalPolicy,
  applyPurchaseOrderReceipt,
  assertApprovalAllowed,
  assertProcurementAuthority,
  assertSupplier,
  assertWarehouseDestination,
  amendDraftPurchaseOrder,
  calculateCommercialLines,
  cancelPurchaseOrderDocument,
  CommercialLineInput,
  ProcurementMembership,
  ProductSnapshot,
  PurchaseOrderDocument,
  PurchaseOrderError,
  PurchaseOrderPermission,
  transitionPurchaseOrder,
} from './purchaseOrderLifecycle.js';

type Data = Record<string, unknown>;

export function resolvePurchaseOrderCommandReplay(existing: Data | null, action: string, id: string): unknown | undefined {
  if (!existing) return undefined;
  if (existing.action !== action || existing.commandId !== id) {
    throw new HttpsError('already-exists', 'The command identity is already assigned to another procurement action.');
  }
  return existing.result;
}

function requiredString(data: Data, key: string): string {
  const value = String(data[key] ?? '').trim();
  if (!value) throw new HttpsError('invalid-argument', `${key} is required.`);
  return value;
}

function commandId(data: Data): string {
  return requiredString({ commandId: data.commandId ?? data.idempotencyKey }, 'commandId');
}

function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, clean(item)])) as T;
  return value;
}

function safeId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}_${(hash >>> 0).toString(16)}`;
}

function mapError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof PurchaseOrderError) {
    const code = error.code === 'unauthenticated' ? 'unauthenticated'
      : ['non_member', 'wrong_tenant', 'missing_permission', 'self_approval_forbidden', 'approval_threshold_exceeded'].includes(error.code) ? 'permission-denied'
        : ['invalid_transition', 'stale_decision', 'commercial_history_immutable', 'over_receipt', 'inactive_warehouse', 'unlicensed_warehouse'].includes(error.code) ? 'failed-precondition'
          : error.code === 'invalid_product' || error.code === 'invalid_supplier' || error.code === 'invalid_destination' ? 'not-found'
            : 'invalid-argument';
    throw new HttpsError(code, error.message, { reasonCode: error.code });
  }
  throw new HttpsError('internal', 'The purchase-order command failed.');
}

async function recordFailure(
  firestore: Firestore,
  error: unknown,
  uid: string | undefined,
  vendorId: string,
  action: string,
  id: string,
  purchaseOrderId?: string,
): Promise<never> {
  if (uid) {
    try {
      const membership = await firestore.doc(`vendors/${vendorId}/memberships/${uid}`).get();
      const member = membership.data() as Partial<ProcurementMembership> | undefined;
      if (membership.exists && member?.tenantId === vendorId && member.vendorId === vendorId && member.userUid === uid) {
        const orderSnapshot = purchaseOrderId ? await firestore.doc(`vendors/${vendorId}/purchase_orders/${purchaseOrderId}`).get() : null;
        const order = orderSnapshot?.data() as Partial<PurchaseOrderDocument> | undefined;
        const failed = !(error instanceof PurchaseOrderError) && !(error instanceof HttpsError && error.code !== 'internal');
        const eventType = failed ? 'PURCHASE_ORDER_COMMAND_FAILED' : 'PURCHASE_ORDER_COMMAND_BLOCKED';
        const eventId = safeId(`${eventType}:${id}`);
        const now = new Date().toISOString();
        const body = clean({
          id: eventId, eventId, eventType, eventVersion: 1, tenantId: vendorId, vendorId,
          supplierId: order?.supplierId, warehouseId: order?.destinationWarehouseId,
          userId: uid, actorId: uid, purchaseOrderId, entityType: 'PURCHASE_ORDER', entityId: purchaseOrderId,
          action, commandId: id, idempotencyKey: id, outcome: failed ? 'FAILED' : 'BLOCKED',
          reasonCode: error instanceof PurchaseOrderError ? error.code : error instanceof HttpsError ? error.code : 'internal',
          amount: order?.total, currency: order?.currency, occurredAt: now, recordedAt: now, offlineEvent: false,
        });
        await Promise.allSettled([
          firestore.doc(`vendors/${vendorId}/audit_events/${eventId}`).create(body),
          firestore.doc(`vendors/${vendorId}/bi_events/${eventId}`).create(body),
        ]);
      }
    } catch {
      // Failure logging must never replace the command's canonical error.
    }
  }
  return mapError(error);
}

async function authority(
  tx: Transaction,
  firestore: Firestore,
  uid: string | undefined,
  vendorId: string,
  permission: PurchaseOrderPermission | PurchaseOrderPermission[],
): Promise<ProcurementMembership> {
  const choices = Array.isArray(permission) ? permission : [permission];
  if (!uid) return assertProcurementAuthority(uid, vendorId, null, choices[0]);
  const snapshot = await tx.get(firestore.doc(`vendors/${vendorId}/memberships/${uid}`));
  const membership = snapshot.exists ? snapshot.data() as ProcurementMembership : null;
  const selected = choices.find(candidate => membership?.permissions?.includes(candidate)) || choices[0];
  const resolved = assertProcurementAuthority(uid, vendorId, membership, selected);
  const role = await tx.get(firestore.doc(`vendors/${vendorId}/roles/${resolved.roleId}`));
  if (role.exists && ['suspended', 'archived', 'inactive'].includes(String(role.data()!.status || 'active').toLowerCase())) {
    throw new PurchaseOrderError('non_member', 'The assigned procurement role is not active.');
  }
  return resolved;
}

function event(
  tx: Transaction,
  firestore: Firestore,
  order: PurchaseOrderDocument,
  eventType: string,
  actorId: string,
  command: string,
  outcome: string,
  now: string,
  reasonCode?: string,
): void {
  const eventId = safeId(`${eventType}:${command}`);
  const body = clean({
    eventId,
    id: eventId,
    eventType,
    eventVersion: 1,
    tenantId: order.tenantId,
    vendorId: order.vendorId,
    supplierId: order.supplierId,
    warehouseId: order.destinationWarehouseId,
    userId: actorId,
    actorId,
    purchaseOrderId: order.purchaseOrderId,
    entityType: 'PURCHASE_ORDER',
    entityId: order.purchaseOrderId,
    action: eventType,
    commandId: command,
    idempotencyKey: command,
    outcome,
    reasonCode,
    amount: order.total,
    currency: order.currency,
    occurredAt: now,
    recordedAt: now,
    offlineEvent: false,
  });
  tx.create(firestore.doc(`vendors/${order.vendorId}/audit_events/${eventId}`), body);
  tx.create(firestore.doc(`vendors/${order.vendorId}/bi_events/${eventId}`), body);
}

async function priorCommand(
  tx: Transaction,
  firestore: Firestore,
  vendorId: string,
  action: string,
  id: string,
): Promise<{ ref: FirebaseFirestore.DocumentReference; result?: unknown }> {
  const ref = firestore.doc(`vendors/${vendorId}/purchase_order_commands/${safeId(id)}`);
  const snapshot = await tx.get(ref);
  if (!snapshot.exists) return { ref };
  return { ref, result: resolvePurchaseOrderCommandReplay(snapshot.data()!, action, id) };
}

function recordCommand(
  tx: Transaction,
  ref: FirebaseFirestore.DocumentReference,
  vendorId: string,
  purchaseOrderId: string,
  action: string,
  id: string,
  actorId: string,
  now: string,
  result: unknown,
): void {
  tx.create(ref, clean({ tenantId: vendorId, vendorId, purchaseOrderId, action, commandId: id, actorId, createdAt: now, result }));
}

function asLines(data: Data): CommercialLineInput[] {
  const value = data.lines ?? data.items;
  if (!Array.isArray(value)) throw new HttpsError('invalid-argument', 'lines are required.');
  return value as CommercialLineInput[];
}

async function loadCommercial(
  tx: Transaction,
  firestore: Firestore,
  vendorId: string,
  inputs: CommercialLineInput[],
  policy: ApprovalPolicy = {},
) {
  const products: ProductSnapshot[] = [];
  for (const input of inputs) {
    const productId = String(input.productId || '').trim();
    if (!productId) throw new PurchaseOrderError('invalid_product', 'Every line requires a productId.');
    const snapshot = await tx.get(firestore.doc(`vendors/${vendorId}/products/${productId}`));
    if (!snapshot.exists) throw new PurchaseOrderError('invalid_product', `Product ${productId} does not exist.`);
    products.push({ id: snapshot.id, ...snapshot.data() } as ProductSnapshot);
  }
  return calculateCommercialLines(vendorId, inputs, products, policy);
}

async function loadOrder(tx: Transaction, firestore: Firestore, vendorId: string, purchaseOrderId: string) {
  const ref = firestore.doc(`vendors/${vendorId}/purchase_orders/${purchaseOrderId}`);
  const snapshot = await tx.get(ref);
  if (!snapshot.exists) throw new HttpsError('not-found', 'Purchase order not found.');
  const order = snapshot.data() as PurchaseOrderDocument;
  if (order.tenantId !== vendorId || order.vendorId !== vendorId || order.purchaseOrderId !== purchaseOrderId) throw new PurchaseOrderError('wrong_tenant', 'Purchase order tenant ownership is invalid.');
  return { ref, order };
}

export function createPurchaseOrderCallables(firestore: Firestore) {
  const createPurchaseOrder = onCall(async request => {
    const data = request.data as Data;
    const vendorId = requiredString(data, 'vendorId');
    const id = commandId(data);
    const supplierId = requiredString(data, 'supplierId');
    const warehouseId = requiredString(data, 'destinationWarehouseId');
    const currency = requiredString(data, 'currency');
    const inputs = asLines(data);
    const orderRef = firestore.collection(`vendors/${vendorId}/purchase_orders`).doc();
    try {
      return await firestore.runTransaction(async tx => {
        const member = await authority(tx, firestore, request.auth?.uid, vendorId, 'purchase_order.create');
        const prior = await priorCommand(tx, firestore, vendorId, 'CREATE', id);
        if (prior.result) return prior.result;
        const [warehouse, supplier] = await Promise.all([
          tx.get(firestore.doc(`vendors/${vendorId}/warehouses/${warehouseId}`)),
          tx.get(firestore.doc(`vendors/${vendorId}/suppliers/${supplierId}`)),
        ]);
        assertWarehouseDestination(vendorId, warehouseId, data.destinationLocationType, warehouse.exists ? { id: warehouse.id, ...warehouse.data() } : null, member);
        assertSupplier(vendorId, supplierId, supplier.exists ? { id: supplier.id, ...supplier.data() } : null);
        const policySnapshot = await tx.get(firestore.doc(`vendors/${vendorId}/settings/purchasing_approval_policy`));
        const commercial = await loadCommercial(tx, firestore, vendorId, inputs, (policySnapshot.data() || {}) as ApprovalPolicy);
        const now = new Date().toISOString();
        const order: PurchaseOrderDocument = clean({
          purchaseOrderId: orderRef.id,
          id: orderRef.id,
          tenantId: vendorId,
          vendorId,
          supplierId,
          supplierName: String(supplier.data()!.name || supplierId),
          destinationWarehouseId: warehouseId,
          destinationWarehouseName: String(warehouse.data()!.name || warehouseId),
          destinationLocationType: 'WAREHOUSE',
          currency,
          status: 'DRAFT',
          version: 1,
          orderNumber: `PO-${now.slice(0, 10).replaceAll('-', '')}-${orderRef.id.slice(-6).toUpperCase()}`,
          ...commercial,
          items: commercial.lines,
          createdBy: member.userUid,
          createdAt: now,
          updatedAt: now,
          notes: String(data.notes || '').trim(),
          expectedDeliveryDate: data.expectedDeliveryDate ? String(data.expectedDeliveryDate) : undefined,
          paymentTerms: data.paymentTerms ? String(data.paymentTerms) : undefined,
          statusHistory: [{ from: null, to: 'DRAFT', actorId: member.userUid, commandId: id, occurredAt: now }],
        });
        tx.create(orderRef, order);
        recordCommand(tx, prior.ref, vendorId, order.purchaseOrderId, 'CREATE', id, member.userUid, now, order);
        event(tx, firestore, order, 'PURCHASE_ORDER_CREATED', member.userUid, id, 'COMPLETED', now);
        return order;
      });
    } catch (error) { return recordFailure(firestore, error, request.auth?.uid, vendorId, 'CREATE', id); }
  });

  const amendPurchaseOrder = onCall(async request => {
    const data = request.data as Data; const vendorId = requiredString(data, 'vendorId'); const purchaseOrderId = requiredString(data, 'purchaseOrderId'); const id = commandId(data); const inputs = asLines(data);
    try {
      return await firestore.runTransaction(async tx => {
        const member = await authority(tx, firestore, request.auth?.uid, vendorId, 'purchase_order.create');
        const prior = await priorCommand(tx, firestore, vendorId, 'AMEND_DRAFT', id); if (prior.result) return prior.result;
        const { ref, order } = await loadOrder(tx, firestore, vendorId, purchaseOrderId);
        const policySnapshot = await tx.get(firestore.doc(`vendors/${vendorId}/settings/purchasing_approval_policy`));
        const commercial = await loadCommercial(tx, firestore, vendorId, inputs, (policySnapshot.data() || {}) as ApprovalPolicy); const now = new Date().toISOString();
        const updated = amendDraftPurchaseOrder(order, commercial, member.userUid, Number(data.expectedVersion), now);
        tx.set(ref, clean(updated)); recordCommand(tx, prior.ref, vendorId, purchaseOrderId, 'AMEND_DRAFT', id, member.userUid, now, updated); return updated;
      });
    } catch (error) { return recordFailure(firestore, error, request.auth?.uid, vendorId, 'AMEND_DRAFT', id, purchaseOrderId); }
  });

  const submitPurchaseOrder = onCall(async request => {
    const data = request.data as Data; const vendorId = requiredString(data, 'vendorId'); const purchaseOrderId = requiredString(data, 'purchaseOrderId'); const id = commandId(data);
    try {
      return await firestore.runTransaction(async tx => {
        const member = await authority(tx, firestore, request.auth?.uid, vendorId, 'purchase_order.create');
        const prior = await priorCommand(tx, firestore, vendorId, 'SUBMIT', id); if (prior.result) return prior.result;
        const { ref, order } = await loadOrder(tx, firestore, vendorId, purchaseOrderId);
        if (order.version !== Number(data.expectedVersion)) throw new PurchaseOrderError('stale_decision', 'The purchase order changed before submission.');
        const now = new Date().toISOString();
        const submitted = transitionPurchaseOrder(order, 'SUBMITTED', member.userUid, id, now);
        const pending = { ...transitionPurchaseOrder(submitted, 'PENDING_APPROVAL', member.userUid, id, now), submittedBy: member.userUid, submittedAt: now };
        const approvalRef = firestore.doc(`vendors/${vendorId}/approval_requests/po_${purchaseOrderId}`);
        const approval = clean({
          id: approvalRef.id, approvalRequestId: approvalRef.id, tenantId: vendorId, vendorId,
          entityType: 'PURCHASE_ORDER', resourceType: 'PURCHASE_ORDER', entityId: purchaseOrderId, resourceId: purchaseOrderId,
          requestedAction: 'APPROVE_PURCHASE_ORDER', requesterId: member.userUid, requesterRole: member.roleId,
          requester: { id: member.userUid, name: member.userUid, role: member.roleId }, requesterName: member.userUid,
          warehouseId: order.destinationWarehouseId, financialEffect: order.total, currency: order.currency,
          resourceVersion: pending.version, version: 1, status: 'PENDING_APPROVAL', segregationOfDuties: true,
          notificationAudienceRoles: ['sysadmin', 'manager', 'approver'], requiredApprovalCount: 1,
          title: `Approve purchase order ${order.orderNumber}`, description: `${order.supplierName} · ${order.currency} ${order.total.toFixed(2)}`,
          requestedAt: now, createdAt: now, updatedAt: now, correlationId: id,
          dataPayload: { purchaseOrderId, purchaseOrderNumber: order.orderNumber, supplierId: order.supplierId, supplierName: order.supplierName, items: order.lines.map(line => ({ ...line, productName: line.description, quantity: line.orderedQuantity })) },
        });
        tx.set(ref, clean(pending)); tx.create(approvalRef, approval);
        recordCommand(tx, prior.ref, vendorId, purchaseOrderId, 'SUBMIT', id, member.userUid, now, pending);
        event(tx, firestore, submitted, 'PURCHASE_ORDER_SUBMITTED', member.userUid, id, 'COMPLETED', now);
        event(tx, firestore, pending, 'PURCHASE_ORDER_APPROVAL_REQUESTED', member.userUid, id, 'COMPLETED', now);
        return pending;
      });
    } catch (error) { return recordFailure(firestore, error, request.auth?.uid, vendorId, 'SUBMIT', id, purchaseOrderId); }
  });

  async function decide(request: { data: unknown; auth?: { uid: string } }, decision: 'APPROVED' | 'REJECTED') {
    const data = request.data as Data; const vendorId = requiredString(data, 'vendorId'); const purchaseOrderId = requiredString(data, 'purchaseOrderId'); const id = commandId(data); const reason = String(data.reason || '').trim();
    if (decision === 'REJECTED' && !reason) throw new HttpsError('invalid-argument', 'A rejection reason is required.');
    try {
      return await firestore.runTransaction(async tx => {
        const member = await authority(tx, firestore, request.auth?.uid, vendorId, 'purchase_order.approve');
        const prior = await priorCommand(tx, firestore, vendorId, decision, id); if (prior.result) return prior.result;
        const { ref, order } = await loadOrder(tx, firestore, vendorId, purchaseOrderId);
        const approvalRef = firestore.doc(`vendors/${vendorId}/approval_requests/${String(data.approvalRequestId || `po_${purchaseOrderId}`)}`);
        const approvalSnapshot = await tx.get(approvalRef); if (!approvalSnapshot.exists) throw new HttpsError('not-found', 'Purchase-order approval request not found.');
        const approval = approvalSnapshot.data()!;
        if (approval.status !== 'PENDING_APPROVAL' || Number(approval.version) !== Number(data.expectedApprovalVersion) || Number(approval.resourceVersion) !== order.version) throw new PurchaseOrderError('stale_decision', 'The approval request or purchase order is stale.');
        const policySnapshot = await tx.get(firestore.doc(`vendors/${vendorId}/settings/purchasing_approval_policy`));
        const fallbackSnapshot = policySnapshot.exists ? null : await tx.get(firestore.doc(`vendors/${vendorId}/settings/inventory_approval_policy`));
        const policy = (policySnapshot.exists ? policySnapshot.data() : fallbackSnapshot?.data() || {}) as ApprovalPolicy;
        assertApprovalAllowed(order, member, policy, order.version);
        const now = new Date().toISOString();
        const updated = decision === 'APPROVED'
          ? { ...transitionPurchaseOrder(order, 'APPROVED', member.userUid, id, now, reason || undefined), approvedBy: member.userUid, approvedAt: now, approvedCommercialSnapshot: { lines: order.lines, subtotal: order.subtotal, discountTotal: order.discountTotal, tax: order.tax, total: order.total, currency: order.currency } }
          : { ...transitionPurchaseOrder(order, 'REJECTED', member.userUid, id, now, reason), rejectedBy: member.userUid, rejectedAt: now, rejectionReason: reason };
        const approvalUpdated = { ...approval, status: decision === 'APPROVED' ? 'COMPLETED' : 'REJECTED', outcome: decision, version: Number(approval.version) + 1, reviewedBy: member.userUid, reviewedAt: now, decisionAt: now, reason, updatedAt: now };
        tx.set(ref, clean(updated)); tx.set(approvalRef, clean(approvalUpdated));
        recordCommand(tx, prior.ref, vendorId, purchaseOrderId, decision, id, member.userUid, now, approvalUpdated);
        event(tx, firestore, updated, decision === 'APPROVED' ? 'PURCHASE_ORDER_APPROVED' : 'PURCHASE_ORDER_REJECTED', member.userUid, id, decision, now, reason || undefined);
        return approvalUpdated;
      });
    } catch (error) { return recordFailure(firestore, error, request.auth?.uid, vendorId, decision, id, purchaseOrderId); }
  }

  const approvePurchaseOrder = onCall(request => decide(request, 'APPROVED'));
  const rejectPurchaseOrder = onCall(request => decide(request, 'REJECTED'));

  function stateCommand(action: 'ISSUE' | 'CLOSE' | 'CANCEL') {
    return onCall(async request => {
      const data = request.data as Data; const vendorId = requiredString(data, 'vendorId'); const purchaseOrderId = requiredString(data, 'purchaseOrderId'); const id = commandId(data); const reason = String(data.reason || '').trim();
      try {
        return await firestore.runTransaction(async tx => {
          const permission: PurchaseOrderPermission | PurchaseOrderPermission[] = action === 'CANCEL' ? ['purchase_order.create', 'purchase_order.approve'] : 'purchase_order.approve';
          const member = await authority(tx, firestore, request.auth?.uid, vendorId, permission);
          const prior = await priorCommand(tx, firestore, vendorId, action, id); if (prior.result) return prior.result;
          const { ref, order } = await loadOrder(tx, firestore, vendorId, purchaseOrderId); const now = new Date().toISOString();
          if (action === 'CANCEL') {
            const required = ['DRAFT', 'SUBMITTED'].includes(order.status) ? 'purchase_order.create' : 'purchase_order.approve';
            if (!member.permissions.includes(required)) throw new PurchaseOrderError('missing_permission', `Permission ${required} is required to cancel a ${order.status} purchase order.`);
          }
          const approvalRef = firestore.doc(`vendors/${vendorId}/approval_requests/po_${purchaseOrderId}`);
          const approval = action === 'CANCEL' ? await tx.get(approvalRef) : null;
          let updated: PurchaseOrderDocument;
          if (action === 'ISSUE') updated = { ...transitionPurchaseOrder(order, 'ISSUED', member.userUid, id, now), issuedBy: member.userUid, issuedAt: now };
          else if (action === 'CLOSE') updated = { ...transitionPurchaseOrder(order, 'CLOSED', member.userUid, id, now, reason || undefined), closedBy: member.userUid, closedAt: now };
          else updated = cancelPurchaseOrderDocument(order, member.userUid, id, reason, now);
          tx.set(ref, clean(updated));
          if (approval?.exists && approval.data()!.status === 'PENDING_APPROVAL') {
            tx.set(approvalRef, { ...approval.data(), status: 'CANCELLED', outcome: 'CANCELLED', reason, version: Number(approval.data()!.version || 0) + 1, updatedAt: now });
          }
          recordCommand(tx, prior.ref, vendorId, purchaseOrderId, action, id, member.userUid, now, updated);
          event(tx, firestore, updated, `PURCHASE_ORDER_${action === 'ISSUE' ? 'ISSUED' : action === 'CLOSE' ? 'CLOSED' : 'CANCELLED'}`, member.userUid, id, action === 'CANCEL' ? 'CANCELLED' : 'COMPLETED', now, reason || undefined);
          return updated;
        });
      } catch (error) { return recordFailure(firestore, error, request.auth?.uid, vendorId, action, id, purchaseOrderId); }
    });
  }

  const recordPurchaseOrderReceipt = onCall(async request => {
    const data = request.data as Data; const vendorId = requiredString(data, 'vendorId'); const purchaseOrderId = requiredString(data, 'purchaseOrderId'); const id = commandId(data);
    try {
      return await firestore.runTransaction(async tx => {
        const member = await authority(tx, firestore, request.auth?.uid, vendorId, 'receiving.approve');
        const prior = await priorCommand(tx, firestore, vendorId, 'RECORD_RECEIPT', id); if (prior.result) return prior.result;
        const { ref, order } = await loadOrder(tx, firestore, vendorId, purchaseOrderId);
        if (String(data.supplierId || order.supplierId) !== order.supplierId || String(data.destinationWarehouseId || order.destinationWarehouseId) !== order.destinationWarehouseId) throw new PurchaseOrderError('wrong_tenant', 'Receipt supplier or warehouse does not match purchase-order authority.');
        let overReceiptApproved = false;
        if (data.overReceiptApprovalId) {
          const approval = await tx.get(firestore.doc(`vendors/${vendorId}/approval_requests/${String(data.overReceiptApprovalId)}`));
          const decision = approval.data();
          overReceiptApproved = approval.exists && ['APPROVED', 'COMPLETED'].includes(String(decision?.status)) && (decision?.status === 'APPROVED' || decision?.outcome === 'APPROVED') && decision?.resourceId === purchaseOrderId && decision?.requestedAction === 'ALLOW_OVER_RECEIPT';
        }
        const now = new Date().toISOString();
        const updated = applyPurchaseOrderReceipt(order, data.receipts as Array<{ lineId?: string; productId?: string; quantity: number }>, overReceiptApproved, member.userUid, id, now);
        tx.set(ref, clean(updated)); recordCommand(tx, prior.ref, vendorId, purchaseOrderId, 'RECORD_RECEIPT', id, member.userUid, now, updated);
        event(tx, firestore, updated, updated.status === 'RECEIVED' ? 'PURCHASE_ORDER_RECEIVED' : 'PURCHASE_ORDER_PARTIALLY_RECEIVED', member.userUid, id, 'COMPLETED', now);
        return updated;
      });
    } catch (error) { return recordFailure(firestore, error, request.auth?.uid, vendorId, 'RECORD_RECEIPT', id, purchaseOrderId); }
  });

  return {
    createPurchaseOrder,
    amendPurchaseOrder,
    submitPurchaseOrder,
    approvePurchaseOrder,
    rejectPurchaseOrder,
    cancelPurchaseOrder: stateCommand('CANCEL'),
    issuePurchaseOrder: stateCommand('ISSUE'),
    closePurchaseOrder: stateCommand('CLOSE'),
    recordPurchaseOrderReceipt,
  };
}
