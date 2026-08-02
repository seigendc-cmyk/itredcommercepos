import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductImportModal } from './ProductImportModal';
import { ProductManagement } from './ProductManagement';

const product = { id: 'p', vendorId: 'v', sku: 'SKU-1', name: 'Widget', description: 'Description', category: 'General', size: 'M', costPrice: 1, sellingPrice: 2, unitOfMeasure: 'pcs', productType: 'INVENTORY' as const, alternativeLookupCode: 'ALU', reorderLevel: 0, status: 'active' as const, createdAt: 'now' };

test('product UI wires canonical table fields, location selector, actions and mobile quantity identity', () => {
  const html = renderToStaticMarkup(<ProductManagement products={[product]} warehouseStock={{ p: 3 }} branchStock={{}} warehouses={[{ id: 'w', vendorId: 'v', name: 'Main', code: 'WH-1', location: 'x', isDefault: true, createdAt: 'now' }]} branches={[]} vendorId="v" onOpenAddProductModal={() => {}} onOpenImportModal={() => {}} onEditProduct={() => {}} />);
  for (const text of ['SKU', 'Product Name', 'Description', 'Category', 'Size', 'Cost', 'Price', 'Qty', 'UM', 'Location', 'Alternative Look Up', 'Product Type', 'Actions', 'Import Products', 'Export Template', 'Add Product', '3 pcs']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('aria-label="Stock location"')); assert.ok(html.includes('md:hidden'));
});

test('import picker exposes only CSV and XLSX formats', () => {
  const html = renderToStaticMarkup(<ProductImportModal isOpen vendor={{ id: 'v', email: 'x@example.com', businessName: 'Vendor', address: '', phone: '', createdAt: 'now', updatedAt: 'now', currency: '$', taxRate: 0, onboardingCompleted: true }} existingProducts={[]} locations={[]} onClose={() => {}} onConfirmImport={async () => {}} />);
  assert.ok(html.includes('accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"'));
  assert.ok(!html.includes('.txt')); assert.ok(!html.includes('.tsv'));
});
