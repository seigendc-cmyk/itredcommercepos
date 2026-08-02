import { Product, ProductType } from '../../types';
import { CanonicalProductImportRow, ProductImportError } from './domain';
import { checkProductDuplicates, PRODUCT_SECTORS, TAX_OPTIONS, validateHsCode } from '../products';

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
    if (!row.sector || !PRODUCT_SECTORS.some(option => option.value === row.sector)) add(row, 'Industrial Sector', 'Use a controlled industrial sector value.', 'INVALID_SECTOR');
    if (!row.taxOption || !TAX_OPTIONS.some(option => option.value === row.taxOption)) add(row, 'Tax Option', 'Use a controlled Tax Option value.', 'INVALID_TAX_OPTION');
    const hsError = validateHsCode(row.hsCode); if (hsError) add(row, 'HS Code', hsError, 'INVALID_HS_CODE');
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

export function detectProductDuplicates(rows: CanonicalProductImportRow[], products: Product[]): void {
  rows.forEach(row => {
    const matches = checkProductDuplicates({ ...row, vendorId: products[0]?.vendorId, alternativeLookupCode: row.alternativeLookupCode, sectorAttributes: {} }, products);
    const match = matches[0];
    if (!match) return;
    row.duplicateProduct = match.product;
    row.warnings.push(match.blocking
      ? `Exact identifier duplicate (${match.reasons.join(', ')}) requires Use Existing or an explicit update.`
      : `Possible duplicate ${match.product.name} (${match.reasons.join(', ')}). No merge will occur automatically.`);
  });
}
