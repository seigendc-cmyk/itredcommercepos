import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { applyDiscrepancy, applyReceipt, outstandingQuantity, TransferDiscrepancyType, transferReconciles } from './transferAccounting.js';
import { createPurchaseOrderCallables } from './purchaseOrderCommands.js';
import { createSupplierReceiptCallables } from './supplierReceiptCommands.js';
import { createStocktakeCallables } from './stocktakeCommands.js';
import { createStocktakeReversalCallable } from './stocktakeReversalCommands.js';
import { createSaleCallable } from './saleCommands.js';

initializeApp();
const firestore = getFirestore();

export const {
  createPurchaseOrder, amendPurchaseOrder, submitPurchaseOrder, approvePurchaseOrder, rejectPurchaseOrder,
  cancelPurchaseOrder, issuePurchaseOrder, closePurchaseOrder, recordPurchaseOrderReceipt,
} = createPurchaseOrderCallables(firestore);
export const { postSupplierReceipt, reverseSupplierReceipt } = createSupplierReceiptCallables(firestore);
export const { createStocktake, openStocktake, submitStocktakeCount, submitStocktake, approveStocktake, rejectStocktake, postStocktakeAdjustment, closeStocktake, cancelStocktake } = createStocktakeCallables(firestore);
export const reverseStocktakeAdjustment = createStocktakeReversalCallable(firestore);
export const completeSale = createSaleCallable(firestore);

type Data = Record<string, unknown>;
type Membership = { status: string; roleId: string; permissions: string[]; assignedWarehouseIds: string[]; assignedBranchIds: string[] };

function requiredString(data: Data, key: string): string {
  const value = String(data[key] ?? '').trim();
  if (!value) throw new HttpsError('invalid-argument', `${key} is required.`);
  return value;
}

async function authority(uid: string | undefined, vendorId: string, permission: string): Promise<Membership> {
  if (!uid) throw new HttpsError('unauthenticated', 'Firebase authentication is required.');
  const snap = await firestore.doc(`vendors/${vendorId}/memberships/${uid}`).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Active tenant membership is required.');
  const member = snap.data() as Membership;
  if (member.status !== 'ACTIVE' || !Array.isArray(member.permissions) || !member.permissions.includes(permission)) {
    throw new HttpsError('permission-denied', `Permission ${permission} is required.`);
  }
  return member;
}

function assigned(member: Membership, type: 'warehouse' | 'branch', id: string): boolean {
  return member.permissions.includes('location.all') ||
    (type === 'warehouse' ? member.assignedWarehouseIds : member.assignedBranchIds).includes(id);
}

function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)])) as T;
  return value;
}

async function validateRoute(tx: Transaction, vendorId: string, transfer: Data, member: Membership): Promise<void> {
  const sourceWarehouseId = String(transfer.sourceWarehouseId || '');
  const sourceBranchId = String(transfer.sourceBranchId || '');
  const targetBranchId = String(transfer.targetBranchId || '');
  const sourceId = sourceWarehouseId || sourceBranchId;
  if (!sourceId || !targetBranchId || sourceId === targetBranchId) throw new HttpsError('failed-precondition', 'Transfer route is invalid.');
  const sourceType = sourceWarehouseId ? 'warehouse' : 'branch';
  const [source, destination] = await Promise.all([
    tx.get(firestore.doc(`vendors/${vendorId}/${sourceType === 'warehouse' ? 'warehouses' : 'branches'}/${sourceId}`)),
    tx.get(firestore.doc(`vendors/${vendorId}/branches/${targetBranchId}`)),
  ]);
  if (!source.exists || !destination.exists) throw new HttpsError('not-found', 'Transfer locations were not found.');
  const active = (doc: Data) => !['suspended', 'archived', 'inactive'].includes(String(doc.status).toLowerCase()) && String(doc.licenseStatus || 'licensed').toLowerCase() === 'licensed';
  if (String(source.data()!.vendorId) !== vendorId || String(destination.data()!.vendorId) !== vendorId || !active(source.data()!) || !active(destination.data()!)) {
    throw new HttpsError('failed-precondition', 'Transfer locations must be active, licensed, and tenant-owned.');
  }
  if (!assigned(member, sourceType, sourceId) || !assigned(member, 'branch', targetBranchId)) throw new HttpsError('permission-denied', 'Transfer location assignment is required.');
}

function balanceRef(vendorId: string, type: 'warehouse' | 'branch', locationId: string, productId: string) {
  return firestore.doc(`vendors/${vendorId}/${type === 'warehouse' ? 'warehouse_inventory' : 'branch_inventory'}/${vendorId}_${locationId}_${productId}`);
}

function movementRef(vendorId: string, key: string) {
  return firestore.doc(`vendors/${vendorId}/inventory_movements/${encodeURIComponent(key).replace(/%/g, '_')}`);
}

function event(tx: Transaction, vendorId: string, transferId: string, type: string, uid: string, details: Data = {}) {
  const id = `${type.toLowerCase()}_${transferId}_${String(details.commandKey || 'state').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const body = clean({ id, tenantId: vendorId, vendorId, transferId, eventType: type, actorId: uid, occurredAt: new Date().toISOString(), details });
  tx.set(firestore.doc(`vendors/${vendorId}/audit_events/${id}`), body);
  tx.set(firestore.doc(`vendors/${vendorId}/bi_events/${id}`), body);
}

export const dispatchTransfer = onCall(async request => {
  const data = request.data as Data; const vendorId = requiredString(data, 'vendorId'); const transferId = requiredString(data, 'transferId'); const commandKey = requiredString(data, 'idempotencyKey');
  const member = await authority(request.auth?.uid, vendorId, 'transfer.dispatch'); const uid = request.auth!.uid;
  return firestore.runTransaction(async tx => {
    const transferRef = firestore.doc(`vendors/${vendorId}/transfers/${transferId}`); const snap = await tx.get(transferRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Transfer not found.'); const transfer = snap.data()!;
    await validateRoute(tx, vendorId, transfer, member);
    if (transfer.dispatchIdempotencyKey === commandKey && ['IN_TRANSIT', 'RECEIVING', 'RECEIVED', 'COMPLETED'].includes(String(transfer.status))) return transfer;
    if (transfer.status !== 'APPROVED') throw new HttpsError('failed-precondition', 'Only an approved transfer can be dispatched.');
    const sourceType = transfer.sourceWarehouseId ? 'warehouse' : 'branch'; const sourceId = String(transfer.sourceWarehouseId || transfer.sourceBranchId); const destinationId = String(transfer.targetBranchId);
    const items: Data[] = (transfer.items as Data[]).map(item => ({ ...item, quantityApproved: Number(item.quantityApproved ?? item.quantity ?? 0) }));
    const refs = items.map(item => balanceRef(vendorId, sourceType, sourceId, String(item.productId))); const balances = await Promise.all(refs.map(ref => tx.get(ref)));
    items.forEach((item, i) => { const quantity = Number(item.quantityApproved); const before = Number(balances[i].data()?.quantity || 0); if (quantity <= 0 || before < quantity) throw new HttpsError('failed-precondition', `Insufficient source stock for ${item.productName}.`); });
    items.forEach((item, i) => { const productId = String(item.productId); const quantity = Number(item.quantityApproved); const before = Number(balances[i].data()?.quantity || 0); tx.set(refs[i], clean({ ...(balances[i].data() || {}), id: refs[i].id, tenantId: vendorId, vendorId, [`${sourceType}Id`]: sourceId, productId, quantity: before - quantity, lastUpdated: new Date().toISOString() })); const key = `transfer-dispatch:${vendorId}:${transferId}:${productId}`; tx.create(movementRef(vendorId, key), { id: movementRef(vendorId, key).id, tenantId: vendorId, vendorId, transferId, movementType: 'TRANSFER_DISPATCH', locationType: sourceType.toUpperCase(), locationId: sourceId, sourceLocationId: sourceId, destinationLocationId: destinationId, productId, quantity, quantityDelta: -quantity, beforeQuantity: before, afterQuantity: before - quantity, actorId: uid, idempotencyKey: key, correlationId: transferId, occurredAt: new Date().toISOString(), recordedAt: new Date().toISOString() }); });
    const updated = clean({ ...transfer, items: items.map(item => ({ ...item, quantityDispatched: Number(item.quantityApproved), quantityReceived: Number(item.quantityReceived || 0), quantityDisputed: Number(item.quantityDisputed || 0), quantityReversed: Number(item.quantityReversed || 0), outstandingQuantity: Number(item.quantityApproved) })), status: 'IN_TRANSIT', dispatchIdempotencyKey: commandKey, dispatcherId: uid, dispatchedAt: new Date().toISOString(), version: Number(transfer.version || 0) + 1 });
    tx.set(transferRef, updated); event(tx, vendorId, transferId, 'TRANSFER_DISPATCH_STARTED', uid, { commandKey }); event(tx, vendorId, transferId, 'TRANSFER_DISPATCHED', uid, { commandKey }); event(tx, vendorId, transferId, 'TRANSFER_IN_TRANSIT', uid, { commandKey }); return updated;
  });
});

export const receiveTransfer = onCall(async request => {
  const data = request.data as Data; const vendorId = requiredString(data, 'vendorId'); const transferId = requiredString(data, 'transferId'); const commandKey = requiredString(data, 'idempotencyKey'); const receipts = data.receipts as Array<{ lineIndex: number; quantityReceived: number }>;
  const member = await authority(request.auth?.uid, vendorId, 'transfer.receive'); const uid = request.auth!.uid;
  if (!Array.isArray(receipts) || !receipts.length) throw new HttpsError('invalid-argument', 'Receipt lines are required.');
  return firestore.runTransaction(async tx => {
    const commandRef = firestore.doc(`vendors/${vendorId}/transfer_commands/${encodeURIComponent(commandKey)}`); const prior = await tx.get(commandRef); if (prior.exists) return prior.data()!.result;
    const transferRef = firestore.doc(`vendors/${vendorId}/transfers/${transferId}`); const snap = await tx.get(transferRef); if (!snap.exists) throw new HttpsError('not-found', 'Transfer not found.'); const transfer = snap.data()!; await validateRoute(tx, vendorId, transfer, member);
    if (!['IN_TRANSIT', 'RECEIVING'].includes(String(transfer.status))) throw new HttpsError('failed-precondition', 'Only in-transit stock can be received.');
    const items: Data[] = (transfer.items as Data[]).map(item => ({ ...item, quantityApproved: Number(item.quantityApproved || 0), quantityDispatched: Number(item.quantityDispatched || 0), quantityReceived: Number(item.quantityReceived || 0), quantityDisputed: Number(item.quantityDisputed || 0), quantityReversed: Number(item.quantityReversed || 0) }));
    const byLine = new Map(receipts.map(r => [Number(r.lineIndex), Number(r.quantityReceived)])); const destinationId = String(transfer.targetBranchId);
    const selected = [...byLine].map(([index, quantity]) => { if (!items[index]) throw new HttpsError('invalid-argument', 'Receipt line does not exist.'); const productId = String(items[index].productId); return { index, quantity, productId, ref: balanceRef(vendorId, 'branch', destinationId, productId) }; });
    const balanceSnaps = await Promise.all(selected.map(line => tx.get(line.ref)));
    selected.forEach((line, selectedIndex) => { const { index, quantity, productId, ref } = line; try { items[index] = { ...applyReceipt(items[index] as any, quantity) }; } catch (error) { throw new HttpsError('failed-precondition', (error as Error).message); } const balance = balanceSnaps[selectedIndex]; const before = Number(balance.data()?.quantity || 0); tx.set(ref, clean({ ...(balance.data() || {}), id: ref.id, tenantId: vendorId, vendorId, branchId: destinationId, productId, quantity: before + quantity, lastUpdated: new Date().toISOString() })); const key = `transfer-receipt:${vendorId}:${transferId}:${commandKey}:${productId}`; tx.create(movementRef(vendorId, key), { id: movementRef(vendorId, key).id, tenantId: vendorId, vendorId, transferId, movementType: 'TRANSFER_RECEIPT', locationType: 'BRANCH', locationId: destinationId, sourceLocationId: String(transfer.sourceWarehouseId || transfer.sourceBranchId), destinationLocationId: destinationId, productId, quantity, quantityDelta: quantity, beforeQuantity: before, afterQuantity: before + quantity, actorId: uid, idempotencyKey: key, correlationId: transferId, occurredAt: new Date().toISOString(), recordedAt: new Date().toISOString() }); });
    const nextItems: Data[] = items.map(item => ({ ...item, outstandingQuantity: outstandingQuantity(item as any) })); const completed = nextItems.every(item => Number(item.outstandingQuantity) === 0 && Number(item.quantityDisputed) === 0); const status = completed ? 'COMPLETED' : 'RECEIVING'; const updated = clean({ ...transfer, items: nextItems, status, receivingOfficerId: uid, version: Number(transfer.version || 0) + 1 }); tx.set(transferRef, updated); tx.create(commandRef, { vendorId, transferId, commandKey, result: updated, createdAt: new Date().toISOString() }); event(tx, vendorId, transferId, 'TRANSFER_RECEIPT_STARTED', uid, { commandKey }); event(tx, vendorId, transferId, completed ? 'TRANSFER_RECEIVED' : 'TRANSFER_PARTIALLY_RECEIVED', uid, { commandKey }); if (completed) event(tx, vendorId, transferId, 'TRANSFER_COMPLETED', uid, { commandKey }); return updated;
  });
});

export const recordTransferDiscrepancy = onCall(async request => {
  const data = request.data as Data; const vendorId = requiredString(data, 'vendorId'); const transferId = requiredString(data, 'transferId'); const commandKey = requiredString(data, 'idempotencyKey'); const lineIndex = Number(data.lineIndex); const quantity = Number(data.quantity); const discrepancyType = requiredString(data, 'discrepancyType') as TransferDiscrepancyType; const reason = requiredString(data, 'reason');
  const member = await authority(request.auth?.uid, vendorId, 'transfer.receive'); const uid = request.auth!.uid; if (!['SHORTAGE','DAMAGE','LOSS','QUANTITY_DISAGREEMENT'].includes(discrepancyType)) throw new HttpsError('invalid-argument', 'Unsupported discrepancy type.');
  return firestore.runTransaction(async tx => { const commandRef = firestore.doc(`vendors/${vendorId}/transfer_commands/${encodeURIComponent(commandKey)}`); const prior = await tx.get(commandRef); if (prior.exists) return prior.data()!.result; const ref = firestore.doc(`vendors/${vendorId}/transfers/${transferId}`); const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'Transfer not found.'); const transfer = snap.data()!; await validateRoute(tx, vendorId, transfer, member); const items = [...transfer.items as Data[]]; if (!items[lineIndex]) throw new HttpsError('invalid-argument', 'Discrepancy line does not exist.'); try { items[lineIndex] = { ...applyDiscrepancy(items[lineIndex] as any, quantity), outstandingQuantity: outstandingQuantity(applyDiscrepancy(items[lineIndex] as any, quantity)), discrepancies: [...(items[lineIndex].discrepancies as Data[] || []), { type: discrepancyType, quantity, reason, commandKey, actorId: uid, createdAt: new Date().toISOString() }] }; } catch (error) { throw new HttpsError('failed-precondition', (error as Error).message); } const updated = clean({ ...transfer, items, status: 'DISPUTED', version: Number(transfer.version || 0) + 1 }); tx.set(ref, updated); tx.create(commandRef, { vendorId, transferId, commandKey, result: updated, createdAt: new Date().toISOString() }); event(tx, vendorId, transferId, 'TRANSFER_DISCREPANCY_DETECTED', uid, { commandKey, discrepancyType, quantity, reason }); event(tx, vendorId, transferId, 'TRANSFER_DISPUTED', uid, { commandKey }); return updated; });
});

export const reverseTransfer = onCall(async request => {
  const data = request.data as Data; const vendorId = requiredString(data, 'vendorId'); const transferId = requiredString(data, 'transferId'); const commandKey = requiredString(data, 'idempotencyKey'); const reason = requiredString(data, 'reason'); const member = await authority(request.auth?.uid, vendorId, 'transfer.dispatch'); const uid = request.auth!.uid;
  return firestore.runTransaction(async tx => { const commandRef = firestore.doc(`vendors/${vendorId}/transfer_commands/${encodeURIComponent(commandKey)}`); const prior = await tx.get(commandRef); if (prior.exists) return prior.data()!.result; const ref = firestore.doc(`vendors/${vendorId}/transfers/${transferId}`); const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'Transfer not found.'); const transfer = snap.data()!; await validateRoute(tx, vendorId, transfer, member); if (transfer.status === 'REVERSED') return transfer; const sourceType = transfer.sourceWarehouseId ? 'warehouse' : 'branch'; const sourceId = String(transfer.sourceWarehouseId || transfer.sourceBranchId); const destinationId = String(transfer.targetBranchId); const items = [...transfer.items as Data[]]; const refs = items.flatMap(item => { const productId = String(item.productId); return [balanceRef(vendorId, sourceType, sourceId, productId), balanceRef(vendorId, 'branch', destinationId, productId)]; }); const snaps = await Promise.all(refs.map(balance => tx.get(balance))); for (let index = 0; index < items.length; index++) { const item = items[index]; const productId = String(item.productId); const received = Number(item.quantityReceived || 0); const restore = Number(item.quantityDispatched || 0) - Number(item.quantityReversed || 0); const sourceRef = refs[index * 2]; const branchRef = refs[index * 2 + 1]; const source = snaps[index * 2]; const branch = snaps[index * 2 + 1]; if (received > 0) { const before = Number(branch.data()?.quantity || 0); if (before < received) throw new HttpsError('failed-precondition', 'Received stock is no longer available for reversal.'); tx.set(branchRef, { ...branch.data(), quantity: before - received, lastUpdated: new Date().toISOString() }); } if (restore > 0) { const before = Number(source.data()?.quantity || 0); tx.set(sourceRef, { ...source.data(), quantity: before + restore, lastUpdated: new Date().toISOString() }); const key = `transfer-reversal:${vendorId}:${transferId}:${commandKey}:${productId}`; tx.create(movementRef(vendorId, key), { id: movementRef(vendorId, key).id, tenantId: vendorId, vendorId, transferId, movementType: 'TRANSFER_REVERSAL', locationType: sourceType.toUpperCase(), locationId: sourceId, sourceLocationId: destinationId, destinationLocationId: sourceId, productId, quantity: restore, quantityDelta: restore, beforeQuantity: before, afterQuantity: before + restore, actorId: uid, idempotencyKey: key, reasonCode: reason, correlationId: transferId, occurredAt: new Date().toISOString(), recordedAt: new Date().toISOString() }); } items[index] = { ...item, reversedReceivedQuantity: received, reversedDisputedQuantity: Number(item.quantityDisputed || 0), quantityReceived: 0, quantityDisputed: 0, quantityReversed: Number(item.quantityDispatched || 0), outstandingQuantity: 0 }; } const updated = clean({ ...transfer, items, status: 'REVERSED', reversedAt: new Date().toISOString(), reversedBy: uid, reversalReason: reason, version: Number(transfer.version || 0) + 1 }); tx.set(ref, updated); tx.create(commandRef, { vendorId, transferId, commandKey, result: updated, createdAt: new Date().toISOString() }); event(tx, vendorId, transferId, 'TRANSFER_REVERSED', uid, { commandKey, reason }); return updated; });
});

export const reconcileTransfer = onCall(async request => {
  const data = request.data as Data; const vendorId = requiredString(data, 'vendorId'); const transferId = requiredString(data, 'transferId');
  await authority(request.auth?.uid, vendorId, 'transfer.receive');
  const [snap, movementSnap] = await Promise.all([
    firestore.doc(`vendors/${vendorId}/transfers/${transferId}`).get(),
    firestore.collection(`vendors/${vendorId}/inventory_movements`).where('transferId', '==', transferId).get(),
  ]);
  if (!snap.exists) throw new HttpsError('not-found', 'Transfer not found.');
  const transfer = snap.data()!; const ledger = new Map<string, { dispatched: number; received: number; reversed: number }>();
  movementSnap.docs.forEach(document => { const movement = document.data(); const productId = String(movement.productId); const total = ledger.get(productId) || { dispatched: 0, received: 0, reversed: 0 }; const quantity = Math.abs(Number(movement.quantity ?? movement.quantityDelta ?? 0)); if (movement.movementType === 'TRANSFER_DISPATCH') total.dispatched += quantity; if (movement.movementType === 'TRANSFER_RECEIPT') total.received += quantity; if (movement.movementType === 'TRANSFER_REVERSAL') total.reversed += quantity; ledger.set(productId, total); });
  const lines = (transfer.items as Data[]).map((line, lineIndex) => { const productId = String(line.productId); const movements = ledger.get(productId) || { dispatched: 0, received: 0, reversed: 0 }; const warehouseDispatched = Number(line.quantityDispatched || 0); const branchReceived = Number(line.quantityReceived || 0); const reversed = Number(line.quantityReversed || 0); const lineReconciles = transferReconciles(line as any); const ledgerReconciles = movements.dispatched === warehouseDispatched && movements.received === branchReceived && movements.reversed === reversed; return { lineIndex, productId, warehouseDispatched, inTransitOutstanding: outstandingQuantity(line as any), branchReceived, disputed: Number(line.quantityDisputed || 0), reversed, ledger: movements, reconciled: lineReconciles && ledgerReconciles }; });
  return { transferId, reconciled: lines.every(line => line.reconciled), lines };
});
