import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPurchaseRecommendations } from './purchaseOrders';
import { Product } from '../../types';

test('BI purchase recommendations show system quantity and replenish to twice reorder level', () => {
  const product = { id: 'p1', sku: 'CF85', name: 'Honda Filter', status: 'active', productType: 'INVENTORY', reorderLevel: 10, costPrice: 4, unit: 'EA' } as Product;
  const recommendations = buildPurchaseRecommendations([product], { p1: 6 });
  assert.equal(recommendations[0].systemQuantity, 6);
  assert.equal(recommendations[0].recommendedQuantity, 14);
  assert.match(recommendations[0].rationale, /reorder level 10/);
});

test('BI purchase recommendations omit products already above the replenishment target', () => {
  const product = { id: 'p1', sku: 'CF85', name: 'Honda Filter', status: 'active', productType: 'INVENTORY', reorderLevel: 10, costPrice: 4, unit: 'EA' } as Product;
  assert.deepEqual(buildPurchaseRecommendations([product], { p1: 25 }), []);
});
