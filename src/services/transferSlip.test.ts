import assert from 'node:assert/strict';
import test from 'node:test';
import { StockTransfer } from '../types';
import {
  buildTransferSlipModel,
  getTransferWatermark,
  renderTransferSlipHtml,
  TransferSlipError,
} from './transferSlip';

const completedTransfer: StockTransfer = {
  id: 'transfer-1',
  vendorId: 'vendor-1',
  transferNo: 'TRF-0001',
  sourceWarehouseId: 'warehouse-1',
  sourceWarehouseName: 'Central Warehouse',
  targetBranchId: 'branch-1',
  targetBranchName: 'City Branch',
  date: '2026-07-26T10:00:00.000Z',
  requestedAt: '2026-07-25T10:00:00.000Z',
  approvedAt: '2026-07-25T12:00:00.000Z',
  dispatchedAt: '2026-07-26T10:00:00.000Z',
  requester: { id: 'staff-1', name: 'Rudo', role: 'warehouse_staff' },
  approver: { id: 'staff-2', name: 'Tariro', role: 'manager' },
  dispatcher: { id: 'staff-1', name: 'Rudo', role: 'warehouse_staff' },
  items: [{
    productId: 'product-1',
    productName: 'Arabica Coffee',
    quantity: 12,
    quantityReceived: 11,
    sku: 'COF-01',
    unitOfMeasure: 'bag',
    batchNumber: 'B-100',
  }],
  status: 'COMPLETED',
  notes: 'Handle with care',
  createdAt: '2026-07-25T10:00:00.000Z',
};

test('renders a valid operational transfer from the transfer record', () => {
  const model = buildTransferSlipModel(completedTransfer, 'iTred Coffee');
  const html = renderTransferSlipHtml(model, 'a4');

  assert.equal(model.operational, true);
  assert.equal(model.watermark, undefined);
  assert.equal(model.lines[0].variance, -1);
  assert.match(html, /iTred Coffee/);
  assert.match(html, /TRF-0001/);
  assert.match(html, /Central Warehouse/);
  assert.match(html, /City Branch/);
  assert.match(html, /COF-01/);
  assert.match(html, /Total lines:<\/strong> 1/);
  assert.match(renderTransferSlipHtml(model, '80-column'), /transfer-slip--80-column/);
});

test('watermarks all non-operational document statuses', () => {
  const expectedWatermarks = [
    ['DRAFT', 'DRAFT'],
    ['CANCELLED', 'CANCELLED'],
    ['REJECTED', 'REJECTED'],
    ['PENDING_APPROVAL', 'PENDING'],
    ['pending', 'PENDING'],
  ] as const;

  expectedWatermarks.forEach(([status, expected]) => {
    assert.equal(getTransferWatermark(status), expected);
    const model = buildTransferSlipModel(
      { ...completedTransfer, status: status as StockTransfer['status'] },
      'iTred Coffee',
    );
    assert.match(renderTransferSlipHtml(model, 'a4'), new RegExp(`watermark">${expected}`));
    assert.equal(model.operational, false);
  });
});

test('rejects slip generation when the transfer does not exist', () => {
  assert.throws(
    () => buildTransferSlipModel(undefined, 'iTred Coffee'),
    (error: unknown) =>
      error instanceof TransferSlipError &&
      error.message === 'The transfer does not exist and a slip cannot be generated.',
  );
});
