import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

const projectId = 'demo-itred-pos-rules-test';
let environment: RulesTestEnvironment;
let authenticatedApp: FirebaseApp;
let anonymousApp: FirebaseApp;
let post: ReturnType<typeof httpsCallable<Record<string, unknown>, any>>;
let reverse: ReturnType<typeof httpsCallable<Record<string, unknown>, any>>;
let anonymousPost: ReturnType<typeof httpsCallable<Record<string, unknown>, any>>;
let sequence = 0;
let uid = '';
type Data = Record<string, unknown>;

type Scenario = Awaited<ReturnType<typeof seed>>;

function errorCode(error: unknown): string { return String((error as { code?: unknown })?.code || ''); }
async function rejected(call: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(call, error => errorCode(error).endsWith(code));
}

async function adminSet(path: string, value: Record<string, unknown>): Promise<void> {
  await environment.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), path), value));
}

async function adminGet(path: string): Promise<Record<string, any> | undefined> {
  let value: Record<string, any> | undefined;
  await environment.withSecurityRulesDisabled(async context => { value = (await getDoc(doc(context.firestore(), path))).data(); });
  return value;
}

async function seed(options: { ordered?: number; delivered?: number; accepted?: number; damaged?: number; quarantined?: number; rejected?: number; status?: string; permission?: boolean; assigned?: boolean; warehouseStatus?: string; licence?: string; supplierStatus?: string; productStatus?: string; approval?: boolean; membershipTenant?: string } = {}) {
  sequence += 1; const token = `s${sequence}`; const vendorId = `vendor-${token}`; const warehouseId = `warehouse-${token}`; const supplierId = `supplier-${token}`;
  const productId = `product-${token}`; const purchaseOrderId = `po-${token}`; const receiptId = `receipt-${token}`; const approvalRequestId = `approval-${token}`;
  const ordered = options.ordered ?? 10; const delivered = options.delivered ?? 4; const accepted = options.accepted ?? delivered;
  const damaged = options.damaged ?? 0; const quarantined = options.quarantined ?? 0; const rejected = options.rejected ?? 0; const now = new Date().toISOString(); const lineId = `line_1_${productId}`;
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore(); const writes = [
      setDoc(doc(db, `vendors/${vendorId}/memberships/${uid}`), { tenantId: options.membershipTenant ?? vendorId, vendorId, userUid: uid, status: 'ACTIVE', roleId: 'receiver', permissions: options.permission === false ? [] : ['receiving.approve'], assignedWarehouseIds: options.assigned === false ? [] : [warehouseId], assignedBranchIds: [] }),
      setDoc(doc(db, `vendors/${vendorId}/roles/receiver`), { id: 'receiver', status: 'active' }),
      setDoc(doc(db, `vendors/${vendorId}/warehouses/${warehouseId}`), { id: warehouseId, tenantId: vendorId, vendorId, name: 'Warehouse', code: token, status: options.warehouseStatus ?? 'active', licenseStatus: options.licence ?? 'licensed', createdAt: now, updatedAt: now }),
      setDoc(doc(db, `vendors/${vendorId}/suppliers/${supplierId}`), { id: supplierId, tenantId: vendorId, vendorId, name: 'Supplier', status: options.supplierStatus ?? 'active' }),
      setDoc(doc(db, `vendors/${vendorId}/products/${productId}`), { id: productId, tenantId: vendorId, vendorId, sku: token, name: 'Product', status: options.productStatus ?? 'active', productType: 'INVENTORY' }),
      setDoc(doc(db, `vendors/${vendorId}/purchase_orders/${purchaseOrderId}`), { purchaseOrderId, id: purchaseOrderId, tenantId: vendorId, vendorId, supplierId, supplierName: 'Supplier', destinationWarehouseId: warehouseId, destinationWarehouseName: 'Warehouse', destinationLocationType: 'WAREHOUSE', currency: 'USD', status: options.status ?? 'ISSUED', version: 1, orderNumber: token,
        lines: [{ lineId, productId, sku: token, description: 'Product', orderedQuantity: ordered, unitCost: 2, discountPercent: 0, lineDiscount: 0, taxRate: 0, taxTreatment: 'EXEMPT', lineSubtotal: ordered * 2, lineTax: 0, lineTotal: ordered * 2, receivedQuantity: 0, outstandingQuantity: ordered }],
        items: [{ lineId, productId, sku: token, description: 'Product', orderedQuantity: ordered, unitCost: 2, discountPercent: 0, lineDiscount: 0, taxRate: 0, taxTreatment: 'EXEMPT', lineSubtotal: ordered * 2, lineTax: 0, lineTotal: ordered * 2, receivedQuantity: 0, outstandingQuantity: ordered }],
        subtotal: ordered * 2, discountTotal: 0, tax: 0, total: ordered * 2, createdBy: uid, createdAt: now, updatedAt: now, statusHistory: [{ from: 'APPROVED', to: 'ISSUED', actorId: uid, commandId: `issue-${token}`, occurredAt: now }] }),
    ];
    if (options.approval !== false) writes.push(setDoc(doc(db, `vendors/${vendorId}/approval_requests/${approvalRequestId}`), { id: approvalRequestId, tenantId: vendorId, vendorId, warehouseId, resourceId: receiptId, resourceType: 'SUPPLIER_STOCK_RECEIPT', status: 'APPROVED', outcome: 'APPROVED' }));
    await Promise.all(writes);
  });
  const payload = { vendorId, receiptId, commandId: `post-${token}`, approvalRequestId, warehouseId, supplierId, purchaseOrderId, referenceNo: token,
    lines: [{ lineId, productId, deliveredQuantity: delivered, acceptedQuantity: accepted, damagedQuantity: damaged, quarantinedQuantity: quarantined, rejectedQuantity: rejected, unitCost: 2 }] };
  return { token, vendorId, warehouseId, supplierId, productId, purchaseOrderId, receiptId, approvalRequestId, lineId, payload };
}

async function balance(s: Scenario) { return adminGet(`vendors/${s.vendorId}/warehouse_inventory/${s.vendorId}_${s.warehouseId}_${s.productId}`); }
async function order(s: Scenario) { return adminGet(`vendors/${s.vendorId}/purchase_orders/${s.purchaseOrderId}`); }

before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080 } });
  authenticatedApp = initializeApp({ projectId, apiKey: 'fake-api-key', authDomain: 'localhost' }, 'receiving-authenticated');
  anonymousApp = initializeApp({ projectId, apiKey: 'fake-api-key', authDomain: 'localhost' }, 'receiving-anonymous');
  const auth = getAuth(authenticatedApp); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  try { await createUserWithEmailAndPassword(auth, 'receiver@example.test', 'password123'); } catch { await signInWithEmailAndPassword(auth, 'receiver@example.test', 'password123'); }
  uid = auth.currentUser!.uid;
  const functions = getFunctions(authenticatedApp, 'us-central1'); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const anonymousFunctions = getFunctions(anonymousApp, 'us-central1'); connectFunctionsEmulator(anonymousFunctions, '127.0.0.1', 5001);
  post = httpsCallable(functions, 'postSupplierReceipt'); reverse = httpsCallable(functions, 'reverseSupplierReceipt'); anonymousPost = httpsCallable(anonymousFunctions, 'postSupplierReceipt');
});

after(async () => { await environment.cleanup(); await Promise.all([deleteApp(authenticatedApp), deleteApp(anonymousApp)]); });

test('01 unauthenticated posting is denied', async () => { const s = await seed(); await rejected(anonymousPost(s.payload), 'unauthenticated'); });
test('02 non-members are denied', async () => { const s = await seed(); await environment.withSecurityRulesDisabled(c => deleteDoc(doc(c.firestore(), `vendors/${s.vendorId}/memberships/${uid}`))); await rejected(post(s.payload), 'permission-denied'); });
test('03 wrong-tenant membership is denied', async () => { const s = await seed({ membershipTenant: 'another-tenant' }); await rejected(post(s.payload), 'permission-denied'); });
test('04 receiving permission is required', async () => { const s = await seed({ permission: false }); await rejected(post(s.payload), 'permission-denied'); });
test('05 warehouse assignment is required', async () => { const s = await seed({ assigned: false }); await rejected(post(s.payload), 'permission-denied'); });
test('06 inactive warehouses are rejected', async () => { const s = await seed({ warehouseStatus: 'suspended' }); await rejected(post(s.payload), 'failed-precondition'); });
test('07 unlicensed warehouses are rejected', async () => { const s = await seed({ licence: 'unlicensed' }); await rejected(post(s.payload), 'failed-precondition'); });
test('08 inactive suppliers are rejected', async () => { const s = await seed({ supplierStatus: 'inactive' }); await rejected(post(s.payload), 'failed-precondition'); });
test('09 inactive products are rejected', async () => { const s = await seed({ productStatus: 'inactive' }); await rejected(post(s.payload), 'not-found'); });
test('10 receipt approval is mandatory', async () => { const s = await seed({ approval: false }); await rejected(post(s.payload), 'failed-precondition'); });
test('11 disposition equation is enforced', async () => { const s = await seed({ delivered: 4, accepted: 3 }); await rejected(post(s.payload), 'invalid-argument'); });
test('12 accepted stock reaches on-hand', async () => { const s = await seed({ delivered: 4, accepted: 4 }); await post(s.payload); assert.equal((await balance(s))?.quantity, 4); });
test('13 damaged stock reaches damaged only', async () => { const s = await seed({ delivered: 3, accepted: 0, damaged: 3 }); await post(s.payload); const b = await balance(s); assert.equal(b?.quantity, 0); assert.equal(b?.damagedQuantity, 3); });
test('14 quarantined stock reaches quarantine only', async () => { const s = await seed({ delivered: 2, accepted: 0, quarantined: 2 }); await post(s.payload); const b = await balance(s); assert.equal(b?.quantity, 0); assert.equal(b?.quarantinedQuantity, 2); });
test('15 rejected stock changes no inventory bucket but accounts on PO', async () => { const s = await seed({ delivered: 2, accepted: 0, rejected: 2 }); await post(s.payload); assert.equal(await balance(s), undefined); assert.equal((await order(s))?.lines[0].receivedQuantity, 2); });
test('16 partial receipt advances PO', async () => { const s = await seed({ ordered: 10, delivered: 4 }); await post(s.payload); const po = await order(s); assert.equal(po?.status, 'PARTIALLY_RECEIVED'); assert.equal(po?.lines[0].outstandingQuantity, 6); });
test('17 repeated partial receipt remains partial', async () => { const s = await seed({ ordered: 10, delivered: 4 }); await post(s.payload); const receiptId = `${s.receiptId}-2`; const approvalRequestId = `${s.approvalRequestId}-2`; await adminSet(`vendors/${s.vendorId}/approval_requests/${approvalRequestId}`, { tenantId: s.vendorId, vendorId: s.vendorId, warehouseId: s.warehouseId, resourceId: receiptId, resourceType: 'SUPPLIER_STOCK_RECEIPT', status: 'APPROVED', outcome: 'APPROVED' }); await post({ ...s.payload, receiptId, approvalRequestId, commandId: `${s.payload.commandId}-2`, lines: [{ ...s.payload.lines[0], deliveredQuantity: 2, acceptedQuantity: 2 }] }); assert.equal((await order(s))?.lines[0].receivedQuantity, 6); });
test('18 full receipt advances PO to RECEIVED', async () => { const s = await seed({ ordered: 4, delivered: 4 }); await post(s.payload); assert.equal((await order(s))?.status, 'RECEIVED'); });
test('19 over-receipt is denied without exception approval', async () => { const s = await seed({ ordered: 3, delivered: 4 }); await rejected(post(s.payload), 'failed-precondition'); assert.equal(await balance(s), undefined); });
test('20 approved over-receipt is consumed atomically', async () => { const s = await seed({ ordered: 3, delivered: 4 }); const id = `over-${s.token}`; await adminSet(`vendors/${s.vendorId}/approval_requests/${id}`, { tenantId: s.vendorId, vendorId: s.vendorId, resourceId: s.purchaseOrderId, requestedAction: 'ALLOW_OVER_RECEIPT', status: 'APPROVED', outcome: 'APPROVED' }); await post({ ...s.payload, overReceiptApprovalId: id }); assert.equal((await adminGet(`vendors/${s.vendorId}/approval_requests/${id}`))?.consumedByCommandId, s.payload.commandId); });
test('21 posting replay is idempotent', async () => { const s = await seed(); await post(s.payload); await post(s.payload); assert.equal((await balance(s))?.quantity, 4); });
test('22 command identity collision is rejected', async () => { const s = await seed(); await post(s.payload); await rejected(post({ ...s.payload, receiptId: `${s.receiptId}-other` }), 'already-exists'); });
test('23 concurrent receipts cannot over-consume PO outstanding', async () => { const s = await seed({ ordered: 10, delivered: 6 }); const receiptId = `${s.receiptId}-race`; const approvalRequestId = `${s.approvalRequestId}-race`; await adminSet(`vendors/${s.vendorId}/approval_requests/${approvalRequestId}`, { tenantId: s.vendorId, vendorId: s.vendorId, warehouseId: s.warehouseId, resourceId: receiptId, resourceType: 'SUPPLIER_STOCK_RECEIPT', status: 'APPROVED', outcome: 'APPROVED' }); const outcomes = await Promise.allSettled([post(s.payload), post({ ...s.payload, receiptId, approvalRequestId, commandId: `${s.payload.commandId}-race` })]); assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1); assert.equal((await order(s))?.lines[0].receivedQuantity, 6); });
test('24 inventory-stage failure rolls back PO and inventory', async () => { const s = await seed(); await rejected(post({ ...s.payload, testFailurePoint: 'AFTER_INVENTORY' }), 'aborted'); assert.equal(await balance(s), undefined); assert.equal((await order(s))?.lines[0].receivedQuantity, 0); });
test('25 PO-stage failure rolls back ledger and balance', async () => { const s = await seed(); await rejected(post({ ...s.payload, testFailurePoint: 'AFTER_PURCHASE_ORDER' }), 'aborted'); assert.equal(await balance(s), undefined); assert.equal((await order(s))?.lines[0].receivedQuantity, 0); });
test('26 event-stage failure rolls back command, events, PO, and inventory', async () => { const s = await seed(); await rejected(post({ ...s.payload, testFailurePoint: 'AFTER_EVENTS' }), 'aborted'); assert.equal(await balance(s), undefined); assert.equal((await order(s))?.lines[0].receivedQuantity, 0); });
test('27 reversal restores all disposition buckets', async () => { const s = await seed({ delivered: 10, accepted: 4, damaged: 2, quarantined: 3, rejected: 1, ordered: 10 }); await post(s.payload); await reverse({ vendorId: s.vendorId, receiptId: s.receiptId, commandId: `reverse-${s.token}`, reason: 'Supplier return' }); const b = await balance(s); assert.equal(b?.quantity, 0); assert.equal(b?.damagedQuantity, 0); assert.equal(b?.quarantinedQuantity, 0); });
test('28 reversal restores PO received and outstanding quantities', async () => { const s = await seed({ ordered: 10, delivered: 4 }); await post(s.payload); await reverse({ vendorId: s.vendorId, receiptId: s.receiptId, commandId: `reverse-${s.token}`, reason: 'Correction' }); const po = await order(s); assert.equal(po?.status, 'ISSUED'); assert.equal(po?.lines[0].receivedQuantity, 0); assert.equal(po?.lines[0].outstandingQuantity, 10); });
test('29 reversal leaves original movement immutable and links compensation', async () => { const s = await seed(); const posted = (await post(s.payload)).data; const originalId = posted.receipt.movementIds[0]; const originalBefore = await adminGet(`vendors/${s.vendorId}/inventory_movements/${originalId}`); const reversed = (await reverse({ vendorId: s.vendorId, receiptId: s.receiptId, commandId: `reverse-${s.token}`, reason: 'Correction' })).data; assert.deepEqual(await adminGet(`vendors/${s.vendorId}/inventory_movements/${originalId}`), originalBefore); const compensation = await adminGet(`vendors/${s.vendorId}/inventory_movements/${reversed.receipt.reversal.movementIds[0]}`); assert.equal(compensation?.reversalOfMovementId, originalId); });
test('30 duplicate reversal command is idempotent', async () => { const s = await seed(); await post(s.payload); const payload = { vendorId: s.vendorId, receiptId: s.receiptId, commandId: `reverse-${s.token}`, reason: 'Correction' }; await reverse(payload); await reverse(payload); assert.equal((await balance(s))?.quantity, 0); });
test('31 second reversal with a new command is rejected', async () => { const s = await seed(); await post(s.payload); await reverse({ vendorId: s.vendorId, receiptId: s.receiptId, commandId: `reverse-${s.token}`, reason: 'Correction' }); await rejected(reverse({ vendorId: s.vendorId, receiptId: s.receiptId, commandId: `reverse-again-${s.token}`, reason: 'Again' }), 'failed-precondition'); });
test('32 reversal refuses stock already consumed', async () => { const s = await seed(); await post(s.payload); const legacyPath = `vendors/${s.vendorId}/warehouse_inventory/${s.vendorId}_${s.warehouseId}_${s.productId}`; const canonicalPath = `vendors/${s.vendorId}/inventory_balances/${s.vendorId}::${s.vendorId}::${s.warehouseId}::${s.productId}`; await adminSet(legacyPath, { ...(await adminGet(legacyPath))!, quantity: 1 }); await adminSet(canonicalPath, { ...(await adminGet(canonicalPath))!, onHandQty: 1 }); await rejected(reverse({ vendorId: s.vendorId, receiptId: s.receiptId, commandId: `reverse-${s.token}`, reason: 'Correction' }), 'failed-precondition'); });
test('33 injected reversal failure rolls back inventory and PO', async () => { const s = await seed(); await post(s.payload); await rejected(reverse({ vendorId: s.vendorId, receiptId: s.receiptId, commandId: `reverse-${s.token}`, reason: 'Correction', testFailurePoint: 'AFTER_PURCHASE_ORDER' }), 'aborted'); assert.equal((await balance(s))?.quantity, 4); assert.equal((await order(s))?.lines[0].receivedQuantity, 4); });
test('34 successful commands emit audit and BI events', async () => { const s = await seed(); await post(s.payload); let audit: Awaited<ReturnType<typeof getDocs>> | undefined; let bi: Awaited<ReturnType<typeof getDocs>> | undefined; await environment.withSecurityRulesDisabled(async context => { audit = await getDocs(collection(context.firestore(), `vendors/${s.vendorId}/audit_events`)); bi = await getDocs(collection(context.firestore(), `vendors/${s.vendorId}/bi_events`)); }); assert.equal(audit!.size, 1); assert.equal(bi!.size, 1); assert.equal((audit!.docs[0].data() as Data).eventType, (bi!.docs[0].data() as Data).eventType); });
test('35 clients cannot directly forge receipt or movement writes', async () => { const s = await seed(); const client = environment.authenticatedContext(uid, { vendorId: s.vendorId }).firestore(); await assertFails(setDoc(doc(client, `vendors/${s.vendorId}/supplier_receipts/forged`), { vendorId: s.vendorId })); await assertFails(setDoc(doc(client, `vendors/${s.vendorId}/inventory_movements/forged`), { vendorId: s.vendorId })); });
