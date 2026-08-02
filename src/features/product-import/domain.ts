import { Product, ProductType } from '../../types';

export const PRODUCT_IMPORT_TEMPLATE_NAME = 'ITRED_PRODUCT_IMPORT';
export const PRODUCT_IMPORT_TEMPLATE_VERSION = '1.0.0';
export const PRODUCT_IMPORT_SCHEMA_VERSION = '1';

export const CANONICAL_PRODUCT_HEADERS = [
  'SKU', 'Product Name', 'Description', 'Category', 'Size', 'Cost', 'Price', 'Qty',
  'UM', 'Location', 'Alternative Look Up (ALU)', 'Product Type', 'Barcode', 'Shelf',
  'Bin', 'Reorder Level',
] as const;

export type CanonicalProductHeader = typeof CANONICAL_PRODUCT_HEADERS[number];
export type ProductImportDecision = 'CREATE' | 'UPDATE_EXISTING' | 'OPENING_BALANCE' | 'SKIP';

export interface ProductImportError {
  row: number;
  field: string;
  reason: string;
  code: string;
}

export interface CanonicalProductImportRow {
  rowNumber: number;
  sku: string;
  name: string;
  description: string;
  category: string;
  size: string;
  costPrice?: number;
  sellingPrice?: number;
  quantity?: number;
  unitOfMeasure: string;
  locationCode: string;
  alternativeLookupCode: string;
  productType?: ProductType;
  barcode: string;
  shelfCode: string;
  binCode: string;
  reorderLevel?: number;
  errors: ProductImportError[];
  warnings: string[];
  duplicateProduct?: Product;
  decision?: ProductImportDecision;
}

export interface ProductImportBatch {
  batchId: string;
  fileName: string;
  headers: string[];
  rows: CanonicalProductImportRow[];
  errors: ProductImportError[];
  templateVersion?: string;
}

export interface ProductImportLocation {
  id: string;
  code: string;
  name: string;
  type: 'warehouse' | 'branch';
}

export function toProductMaster(row: CanonicalProductImportRow): Partial<Product> {
  return {
    sku: row.sku,
    name: row.name,
    description: row.description,
    category: row.category,
    size: row.size || undefined,
    costPrice: row.costPrice ?? 0,
    sellingPrice: row.sellingPrice ?? 0,
    unitOfMeasure: row.unitOfMeasure,
    alternativeLookupCode: row.alternativeLookupCode || undefined,
    productType: row.productType,
    barcode: row.barcode || undefined,
    reorderLevel: row.reorderLevel ?? 0,
    status: 'active',
  };
}
