import { Product, ProductType } from '../../types';
import { CanonicalProductImportRow, ProductImportError } from './domain';

const PRODUCT_TYPES: ProductType[] = ['INVENTORY', 'NON_INVENTORY', 'SERVICE', 'BOM', 'OTHER'];

function add(row: CanonicalProductImportRow, field: string, reason: string, code: string): void {
  row.errors.push({ row: row.rowNumber, field, reason, code });
}

export function validateImportRows(rows: CanonicalProductImportRow[], validLocationCodes: string[]): ProductImportError[] {
  const locations = new Set(validLocationCodes.map(code => code.trim().toLowerCase()));
  rows.forEach(row => {
    if (!row.sku) add(row, 'SKU', 'SKU is required.', 'REQUIRED');
    if (!row.name) add(row, 'Product Name', 'Product Name is required.', 'REQUIRED');
    if (!row.category) add(row, 'Category', 'Category is required.', 'REQUIRED');
    if (!row.unitOfMeasure) add(row, 'UM', 'Unit of measure is required.', 'REQUIRED');
    if (!row.productType || !PRODUCT_TYPES.includes(row.productType)) add(row, 'Product Type', 'Use INVENTORY, NON_INVENTORY, SERVICE, BOM or OTHER.', 'INVALID_PRODUCT_TYPE');
    for (const [field, value] of [['Cost', row.costPrice], ['Price', row.sellingPrice], ['Qty', row.quantity], ['Reorder Level', row.reorderLevel]] as const) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) add(row, field, `${field} must be numeric and at least zero.`, 'INVALID_NUMBER');
    }
    const qty = row.quantity ?? 0;
    if (row.productType === 'INVENTORY') {
      if (row.costPrice === undefined) add(row, 'Cost', 'Cost is required for inventory products.', 'REQUIRED');
      if (row.sellingPrice === undefined) add(row, 'Price', 'Price is required for inventory products.', 'REQUIRED');
      if (row.quantity === undefined) add(row, 'Qty', 'Qty is required for inventory products.', 'REQUIRED');
      if (qty > 0 && !row.locationCode) add(row, 'Location', 'Location is required when Qty is greater than zero.', 'REQUIRED');
    }
    if (row.locationCode && !locations.has(row.locationCode.toLowerCase())) add(row, 'Location', 'Unknown warehouse or branch location code.', 'UNKNOWN_LOCATION');
    if (['NON_INVENTORY', 'SERVICE', 'OTHER'].includes(row.productType || '') && qty !== 0) add(row, 'Qty', `${row.productType} Qty must be blank or zero.`, 'QUANTITY_NOT_ALLOWED');
    if (row.productType === 'SERVICE' && (row.locationCode || row.shelfCode || row.binCode)) add(row, 'Location', 'SERVICE location, shelf and bin must be blank.', 'LOCATION_NOT_ALLOWED');
  });
  for (const [field, read, code] of [
    ['SKU', (row: CanonicalProductImportRow) => row.sku, 'DUPLICATE_SKU'],
    ['Barcode', (row: CanonicalProductImportRow) => row.barcode, 'DUPLICATE_BARCODE'],
  ] as const) {
    const seen = new Map<string, number>();
    rows.forEach(row => {
      const value = read(row).toLowerCase(); if (!value) return;
      if (seen.has(value)) add(row, field, `Duplicates row ${seen.get(value)} in this import batch.`, code);
      else seen.set(value, row.rowNumber);
    });
  }
  const seenAlu = new Map<string, number>();
  rows.forEach(row => { const value = row.alternativeLookupCode.toLowerCase(); if (!value) return; if (seenAlu.has(value)) row.warnings.push(`ALU duplicates row ${seenAlu.get(value)} and requires review.`); else seenAlu.set(value, row.rowNumber); });
  return rows.flatMap(row => row.errors);
}

function tokens(value: string): Set<string> { return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)); }
function similarity(a: string, b: string): number {
  const left = tokens(a); const right = tokens(b); const union = new Set([...left, ...right]);
  return union.size ? [...left].filter(value => right.has(value)).length / union.size : 0;
}

export function detectProductDuplicates(rows: CanonicalProductImportRow[], products: Product[]): void {
  rows.forEach(row => {
    const exact = products.find(product => product.sku.toLowerCase() === row.sku.toLowerCase())
      || (row.barcode ? products.find(product => product.barcode?.toLowerCase() === row.barcode.toLowerCase()) : undefined);
    const alu = row.alternativeLookupCode ? products.find(product => product.alternativeLookupCode?.toLowerCase() === row.alternativeLookupCode.toLowerCase()) : undefined;
    if (exact) { row.duplicateProduct = exact; row.warnings.push('Exact SKU or barcode duplicate requires an explicit decision.'); }
    else if (alu) { row.duplicateProduct = alu; row.warnings.push('Duplicate ALU requires deliberate review.'); }
    else {
      const fuzzy = products.map(product => ({ product, score: similarity(row.name, product.name) })).sort((a, b) => b.score - a.score)[0];
      if (fuzzy?.score >= 0.65) row.warnings.push(`Possible name duplicate: ${fuzzy.product.name}. No merge will occur automatically.`);
    }
  });
}
