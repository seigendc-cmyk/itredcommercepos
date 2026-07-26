import assert from 'node:assert/strict';
import test from 'node:test';
import { Branch, Warehouse } from '../types';
import {
  addTransferLine,
  assertCanDispatch,
  assertRequestedStockAvailable,
  assertWarehouseToBranchRoute,
  canAccessTransferLedger,
  searchTransferProducts,
  StockTransferWorkflowError,
  TransferDraftLine,
  validateTransferReceipt,
} from './stockTransferWorkflow';

const warehouse: Warehouse = {
  id: 'wh-1', vendorId: 'vendor-1', name: 'Central', code: 'WH-1',
  location: 'Harare', isDefault: true, status: 'active', licenseStatus: 'licensed',
  createdAt: '2026-01-01',
};
const branch: Branch = {
  id: 'br-1', vendorId: 'vendor-1', name: 'CBD', code: 'BR-1',
  address: 'Harare', phone: '1', isDefault: true, status: 'active',
  licenseStatus: 'licensed', createdAt: '2026-01-01',
};
const line: TransferDraftLine = {
  productId: 'prod-1', productName: 'Coffee', sku: 'COF-1',
  quantityRequested: 5, quantityApproved: 0, quantityDispatched: 0,
  quantityReceived: 0, unitOfMeasure: 'bag',
};

test('rejects a branch as the central transfer source', () => {
  assert.throws(
    () => assertWarehouseToBranchRoute('vendor-1', 'branch', branch, 'branch', branch),
    (error: unknown) => error instanceof StockTransferWorkflowError && error.code === 'wrong_source_type',
  );
});

test('rejects a warehouse as the destination', () => {
  assert.throws(
    () => assertWarehouseToBranchRoute('vendor-1', 'warehouse', warehouse, 'warehouse', warehouse),
    (error: unknown) => error instanceof StockTransferWorkflowError && error.code === 'wrong_destination_type',
  );
});

test('rejects resources from another vendor tenant', () => {
  assert.throws(
    () => assertWarehouseToBranchRoute(
      'vendor-1',
      'warehouse',
      warehouse,
      'branch',
      { ...branch, vendorId: 'vendor-2' },
    ),
    (error: unknown) => error instanceof StockTransferWorkflowError && error.code === 'tenant_mismatch',
  );
});

test('searches transfer products by partial SKU, name, brand, barcode and manufacturer reference', () => {
  const product = {
    id: 'prod-1', vendorId: 'vendor-1', sku: 'COF-ABC-01', name: 'Premium Coffee',
    brand: 'Mountain Cup', barcode: '600123', manufacturerCode: 'MFG-COF',
    category: 'Grocery', costPrice: 1, sellingPrice: 2, unit: 'bag',
    reorderLevel: 1, createdAt: '2026-01-01',
  };
  ['ABC', 'premium', 'mountain', '600123', 'MFG-COF'].forEach(query => {
    assert.equal(searchTransferProducts([product], query)[0]?.id, product.id);
  });
});

test('rejects insufficient aggregate source stock', () => {
  assert.throws(
    () => assertRequestedStockAvailable([line, { ...line, batchNumber: 'B2', quantityRequested: 6 }], { 'prod-1': 10 }),
    (error: unknown) => error instanceof StockTransferWorkflowError && error.code === 'insufficient_stock',
  );
});

test('requires controlled review and a reason for partial receipt', () => {
  assert.throws(
    () => validateTransferReceipt('manager', 3, 5, ''),
    (error: unknown) => error instanceof StockTransferWorkflowError && error.code === 'reason_required',
  );
  assert.throws(
    () => validateTransferReceipt('warehouse_staff', 3, 5, 'Two damaged'),
    (error: unknown) => error instanceof StockTransferWorkflowError && error.code === 'unauthorized',
  );
  assert.doesNotThrow(() => validateTransferReceipt('manager', 3, 5, 'Two damaged'));
});

test('rejects received quantity above stock in transit as a variance', () => {
  assert.throws(
    () => validateTransferReceipt('manager', 6, 5, 'Unexpected'),
    (error: unknown) => error instanceof StockTransferWorkflowError && error.code === 'insufficient_stock',
  );
});

test('prevents duplicate line and duplicate dispatch processing', () => {
  assert.throws(
    () => addTransferLine([line], { ...line }),
    (error: unknown) => error instanceof StockTransferWorkflowError && error.code === 'duplicate_line',
  );
  assert.throws(
    () => assertCanDispatch('IN_TRANSIT'),
    (error: unknown) => error instanceof StockTransferWorkflowError && error.code === 'duplicate_processing',
  );
});

test('allows authorised warehouse roles to access the filtered ledger', () => {
  assert.equal(canAccessTransferLedger('warehouse_staff'), true);
  assert.equal(canAccessTransferLedger('cashier'), false);
});
