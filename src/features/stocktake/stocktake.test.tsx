import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StocktakeWorkspace } from '../../components/Inventory/StocktakeWorkspace';
import { ManagedStocktakeWorkspace } from '../../components/Inventory/ManagedStocktakeWorkspace';
import { Product, StaffMember, Warehouse } from '../../types';
import {
  buildCycleCountSchedule,
  buildStocktakePdfTable,
  createStocktakeCsv,
  createStocktakeWorkbook,
  deriveStocktakeDayStatus,
  filterStocktakeRows,
  hasStocktakePermission,
  loadStocktakeDraft,
  loadStocktakeWorkingContext,
  resolveStocktakeRows,
  saveStocktakeDraft,
  saveStocktakeWorkingContext,
  StocktakeExportContext,
  summarizeStocktake,
} from '.';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
  key(index: number) { return Array.from(this.data.keys())[index] ?? null; }
  get length() { return this.data.size; }
}

const warehouse: Warehouse = { id: 'warehouse-1', vendorId: 'vendor-1', code: 'WH-01', name: 'Main Warehouse', location: 'Harare', isDefault: true, createdAt: '2026-01-01' };
const staff: StaffMember = { id: 'staff-1', vendorId: 'vendor-1', name: 'Warehouse User', email: 'warehouse@example.com', role: 'warehouse_staff', grantedMenuIds: ['products'], status: 'active', createdAt: '2026-01-01' };

function product(id: string, shelf: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    vendorId: 'vendor-1',
    sku: `SKU-${id}`,
    name: `Product ${id}`,
    description: `Description ${id}`,
    category: 'General',
    size: 'M',
    costPrice: 10,
    sellingPrice: 15,
    unitOfMeasure: 'pcs',
    location: 'WH-01',
    shelf,
    bin: `BIN-${id}`,
    productType: 'INVENTORY',
    status: 'active',
    reorderLevel: 1,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

function scheduleProducts() {
  return [
    product('a', 'Shelf 01'),
    product('b', 'Shelf 02'),
    product('c', 'Shelf 03'),
    product('archived', 'Shelf 04', { status: 'archived' }),
    product('service', 'Shelf 05', { productType: 'SERVICE' }),
    product('wrong-location', 'Shelf 06', { location: 'WH-99' }),
    product('missing-location', 'Shelf 07', { location: undefined }),
    product('missing-shelf', '', { shelf: undefined }),
  ];
}

test.beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
});

test('user managed stocktake exposes controlled product count and adjustment workflow', () => {
  const html = renderToStaticMarkup(<ManagedStocktakeWorkspace vendorId="vendor-1" businessName="Test Vendor" currency="$" products={[product('a', 'Shelf 01')]} warehouses={[warehouse]} branches={[]} activeStaff={staff} onSubmit={async () => {}} />);
  for (const label of ['User Managed Stocktake', 'Physical Count', 'Stock Location', 'Reference', 'Add All Filtered', 'Add Selected', 'SKU', 'Product Name', 'Category', 'Shelf No.', 'Sys Qty', 'Physical Qty', 'Qty Variance', 'Move 0 Variance Items to Stock Adjustment']) assert.ok(html.includes(label), label);
  assert.ok(html.includes('aria-label="Select stocktake products"'));
  assert.ok(html.includes('aria-label="Filter by shelf number"'));
});

test('working-day selection resolves explicit shelves and only assigned active inventory products', () => {
  const products = scheduleProducts();
  const schedule = buildCycleCountSchedule({ vendorId: 'vendor-1', stockLocationId: warehouse.id, stockLocationAliases: [warehouse.id, warehouse.code, warehouse.name], products, now: new Date('2026-08-02T10:00:00.000Z') });
  assert.deepEqual(schedule.shelvesByDay[1], ['Shelf 01']);
  assert.deepEqual(schedule.shelvesByDay[2], ['Shelf 02']);
  const day1 = resolveStocktakeRows({ schedule, workingDayNumber: 1, products, stockLocation: { id: warehouse.id, name: warehouse.name }, stock: { a: 7, b: 9 } });
  const day2 = resolveStocktakeRows({ schedule, workingDayNumber: 2, products, stockLocation: { id: warehouse.id, name: warehouse.name }, stock: { a: 7, b: 9 } });
  assert.deepEqual(day1.map(row => row.productId), ['a']);
  assert.deepEqual(day2.map(row => row.productId), ['b']);
  assert.equal(day2[0].systemQuantity, 9);
  assert.equal(day2[0].shelfCode, 'Shelf 02');
  assert.equal(day2[0].binCode, 'BIN-b');
  assert.ok(!schedule.assignments.some(item => ['archived', 'service', 'wrong-location', 'missing-location', 'missing-shelf'].includes(item.productId)));
  assert.throws(() => resolveStocktakeRows({ schedule, workingDayNumber: 27, products, stockLocation: { id: warehouse.id, name: warehouse.name }, stock: {} }), /between 1 and 26/);
});

test('named stocktake rows drive scoped filters, count totals and valuation', () => {
  const products = [product('a', 'Shelf 01'), product('b', 'Shelf 01', { category: 'Hardware', costPrice: 20 })];
  const schedule = buildCycleCountSchedule({ vendorId: 'vendor-1', stockLocationId: warehouse.id, stockLocationAliases: [warehouse.code], products, now: new Date('2026-08-02T10:00:00.000Z') });
  const rows = resolveStocktakeRows({ schedule, workingDayNumber: 1, products, stockLocation: { id: warehouse.id, name: warehouse.name }, stock: { a: 7, b: 5 } });
  assert.deepEqual([rows[0].sku, rows[0].productName, rows[0].category, rows[0].shelfCode, rows[0].systemQuantity], ['SKU-a', 'Product a', 'General', 'Shelf 01', 7]);
  const counts = { a: 6 };
  const filtered = filterStocktakeRows(rows, { search: 'sku-a', department: 'General', shelf: 'Shelf 01', biCheck: 'ALL', varianceOnly: true, countState: 'COUNTED' }, counts);
  assert.deepEqual(filtered.map(row => row.productId), ['a']);
  assert.deepEqual(summarizeStocktake(rows, counts), { productCount: 2, countedCount: 1, remainingCount: 1, matchingCount: 0, discrepancyCount: 1, totalShrinkageValue: 10, totalSurplusValue: 0, netVarianceValue: -10 });
});

test('drafts remain separate, role-enforced and scoped by cycle, location and day', () => {
  saveStocktakeDraft({ vendorId: 'vendor-1', cycleId: 'cycle-1', stockLocationId: warehouse.id, workingDayNumber: 3, counts: { a: 4 }, reasons: { a: 'Recount' }, savedBy: staff.id }, staff.role);
  assert.deepEqual(loadStocktakeDraft('vendor-1', 'cycle-1', warehouse.id, 3, staff.role)?.counts, { a: 4 });
  assert.equal(loadStocktakeDraft('vendor-1', 'cycle-1', warehouse.id, 4, staff.role), null);
  assert.throws(() => saveStocktakeDraft({ vendorId: 'vendor-1', cycleId: 'cycle-1', stockLocationId: warehouse.id, workingDayNumber: 3, counts: {}, reasons: {}, savedBy: 'cashier' }, 'cashier'), /stocktake.draft.save/);
  assert.equal(deriveStocktakeDayStatus({ rowCount: 2, countedCount: 1, draftSaved: false, submitted: false }), 'IN_PROGRESS');
  assert.equal(deriveStocktakeDayStatus({ rowCount: 2, countedCount: 2, draftSaved: true, submitted: false }), 'READY_FOR_REVIEW');
});

test('saved working context restores its exact day while drafts remain isolated from other days', () => {
  saveStocktakeDraft({ vendorId: 'vendor-1', cycleId: 'cycle-1', stockLocationId: warehouse.id, workingDayNumber: 1, counts: { a: 9 }, reasons: { a: 'SYSTEM_DATA_ENTRY_ERROR' }, savedBy: staff.id }, staff.role);
  saveStocktakeWorkingContext({ vendorId: 'vendor-1', cycleId: 'cycle-1', stockLocationId: warehouse.id, stockLocationType: 'warehouse', workingDayNumber: 1 }, staff.role);
  const restored = loadStocktakeWorkingContext('vendor-1', staff.role);
  assert.deepEqual(restored && { cycleId: restored.cycleId, stockLocationId: restored.stockLocationId, workingDayNumber: restored.workingDayNumber }, { cycleId: 'cycle-1', stockLocationId: warehouse.id, workingDayNumber: 1 });
  assert.equal(loadStocktakeDraft('vendor-1', 'cycle-1', warehouse.id, 1, staff.role)?.counts.a, 9);
  assert.equal(loadStocktakeDraft('vendor-1', 'cycle-1', warehouse.id, 2, staff.role), null);
});

function exportContext(role: StaffMember['role'] = 'manager', blindCountMode = true): StocktakeExportContext {
  const products = [product('a', 'Shelf 01')];
  const schedule = buildCycleCountSchedule({ vendorId: 'vendor-1', stockLocationId: warehouse.id, stockLocationAliases: [warehouse.code], products, now: new Date('2026-08-02T10:00:00.000Z') });
  const rows = resolveStocktakeRows({ schedule, workingDayNumber: 1, products, stockLocation: { id: warehouse.id, name: warehouse.name }, stock: { a: 7 } });
  return { vendorId: 'vendor-1', businessName: 'Test Retailer', actor: { id: 'actor', name: 'Actor', role }, cycleId: schedule.cycleId, workingDayNumber: 1, scheduledDate: schedule.workingDays[0].scheduledDate, stockLocationId: warehouse.id, stockLocationName: warehouse.name, shelfIds: ['Shelf 01'], rows, blindCountMode };
}

test('blind PDF worksheet uses exact selected-day fields and excludes system quantity and valuation', () => {
  const table = buildStocktakePdfTable(exportContext(), { action: 'download', includeNotes: true, includeRecount: true, showSystemQuantity: false });
  assert.ok(table.headers.includes('SKU'));
  assert.ok(table.headers.includes('Physical Count'));
  assert.ok(!table.headers.includes('System Qty'));
  assert.ok(!table.headers.some(header => /cost|valuation/i.test(header)));
  assert.equal(table.body.length, 1);
  assert.ok(table.body[0].includes('SKU-a'));
  assert.throws(() => buildStocktakePdfTable(exportContext('cashier'), { action: 'download', includeNotes: true, includeRecount: true, showSystemQuantity: false }), /stocktake.print/);
});

test('XLSX and CSV exports contain selected-day sheets, hidden metadata and safe canonical columns', async () => {
  const context = exportContext('manager', true);
  const workbook = await createStocktakeWorkbook(context, false);
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Count List', 'Instructions', 'Reference Data', '_Stocktake_Metadata']);
  assert.equal(workbook.getWorksheet('_Stocktake_Metadata')?.state, 'veryHidden');
  const headerValues = workbook.getWorksheet('Count List')!.getRow(1).values as unknown[];
  for (const header of ['Line No.', 'SKU', 'Product Name', 'Description', 'Category', 'Size', 'UM', 'Location', 'Shelf', 'Bin', 'Physical Count', 'Recount', 'Notes', 'Count Status']) assert.ok(headerValues.includes(header), header);
  assert.ok(!headerValues.includes('System Qty'));
  assert.ok(!headerValues.some(value => /cost|price|valuation/i.test(String(value))));
  const csv = createStocktakeCsv(context, false);
  assert.ok(csv.includes('SKU-a'));
  assert.ok(!csv.includes('System Qty'));
  assert.throws(() => createStocktakeCsv(exportContext('cashier'), false), /stocktake.export/);
});

test('stocktake permissions are enforced independently of UI visibility', () => {
  assert.equal(hasStocktakePermission('warehouse_staff', 'stocktake.submit'), true);
  assert.equal(hasStocktakePermission('warehouse_staff', 'stocktake.view_valuation'), false);
  assert.equal(hasStocktakePermission('cashier', 'stocktake.view'), false);
  assert.equal(hasStocktakePermission('manager', 'stocktake.variance.approve'), true);
});

test('sticky header contains the only approval CTA and exposes print/export actions', () => {
  const html = renderToStaticMarkup(<StocktakeWorkspace products={[product('a', 'Shelf 01')]} warehouses={[warehouse]} branches={[]} warehouseStock={{ a: 7 }} branchStock={{}} activeStaff={staff} vendorId="vendor-1" businessName="Test Retailer" onSubmitStocktakeApproval={async () => {}} />);
  assert.ok(html.includes('data-testid="stocktake-sticky-header"'));
  assert.ok(html.includes('top-[52px]'));
  assert.equal(html.split('Submit Stocktake for Manager Approval').length - 1, 1);
  assert.ok(html.includes('data-testid="stocktake-submit-header"'));
  assert.ok(html.includes('Print Count List'));
  assert.ok(html.includes('Export Spreadsheet'));
  assert.ok(html.includes('disabled=""'));
});
