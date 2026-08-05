import assert from 'node:assert/strict';
import test from 'node:test';
import { Product, PurchaseOrder, Warehouse, WarehouseInventory } from '../types';
import {
  ApprovedSupplierReceiptPostingInput, postApprovedSupplierReceipt, PostedSupplierReceipt,
  SupplierReceiptInventoryMovement, SupplierReceiptPostingError, SupplierReceiptPostingStore,
} from './supplierReceiptPosting';

const NOW = '2026-08-04T12:00:00.000Z';
const warehouse: Warehouse = { id: 'warehouse-1', vendorId: 'vendor-1', name: 'Main Warehouse', code: 'WH-1', location: 'Harare', isDefault: true, status: 'active', licenseStatus: 'licensed', createdAt: NOW };
const product: Product = { id: 'product-1', vendorId: 'vendor-1', sku: 'SKU-1', name: 'Product One', category: 'General', costPrice: 4, sellingPrice: 8, unit: 'each', reorderLevel: 1, createdAt: NOW };
const purchaseOrder: PurchaseOrder = { id: 'po-1', vendorId: 'vendor-1', supplierId: 'supplier-1', supplierName: 'Supplier One', orderNumber: 'PO-1', status: 'OPEN', items: [{ productId: 'product-1', productName: 'Product One', orderedQuantity: 10, receivedQuantity: 3, unitCost: 4, unitOfMeasure: 'each' }], createdAt: NOW };
const inventory: WarehouseInventory = { id: 'vendor-1_warehouse-1_product-1', vendorId: 'vendor-1', warehouseId: 'warehouse-1', productId: 'product-1', quantity: 5, averageUnitCost: 4, lastUpdated: NOW };

interface State {
  warehouses: Map<string, Warehouse>;
  products: Map<string, Product>;
  inventory: Map<string, WarehouseInventory>;
  purchaseOrders: Map<string, PurchaseOrder>;
  receipts: Map<string, PostedSupplierReceipt>;
  movements: Map<string, SupplierReceiptInventoryMovement>;
}

class MemoryReceivingDatabase {
  state: State = {
    warehouses: new Map([[warehouse.id, warehouse]]), products: new Map([[product.id, product]]),
    inventory: new Map([[inventory.id, inventory]]), purchaseOrders: new Map([[purchaseOrder.id, purchaseOrder]]),
    receipts: new Map(), movements: new Map(),
  };
  failOnWrite?: number;

  async post(input: ApprovedSupplierReceiptPostingInput) {
    const pending = structuredClone(this.state);
    let writes = 0;
    const write = (operation: () => void) => {
      writes += 1;
      if (writes === this.failOnWrite) throw new Error('Injected supplier receipt write failure');
      operation();
    };
    const store: SupplierReceiptPostingStore = {
      getReceipt: async id => pending.receipts.get(id) ?? null,
      getWarehouse: async id => pending.warehouses.get(id) ?? null,
      getProduct: async id => pending.products.get(id) ?? null,
      getInventory: async (warehouseId, productId) => pending.inventory.get(`vendor-1_${warehouseId}_${productId}`) ?? null,
      getMovement: async (key, id) => {
        const movement = pending.movements.get(id) ?? null;
        return movement?.idempotencyKey === key ? movement : null;
      },
      getPurchaseOrder: async id => pending.purchaseOrders.get(id) ?? null,
      saveInventory: value => write(() => pending.inventory.set(value.id, value)),
      saveMovement: value => write(() => pending.movements.set(value.id, value)),
      savePurchaseOrder: value => write(() => pending.purchaseOrders.set(value.id, value)),
      saveReceipt: value => write(() => pending.receipts.set(value.id, value)),
    };
    const result = await postApprovedSupplierReceipt(input, store);
    this.state = pending;
    return result;
  }
}

function input(overrides: Partial<ApprovedSupplierReceiptPostingInput> = {}): ApprovedSupplierReceiptPostingInput {
  return {
    tenantId: 'vendor-1', vendorId: 'vendor-1', receiptId: 'receipt-1', approvalRequestId: 'approval-1',
    warehouseId: 'warehouse-1', destinationType: 'warehouse', supplierId: 'supplier-1', supplierName: 'Supplier One',
    referenceNo: 'GRN-1', purchaseOrderId: 'po-1', purchaseOrderNumber: 'PO-1', overReceiptExceptionApproved: false,
    actor: { id: 'manager-1', name: 'Manager', role: 'manager' }, requestedAt: NOW, postedAt: NOW,
    lines: [{ productId: 'product-1', productName: 'Product One', quantity: 4, unitCost: 6, unitOfMeasure: 'each', batchNumber: 'B-1', orderedQuantity: 10, previouslyReceivedQuantity: 3 }],
    ...overrides,
  };
}

async function rejectsCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: SupplierReceiptPostingError) => error.code === code);
}

test('warehouse receipt posts one canonical movement and increases accepted on-hand stock', async () => {
  const database = new MemoryReceivingDatabase();
  const result = await database.post(input());
  assert.equal(result.duplicate, false);
  assert.equal(result.movements.length, 1);
  const movement = result.movements[0];
  assert.equal(movement.movementType, 'SUPPLIER_RECEIPT');
  assert.equal(movement.sourceLocationId, undefined);
  assert.equal(movement.destinationLocationId, 'warehouse-1');
  assert.equal(movement.quantity, 4);
  assert.equal(movement.destinationBeforeQty, 5);
  assert.equal(movement.destinationAfterQty, 9);
  assert.equal(movement.referenceType, 'SUPPLIER_RECEIPT');
  assert.equal(movement.approvalRequestId, 'approval-1');
  assert.equal(database.state.inventory.get(inventory.id)?.quantity, 9);
  assert.equal(database.state.inventory.get(inventory.id)?.averageUnitCost, 44 / 9);
});

test('rejects branch, missing, another-tenant and another-vendor destinations', async () => {
  await rejectsCode(new MemoryReceivingDatabase().post(input({ destinationType: 'branch' })), 'branch_destination');
  await rejectsCode(new MemoryReceivingDatabase().post(input({ warehouseId: 'missing' })), 'warehouse_not_found');
  await rejectsCode(new MemoryReceivingDatabase().post(input({ tenantId: 'tenant-2' })), 'tenant_mismatch');
  const vendorMismatch = new MemoryReceivingDatabase();
  vendorMismatch.state.warehouses.set('warehouse-1', { ...warehouse, vendorId: 'vendor-2' });
  await rejectsCode(vendorMismatch.post(input()), 'vendor_mismatch');
});

test('rejects inactive and unlicensed warehouses', async () => {
  const inactive = new MemoryReceivingDatabase();
  inactive.state.warehouses.set('warehouse-1', { ...warehouse, status: 'suspended' });
  await rejectsCode(inactive.post(input()), 'inactive_warehouse');
  const unlicensed = new MemoryReceivingDatabase();
  unlicensed.state.warehouses.set('warehouse-1', { ...warehouse, licenseStatus: 'unlicensed' });
  await rejectsCode(unlicensed.post(input()), 'unlicensed_warehouse');
});

test('rejects unknown, archived and vendor-mismatched canonical products', async () => {
  const unknown = new MemoryReceivingDatabase(); unknown.state.products.clear();
  await rejectsCode(unknown.post(input()), 'unknown_product');
  const archived = new MemoryReceivingDatabase(); archived.state.products.set('product-1', { ...product, status: 'archived' });
  await rejectsCode(archived.post(input()), 'archived_product');
  const mismatched = new MemoryReceivingDatabase(); mismatched.state.products.set('product-1', { ...product, vendorId: 'vendor-2' });
  await rejectsCode(mismatched.post(input()), 'vendor_mismatch');
});

test('requires positive finite quantities', async () => {
  await rejectsCode(new MemoryReceivingDatabase().post(input({ lines: [{ ...input().lines[0], quantity: 0 }] })), 'invalid_quantity');
  await rejectsCode(new MemoryReceivingDatabase().post(input({ lines: [{ ...input().lines[0], quantity: Number.NaN }] })), 'invalid_quantity');
});

test('quarantined and damaged receipts update only their non-sellable buckets', async () => {
  const quarantined = new MemoryReceivingDatabase();
  const quarantineResult = await quarantined.post(input({ lines: [{ ...input().lines[0], quantity: 2, receiptClassification: 'QUARANTINED' }] }));
  assert.equal(quarantined.state.inventory.get(inventory.id)?.quantity, 5);
  assert.equal(quarantined.state.inventory.get(inventory.id)?.quarantinedQuantity, 2);
  assert.equal(quarantineResult.movements[0].destinationBeforeQty, 0);
  assert.equal(quarantineResult.movements[0].destinationAfterQty, 2);
  const damaged = new MemoryReceivingDatabase();
  await damaged.post(input({ lines: [{ ...input().lines[0], quantity: 2, receiptClassification: 'DAMAGED' }] }));
  assert.equal(damaged.state.inventory.get(inventory.id)?.quantity, 5);
  assert.equal(damaged.state.inventory.get(inventory.id)?.damagedQuantity, 2);
});

test('partial and final receipts preserve cumulative PO history and status', async () => {
  const partial = new MemoryReceivingDatabase();
  await partial.post(input());
  assert.equal(partial.state.purchaseOrders.get('po-1')?.items[0].receivedQuantity, 7);
  assert.equal(partial.state.purchaseOrders.get('po-1')?.status, 'PARTIALLY_RECEIVED');
  const final = new MemoryReceivingDatabase();
  await final.post(input({ lines: [{ ...input().lines[0], quantity: 7 }] }));
  assert.equal(final.state.purchaseOrders.get('po-1')?.items[0].receivedQuantity, 10);
  assert.equal(final.state.purchaseOrders.get('po-1')?.status, 'COMPLETED');
  assert.equal(final.state.purchaseOrders.get('po-1')?.items[0].unitCost, 4);
});

test('over-receipt requires an authorised exception and posts once when approved', async () => {
  await rejectsCode(new MemoryReceivingDatabase().post(input({ lines: [{ ...input().lines[0], quantity: 8 }] })), 'over_receipt');
  const approved = new MemoryReceivingDatabase();
  const approvedInput = input({ overReceiptExceptionApproved: true, lines: [{ ...input().lines[0], quantity: 8 }] });
  await approved.post(approvedInput);
  const retry = await approved.post(approvedInput);
  assert.equal(retry.duplicate, true);
  assert.equal(approved.state.inventory.get(inventory.id)?.quantity, 13);
  assert.equal(approved.state.purchaseOrders.get('po-1')?.items[0].receivedQuantity, 11);
  assert.equal(approved.state.movements.size, 1);
});

test('merges safe duplicate lines and rejects conflicting duplicate cost', async () => {
  const line = input().lines[0];
  const merged = new MemoryReceivingDatabase();
  const result = await merged.post(input({ lines: [{ ...line, quantity: 1 }, { ...line, quantity: 2 }] }));
  assert.equal(result.movements.length, 1);
  assert.equal(result.movements[0].quantity, 3);
  await rejectsCode(new MemoryReceivingDatabase().post(input({ lines: [line, { ...line, unitCost: 7 }] })), 'duplicate_line_conflict');
});

test('transaction failure rolls back receipt, PO, balance and movement writes', async () => {
  const database = new MemoryReceivingDatabase();
  database.failOnWrite = 2;
  await rejectsCode(database.post(input()), 'write_failure');
  assert.equal(database.state.inventory.get(inventory.id)?.quantity, 5);
  assert.equal(database.state.purchaseOrders.get('po-1')?.items[0].receivedQuantity, 3);
  assert.equal(database.state.movements.size, 0);
  assert.equal(database.state.receipts.size, 0);
});

test('movement compatibility retains PO comparison, classification and cost evidence', async () => {
  const result = await new MemoryReceivingDatabase().post(input());
  const compatibility = result.movements[0].compatibility;
  assert.equal(compatibility.receiptClassification, 'ACCEPTED');
  assert.equal(compatibility.orderedQuantity, 10);
  assert.equal(compatibility.previouslyReceivedQuantity, 3);
  assert.equal(compatibility.currentReceiptQuantity, 4);
  assert.equal(compatibility.remainingQuantity, 3);
  assert.equal(compatibility.variance, -3);
  assert.equal(compatibility.previousAverageCost, 4);
  assert.equal(compatibility.resultingAverageCost, 44 / 9);
});
