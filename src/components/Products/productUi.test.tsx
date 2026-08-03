import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductImportModal } from './ProductImportModal';
import { ProductManagement } from './ProductManagement';
import { ProductModal } from './ProductModal';
import { StockCostCenterMatrix } from '../Inventory/StockCostCenterMatrix';

const product = { id: 'p', vendorId: 'v', sku: 'SKU-1', name: 'Widget', description: 'Description', category: 'General', size: 'M', costPrice: 1, sellingPrice: 2, unitOfMeasure: 'pcs', productType: 'INVENTORY' as const, alternativeLookupCode: 'ALU', reorderLevel: 0, status: 'active' as const, createdAt: 'now' };

test('product UI wires canonical table fields, location selector, actions and mobile quantity identity', () => {
  const html = renderToStaticMarkup(<ProductManagement products={[product]} warehouseStock={{ p: 3 }} branchStock={{}} warehouses={[{ id: 'w', vendorId: 'v', name: 'Main', code: 'WH-1', location: 'x', isDefault: true, createdAt: 'now' }]} branches={[]} vendorId="v" activeStaff={{ id: 'm', vendorId: 'v', name: 'Manager', email: 'm@example.com', role: 'manager', status: 'active', grantedMenuIds: ['products'], createdAt: 'now' }} onOpenAddProductModal={() => {}} onOpenImportModal={() => {}} onEditProduct={() => {}} />);
  for (const text of ['SKU', 'Product Name', 'Description', 'Category', 'Supplier Cost', 'Retail Price', 'Qty', 'UM', 'Location', 'ALU', 'Product Type', 'Actions', 'Import Products', 'Export Template', 'Add Product', '3 pcs', 'Advanced Search / Filters', 'Product List Columns']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('aria-label="Stock location"')); assert.ok(html.includes('aria-label="Quick category filter"')); assert.ok(html.includes('1 Total Products')); assert.ok(html.includes('aria-label="Product catalog pagination"')); assert.ok(html.includes('Showing 1–1 of 1 filtered products · 100 per page')); assert.ok(html.includes('aria-label="Select all visible products"')); assert.ok(html.includes('aria-label="Select SKU-1"')); assert.ok(html.includes('Delete product (archives when history exists)')); assert.ok(html.includes('md:hidden'));
});

test('product catalog limits the initial result page to 100 products', () => {
  const products = Array.from({ length: 101 }, (_, index) => ({ ...product, id: `p-${index}`, sku: `SKU-${String(index).padStart(3, '0')}`, name: `Product ${index}` }));
  const html = renderToStaticMarkup(<ProductManagement products={products} warehouseStock={{}} branchStock={{}} vendorId="v" activeStaff={{ id: 'm', vendorId: 'v', name: 'Manager', email: 'm@example.com', role: 'manager', status: 'active', grantedMenuIds: ['products'], createdAt: 'now' }} onOpenAddProductModal={() => {}} onEditProduct={() => {}} />);
  assert.ok(html.includes('101 Total Products'));
  assert.ok(html.includes('Showing 1–100 of 101 filtered products · 100 per page'));
  assert.ok(html.includes('Page 1 of 2'));
  assert.ok(!html.includes('aria-label="Select SKU-100"'));
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

test('stock cost-center matrix exposes horizontal matrix search and location filters', () => {
  const html = renderToStaticMarkup(<StockCostCenterMatrix vendorId="v" products={[product]} warehouses={[{ id: 'w', vendorId: 'v', name: 'Main Warehouse', code: 'WH-1', location: 'x', isDefault: true, createdAt: 'now' }]} branches={[{ id: 'b', vendorId: 'v', name: 'Main Branch', code: 'BR-1', address: 'x', phone: '', isDefault: true, createdAt: 'now' }]} />);
  for (const text of ['Stock by Cost Center', 'Search all inventory fields, in any order', 'Warehouses only', 'Branches only', 'Main Warehouse', 'Main Branch', 'SKU', 'Product Name', 'Total']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('stock-matrix-scroll'));
  assert.ok(html.includes('aria-label="Cost center type"'));
  assert.ok(html.includes('aria-label="Specific cost center"'));
});
