import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDiscrepancy, applyReceipt, outstandingQuantity, transferReconciles } from './transferAccounting.js';

const dispatched = { productId: 'p1', quantityApproved: 10, quantityDispatched: 10, quantityReceived: 0, quantityDisputed: 0, quantityReversed: 0 };

test('partial receipt consumes only outstanding in-transit quantity', () => {
  const partial = applyReceipt(dispatched, 4);
  assert.equal(partial.quantityReceived, 4);
  assert.equal(outstandingQuantity(partial), 6);
  assert.equal(transferReconciles(partial), true);
});

test('receipt above outstanding in-transit quantity is rejected', () => {
  assert.throws(() => applyReceipt(dispatched, 11), /exceeds outstanding/);
});

test('discrepancy remains explicit and reconcilable', () => {
  const disputed = applyDiscrepancy(applyReceipt(dispatched, 7), 2);
  assert.equal(disputed.quantityDisputed, 2);
  assert.equal(outstandingQuantity(disputed), 1);
  assert.equal(transferReconciles(disputed), true);
});

test('seeded divergence is detected without mutation', () => {
  const divergent = { ...dispatched, quantityReceived: 8, quantityDisputed: 3 };
  const original = structuredClone(divergent);
  assert.equal(transferReconciles(divergent), false);
  assert.deepEqual(divergent, original);
});
