import assert from 'node:assert/strict';
import test from 'node:test';
import { Product } from '../../types';
import { buildOpeningBalanceRequest, CANONICAL_PRODUCT_HEADERS, createProductTemplateWorkbook } from '.';
import { parseCanonicalMatrix, parseCsv, parseProductImportFile, validateHeaders, validateImportFile } from './parser';
import { detectProductDuplicates } from './validator';

const valid = ['SKU-1', 'Widget', 'Quoted, useful product', 'General', 'M', '1', '2', '0', 'pcs', '', 'ALU-1', 'INVENTORY', '123', 'S1', 'B1', '2', 'GENERAL', '0101.21', 'STANDARD_RATED', '', '', '', ''];
const matrix = (row: unknown[] = valid) => [[...CANONICAL_PRODUCT_HEADERS], row];

test('canonical CSV is accepted and quoted commas map only to Description', () => {
  const csv = `${CANONICAL_PRODUCT_HEADERS.join(',')}\r\nSKU-1,Widget,"Quoted, useful product",General,M,1,2,0,pcs,,ALU-1,INVENTORY,123,S1,B1,2,GENERAL,0101.21,STANDARD_RATED,,,,\r\n`;
  const batch = parseCanonicalMatrix(parseCsv(csv), 'products.csv', []);
  assert.equal(batch.errors.length, 0); assert.equal(batch.rows[0].sku, 'SKU-1'); assert.equal(batch.rows[0].name, 'Widget'); assert.equal(batch.rows[0].category, 'General'); assert.equal(batch.rows[0].description, 'Quoted, useful product');
});

test('canonical XLSX is accepted with authoritative metadata', async () => {
  const workbook = await createProductTemplateWorkbook({ categories: [], locations: [] });
  workbook.getWorksheet('Products')!.addRow(valid);
  const bytes = await workbook.xlsx.writeBuffer();
  const batch = await parseProductImportFile(new File([bytes], 'products.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), []);
  assert.deepEqual(batch.errors, []); assert.equal(batch.rows[0].name, 'Widget');
});

test('only CSV and XLSX extensions are accepted', () => {
  for (const name of ['products.txt', 'products.tsv', 'products.xls', 'products.pdf', 'products.json']) assert.match(validateImportFile({ name, type: 'text/plain' }) || '', /Only/);
});

test('wrong, missing, duplicate and reordered headers reject the complete template', () => {
  const wrong: string[] = [...CANONICAL_PRODUCT_HEADERS]; wrong[0] = 'Stock Code'; assert.ok(validateHeaders(wrong).length);
  assert.ok(validateHeaders(CANONICAL_PRODUCT_HEADERS.slice(0, -1)).some(error => error.code === 'MISSING_HEADER'));
  const duplicate: string[] = [...CANONICAL_PRODUCT_HEADERS]; duplicate[1] = 'SKU'; assert.ok(validateHeaders(duplicate).some(error => error.code === 'DUPLICATE_HEADER'));
  const reordered: string[] = [...CANONICAL_PRODUCT_HEADERS]; [reordered[0], reordered[1]] = [reordered[1], reordered[0]]; assert.ok(validateHeaders(reordered).some(error => error.code === 'HEADER_ORDER'));
});

test('blank quantity never becomes 10 and invalid quantities/locations are rejected', () => {
  const blankRow = [...valid]; blankRow[7] = ''; const blank = parseCanonicalMatrix(matrix(blankRow), 'products.csv', []); assert.equal(blank.rows[0].quantity, undefined);
  const negative = [...valid]; negative[7] = '-1'; assert.ok(parseCanonicalMatrix(matrix(negative), 'products.csv', []).errors.some(error => error.field === 'Qty'));
  const unknown = [...valid]; unknown[7] = '2'; unknown[9] = 'NOPE'; assert.ok(parseCanonicalMatrix(matrix(unknown), 'products.csv', ['WH-1']).errors.some(error => error.code === 'UNKNOWN_LOCATION'));
  const service = [...valid]; service[7] = '1'; service[11] = 'SERVICE'; assert.ok(parseCanonicalMatrix(matrix(service), 'products.csv', []).errors.some(error => error.code === 'QUANTITY_NOT_ALLOWED'));
});

test('duplicate SKU and possible name matches require explicit decisions and never auto-merge', () => {
  const product: Product = { id: 'p1', vendorId: 'v1', sku: 'SKU-1', name: 'Widget Blue Large', category: 'General', costPrice: 1, sellingPrice: 2, unit: 'pcs', reorderLevel: 0, createdAt: 'now' };
  const exact = parseCanonicalMatrix(matrix(), 'products.csv', []).rows; detectProductDuplicates(exact, [product]); assert.equal(exact[0].decision, undefined); assert.equal(exact[0].duplicateProduct?.id, 'p1');
  const fuzzyRow = [...valid]; fuzzyRow[0] = 'SKU-2'; fuzzyRow[1] = 'Large Blue Widget'; fuzzyRow[12] = '';
  const fuzzy = parseCanonicalMatrix(matrix(fuzzyRow), 'products.csv', []).rows; detectProductDuplicates(fuzzy, [product]); assert.equal(fuzzy[0].duplicateProduct?.id, 'p1'); assert.equal(fuzzy[0].decision, undefined);
});

test('import quantity creates a controlled opening-balance request instead of a movement', () => {
  const rowData = [...valid]; rowData[7] = '5'; rowData[9] = 'WH-1';
  const batch = parseCanonicalMatrix(matrix(rowData), 'products.csv', ['WH-1']); const row = batch.rows[0];
  const product: Product = { id: 'p1', vendorId: 'v1', sku: row.sku, name: row.name, category: row.category, costPrice: 1, sellingPrice: 2, unitOfMeasure: 'pcs', productType: 'INVENTORY', reorderLevel: 0, createdAt: 'now' };
  const request = buildOpeningBalanceRequest(batch, row, product, { id: 'wh', code: 'WH-1', name: 'Warehouse', type: 'warehouse' }, { id: 'staff', name: 'Staff', role: 'warehouse_staff' });
  assert.equal(request.entityType, 'OPENING_BALANCE_ADJUSTMENT'); assert.equal(request.dataPayload.items?.[0].quantityDelta, 5); assert.ok(request.dataPayload.idempotencyKey); assert.equal('movement' in request, false);
});
