import assert from 'node:assert/strict';
import test from 'node:test';
import { Product } from '../../types';
import {
  assertCanonicalProductReference, assertDuplicateDecision, checkProductDuplicates, DEFAULT_PRODUCT_COLUMNS,
  effectiveProductTaxRate, loadProductColumnPreference, normalizeHsCode, normalizeProductColumns,
  PRODUCT_FORM_FIELD_ORDER, PRODUCT_SECTORS, saveProductColumnPreference, searchCatalogProducts,
  SECTOR_ATTRIBUTE_FIELDS, sortCatalogProducts, TAX_OPTIONS, validateHsCode,
} from '.';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  get length() { return this.data.size; }
}

const product = (id: string, overrides: Partial<Product> = {}): Product => ({
  id, vendorId: 'vendor-1', sku: `SKU-${id}`, name: `Product ${id}`, description: '', category: 'General',
  costPrice: 10, sellingPrice: 15, unitOfMeasure: 'pcs', productType: 'INVENTORY', sector: 'GENERAL',
  sectorAttributes: {}, taxOption: 'STANDARD_RATED', reorderLevel: 2, status: 'active', createdAt: '2026-01-01', ...overrides,
});
const context = (value: Product, locationName = 'Main Warehouse', shelfCode = 'Shelf 1', quantity = 2) => ({ product: value, locationName, shelfCode, binCode: 'A3', quantity });

test.beforeEach(() => Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true }));

test('canonical form, sector and tax controls are complete and ordered', () => {
  assert.deepEqual(PRODUCT_FORM_FIELD_ORDER, ['productType', 'sector', 'category', 'name', 'sku', 'barcode', 'description', 'costPrice', 'sellingPrice', 'quantity', 'location', 'shelfCode', 'binCode', 'unitOfMeasure', 'size', 'alternativeLookupCode', 'hsCode', 'taxOption', 'reorderLevel', 'primarySupplier', 'brandManufacturer', 'sectorAttributes', 'status']);
  assert.equal(PRODUCT_SECTORS.length, 9); assert.equal(TAX_OPTIONS.length, 5);
  assert.ok(SECTOR_ATTRIBUTE_FIELDS.MOTOR_SPARES.includes('oemNumber'));
  assert.ok(SECTOR_ATTRIBUTE_FIELDS.PHARMACY.includes('expiryTrackingRequired'));
  assert.ok(SECTOR_ATTRIBUTE_FIELDS.SERVICES.includes('requiresAppointment'));
});

test('HS code stays a normalized string and tax derives from vendor configuration', () => {
  assert.equal(normalizeHsCode(' 01. 01 / 21 '), '01.01/21');
  assert.equal(validateHsCode('01.01/21'), null); assert.match(validateHsCode('!') || '', /HS Code/);
  assert.equal(effectiveProductTaxRate('STANDARD_RATED', 15.5), 15.5);
  for (const option of ['ZERO_RATED', 'EXEMPT', 'NON_TAXABLE', 'OUT_OF_SCOPE'] as const) assert.equal(effectiveProductTaxRate(option, 15.5), 0);
});

test('catalog search is token-order independent across mixed fields and ranks exact identifiers first', () => {
  const honda = product('honda', { sku: '40580', name: 'Ball Joint Honda Fit GD1', description: 'Front suspension component', category: 'Motor Spares', hsCode: '8708.80', sector: 'MOTOR_SPARES', sectorAttributes: { vehicleMake: 'Honda', vehicleModel: 'Fit GD1' } });
  const toyota = product('toyota', { sku: '40581', name: 'Toyota Radiator', description: 'Engine cooling', category: 'Motor Spares' });
  const rows = [context(toyota, 'Branch Two', 'Shelf 8'), context(honda, 'Main Branch', 'Shelf 01')];
  assert.equal(searchCatalogProducts(rows, 'Honda GD1 ball joint')[0].product.id, 'honda');
  assert.equal(searchCatalogProducts(rows, 'joint ball GD1 Honda')[0].product.id, 'honda');
  assert.equal(searchCatalogProducts(rows, '40580 Ball Joint')[0].product.id, 'honda');
  assert.equal(searchCatalogProducts(rows, 'Motor Main Branch')[0].product.id, 'honda');
  assert.equal(searchCatalogProducts(rows, 'suspension')[0].product.id, 'honda');
  assert.equal(searchCatalogProducts(rows, 'Shelf 01')[0].product.id, 'honda');
  assert.equal(searchCatalogProducts(rows, '8708.80')[0].product.id, 'honda');
  assert.equal(searchCatalogProducts(rows, 'Honda Fit GD1')[0].product.id, 'honda');
  assert.equal(searchCatalogProducts(rows, '40580')[0].matchType, 'EXACT');
  assert.deepEqual(searchCatalogProducts(rows, 'unrelated banana engine'), []);
});

test('explicit stable sorting supports both directions and location context', () => {
  const rows = [context(product('b', { sku: '20', name: 'Beta', category: 'Z' }), 'West', 'S2'), context(product('a', { sku: '3', name: 'Alpha', category: 'A' }), 'East', 'S1')];
  assert.deepEqual(sortCatalogProducts(rows, 'sku', 'asc').map(row => row.product.id), ['a', 'b']);
  assert.deepEqual(sortCatalogProducts(rows, 'sku', 'desc').map(row => row.product.id), ['b', 'a']);
  assert.deepEqual(sortCatalogProducts(rows, 'name', 'asc').map(row => row.product.id), ['a', 'b']);
  assert.equal(sortCatalogProducts(rows, 'category', 'asc')[0].product.id, 'a');
  assert.equal(sortCatalogProducts(rows, 'location', 'asc')[0].product.id, 'a');
  assert.equal(sortCatalogProducts(rows, 'shelf', 'asc')[0].product.id, 'a');
});

test('column preferences are tenant/user scoped and cannot hide every identifier', () => {
  assert.deepEqual(loadProductColumnPreference('v', 'a'), DEFAULT_PRODUCT_COLUMNS);
  saveProductColumnPreference('v', 'a', 'manager', ['sku', 'hsCode']);
  assert.deepEqual(loadProductColumnPreference('v', 'a'), ['sku', 'hsCode']);
  assert.deepEqual(loadProductColumnPreference('v', 'b'), DEFAULT_PRODUCT_COLUMNS);
  assert.deepEqual(loadProductColumnPreference('other', 'a'), DEFAULT_PRODUCT_COLUMNS);
  assert.deepEqual(normalizeProductColumns(['hsCode']), ['name', 'hsCode']);
});

test('duplicates block exact identifiers, warn on ALU and require a reason without merging quantity', () => {
  const existing = product('one', { sku: 'ABC-1', barcode: '00123', alternativeLookupCode: 'ALT-9', name: 'Honda Ball Joint' });
  assert.equal(checkProductDuplicates({ ...product('two'), sku: 'abc1' }, [existing])[0].blocking, true);
  assert.equal(checkProductDuplicates({ ...product('two'), barcode: '00-123' }, [existing])[0].blocking, true);
  const alu = checkProductDuplicates({ ...product('two'), alternativeLookupCode: 'alt9', name: 'Other' }, [existing]);
  assert.equal(alu[0].blocking, false); assert.throws(() => assertDuplicateDecision(alu, { decision: 'CONTINUE_SEPARATE', actorId: 'm' }, 'manager'), /reason/i);
  assert.doesNotThrow(() => assertDuplicateDecision(alu, { decision: 'CONTINUE_SEPARATE', actorId: 'm', reason: 'Different specification' }, 'manager'));
  assert.equal(checkProductDuplicates({ ...product('two'), name: 'Joint Ball Honda' }, [existing])[0].reasons.includes('SIMILAR_NAME'), true);
});

test('ledger references cannot create implicit, archived or ambiguous product identities', () => {
  const canonical = product('one', { sku: 'ABC' });
  assert.equal(assertCanonicalProductReference([canonical], 'one').id, 'one');
  assert.throws(() => assertCanonicalProductReference([canonical], 'missing'), /cannot create products implicitly/);
  assert.throws(() => assertCanonicalProductReference([{ ...canonical, status: 'archived' }], 'one'), /archived/);
  assert.throws(() => assertCanonicalProductReference([canonical, product('two', { sku: 'A-B-C' })], 'one'), /unresolved/);
});
