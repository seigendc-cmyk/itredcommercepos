import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProductLocationStockView } from './productLocationStockView';

test('stocktake maps canonical columns through explicit named fields', () => {
  const view = buildProductLocationStockView({ id: 'p', vendorId: 'v', sku: 'SKU', name: 'Name', description: 'Description', category: 'Category', size: 'L', costPrice: 1, sellingPrice: 2, unit: 'legacy', alternativeLookupCode: 'ALU', productType: 'INVENTORY', shelf: 'S1', bin: 'B2', reorderLevel: 0, createdAt: 'now' }, { id: 'wh', name: 'Warehouse' }, 7);
  assert.deepEqual([view.sku, view.productName, view.description, view.category, view.size, view.unitOfMeasure, view.locationName, view.shelfCode, view.binCode, view.systemQuantity], ['SKU', 'Name', 'Description', 'Category', 'L', 'legacy', 'Warehouse', 'S1', 'B2', 7]);
});
