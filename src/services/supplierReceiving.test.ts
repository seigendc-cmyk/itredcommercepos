import assert from 'node:assert/strict';
import test from 'node:test';
import { Product, PurchaseOrder, Supplier } from '../types';
import {
  assertReceiptAllowed,
  compareReceiptToPurchaseOrder,
  filterOpenPurchaseOrders,
  filterSuppliers,
  mergeReceiptLine,
  nextPurchaseOrderStatus,
  ReceiptDraftLine,
  searchReceivingProducts,
  SupplierReceivingError,
} from './supplierReceiving';

const suppliers: Supplier[] = [
  { id: 'sup-1', vendorId: 'vendor-1', name: 'Acme Foods', code: 'ACM' },
  { id: 'sup-2', vendorId: 'vendor-1', name: 'Blue Manufacturing', code: 'BLU' },
];
const products: Product[] = [{
  id: 'prod-1',
  vendorId: 'vendor-1',
  sku: 'COF-001',
  name: 'Premium Arabica Coffee',
  brand: 'Mountain Cup',
  manufacturerCode: 'MC-ARABICA',
  barcode: '600100200',
  category: 'Grocery',
  costPrice: 4,
  sellingPrice: 7,
  unit: 'bag',
  reorderLevel: 5,
  createdAt: '2026-01-01',
}];
const purchaseOrder: PurchaseOrder = {
  id: 'po-1',
  vendorId: 'vendor-1',
  supplierId: 'sup-1',
  supplierName: 'Acme Foods',
  orderNumber: 'PO-001',
  status: 'OPEN',
  items: [{
    productId: 'prod-1',
    productName: 'Premium Arabica Coffee',
    orderedQuantity: 10,
    receivedQuantity: 3,
    unitCost: 4,
    unitOfMeasure: 'bag',
  }],
  createdAt: '2026-01-01',
};
const line: ReceiptDraftLine = {
  productId: 'prod-1',
  productName: 'Premium Arabica Coffee',
  sku: 'COF-001',
  quantity: 4,
  unitCost: 4,
  unitOfMeasure: 'bag',
  batchNumber: 'B1',
  orderedQuantity: 10,
  previouslyReceivedQuantity: 3,
};

test('filters suppliers and only returns their open or partially received orders', () => {
  assert.deepEqual(filterSuppliers(suppliers, 'acm').map(item => item.id), ['sup-1']);
  assert.deepEqual(
    filterOpenPurchaseOrders([
      purchaseOrder,
      { ...purchaseOrder, id: 'po-2', status: 'PARTIALLY_RECEIVED' },
      { ...purchaseOrder, id: 'po-3', status: 'COMPLETED' },
      { ...purchaseOrder, id: 'po-4', supplierId: 'sup-2' },
    ], 'sup-1').map(order => order.id),
    ['po-1', 'po-2'],
  );
});

test('searches products by SKU, partial name, brand, manufacturer code and barcode', () => {
  ['COF-001', 'arabica', 'mountain', 'MC-ARABICA', '600100200'].forEach(query => {
    assert.equal(searchReceivingProducts(products, query)[0]?.id, 'prod-1');
  });
});

test('compares cumulative PO quantities and keeps partial receipts pending', () => {
  const [comparison] = compareReceiptToPurchaseOrder([line], purchaseOrder);
  assert.equal(comparison.outstandingBeforeReceipt, 7);
  assert.equal(comparison.outstandingAfterReceipt, 3);
  assert.equal(comparison.status, 'PARTIAL');
  assert.equal(nextPurchaseOrderStatus([
    { ...purchaseOrder.items[0], receivedQuantity: 7 },
  ]), 'PARTIALLY_RECEIVED');
});

test('blocks over-receipt unless an exception is requested for approval', () => {
  const [comparison] = compareReceiptToPurchaseOrder([{ ...line, quantity: 8 }], purchaseOrder);
  assert.throws(
    () => assertReceiptAllowed('warehouse', [comparison], false),
    (error: unknown) => error instanceof SupplierReceivingError && error.code === 'over_receipt',
  );
  assert.doesNotThrow(() => assertReceiptAllowed('warehouse', [comparison], true));
});

test('merges matching product, batch and unit lines and rejects unsafe cost conflicts', () => {
  assert.equal(mergeReceiptLine([line], { ...line, quantity: 2 })[0].quantity, 6);
  assert.throws(
    () => mergeReceiptLine([line], { ...line, unitCost: 5 }),
    (error: unknown) =>
      error instanceof SupplierReceivingError &&
      error.code === 'duplicate_purchase_order_item',
  );
});

test('rejects a direct supplier receipt destination into a branch', () => {
  const comparisons = compareReceiptToPurchaseOrder([line], purchaseOrder);
  assert.throws(
    () => assertReceiptAllowed('branch', comparisons, false),
    (error: unknown) =>
      error instanceof SupplierReceivingError && error.code === 'branch_destination',
  );
});
