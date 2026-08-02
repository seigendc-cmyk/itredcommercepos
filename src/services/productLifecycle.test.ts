import assert from 'node:assert/strict';
import test from 'node:test';
import { Product } from '../types';
import { assertProductPermission, determineProductRemoval, productAvailableForNewTransactions } from './productLifecycle';

const product: Product = { id: 'p', vendorId: 'v', sku: 'S', name: 'P', category: 'C', costPrice: 0, sellingPrice: 0, unit: 'ea', reorderLevel: 0, createdAt: 'now' };
test('unused product can be hard deleted but history or stock forces archive', () => {
  assert.equal(determineProductRemoval(product, { stockByLocation: [], references: [] }), 'delete');
  assert.equal(determineProductRemoval(product, { stockByLocation: [], references: ['orders'] }), 'archive');
  assert.equal(determineProductRemoval(product, { stockByLocation: [{ locationId: 'b', locationName: 'B', quantity: 1 }], references: [] }), 'archive');
});
test('archived products are excluded and direct service permission calls are enforced', () => {
  assert.equal(productAvailableForNewTransactions({ ...product, status: 'archived' }), false);
  assert.throws(() => assertProductPermission('cashier', 'product.archive'), /Permission/);
  assert.doesNotThrow(() => assertProductPermission('sysadmin', 'product.delete'));
});
