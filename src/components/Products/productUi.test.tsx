import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductImportModal } from './ProductImportModal';
import { ProductManagement } from './ProductManagement';
import { ProductModal } from './ProductModal';

const product = { id: 'p', vendorId: 'v', sku: 'SKU-1', name: 'Widget', description: 'Description', category: 'General', size: 'M', costPrice: 1, sellingPrice: 2, unitOfMeasure: 'pcs', productType: 'INVENTORY' as const, alternativeLookupCode: 'ALU', reorderLevel: 0, status: 'active' as const, createdAt: 'now' };

test('product UI wires canonical table fields, location selector, actions and mobile quantity identity', () => {
  const html = renderToStaticMarkup(<ProductManagement products={[product]} warehouseStock={{ p: 3 }} branchStock={{}} warehouses={[{ id: 'w', vendorId: 'v', name: 'Main', code: 'WH-1', location: 'x', isDefault: true, createdAt: 'now' }]} branches={[]} vendorId="v" activeStaff={{ id: 'm', vendorId: 'v', name: 'Manager', email: 'm@example.com', role: 'manager', status: 'active', grantedMenuIds: ['products'], createdAt: 'now' }} onOpenAddProductModal={() => {}} onOpenImportModal={() => {}} onEditProduct={() => {}} />);
  for (const text of ['SKU', 'Product Name', 'Description', 'Category', 'Supplier Cost', 'Retail Price', 'Qty', 'UM', 'Location', 'ALU', 'Product Type', 'Actions', 'Import Products', 'Export Template', 'Add Product', '3 pcs', 'Advanced Search / Filters', 'Product List Columns']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('aria-label="Stock location"')); assert.ok(html.includes('md:hidden'));
});

test('product form exposes canonical controls, collapsible sector details and controlled edit quantity action', () => {
  const common = { isOpen: true, onClose: () => {}, vendorId: 'v', vendorTaxRate: 15, products: [product], warehouses: [{ id: 'w', vendorId: 'v', name: 'Main', code: 'WH-1', location: 'x', isDefault: true, createdAt: 'now' }], branches: [], activeStaff: { id: 'm', vendorId: 'v', name: 'Manager', email: 'm@example.com', role: 'manager' as const, status: 'active' as const, grantedMenuIds: ['products' as const], createdAt: 'now' }, warehouseStock: {}, branchStock: {}, onSuccess: () => {}, onOpeningBalanceRequest: async () => {} };
  const addHtml = renderToStaticMarkup(<ProductModal {...common} />);
  for (const label of ['Product Type', 'Industrial Sector', 'Category', 'Product Name', 'SKU', 'Barcode / EAN', 'Description', 'Supplier Cost Price', 'Retail Selling Price', 'Quantity', 'Stock Location', 'Shelf', 'Bin', 'Unit of Measure', 'Size', 'Alternative Look Up', 'HS Code', 'Tax Option', 'Reorder Quantity', 'Primary Supplier', 'Brand', 'Manufacturer', 'Sector-Specific Details']) assert.ok(addHtml.includes(label), label);
  assert.ok(addHtml.includes('aria-expanded="false"'));
  const editHtml = renderToStaticMarkup(<ProductModal {...common} productToEdit={product} onOpenStockAdjustment={() => {}} />);
  assert.ok(!editHtml.includes('aria-label="Quantity'));
  assert.ok(editHtml.includes('Quantity cannot be changed from Product Details after inventory history exists. Use Stock Adjustment.'));
  assert.ok(editHtml.includes('Open Stock Adjustment'));
});

test('import picker exposes only CSV and XLSX formats', () => {
  const html = renderToStaticMarkup(<ProductImportModal isOpen vendor={{ id: 'v', email: 'x@example.com', businessName: 'Vendor', address: '', phone: '', createdAt: 'now', updatedAt: 'now', currency: '$', taxRate: 0, onboardingCompleted: true }} existingProducts={[]} locations={[]} onClose={() => {}} onConfirmImport={async () => {}} />);
  assert.ok(html.includes('accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"'));
  assert.ok(!html.includes('.txt')); assert.ok(!html.includes('.tsv'));
});
