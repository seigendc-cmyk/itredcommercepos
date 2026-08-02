import { Product, ProductSector, ProductType, TaxOption } from '../../types';

export const PRODUCT_IMPORT_TEMPLATE_NAME = 'ITRED_PRODUCT_IMPORT';
export const PRODUCT_IMPORT_TEMPLATE_VERSION = '2.0.0';
export const PRODUCT_IMPORT_SCHEMA_VERSION = '2';

export const CANONICAL_PRODUCT_HEADERS = [
  'SKU', 'Product Name', 'Description', 'Category', 'Size', 'Cost', 'Price', 'Qty',
  'UM', 'Location', 'Alternative Look Up (ALU)', 'Product Type', 'Barcode', 'Shelf',
  'Bin', 'Reorder Level', 'Industrial Sector', 'HS Code', 'Tax Option', 'Primary Supplier ID',
  'Primary Supplier Name', 'Brand', 'Manufacturer',
] as const;

export type CanonicalProductHeader = typeof CANONICAL_PRODUCT_HEADERS[number];
export type ProductImportDecision = 'CREATE' | 'USE_EXISTING' | 'UPDATE_EXISTING' | 'CONTINUE_SEPARATE' | 'OPENING_BALANCE' | 'SKIP';

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
  sector?: ProductSector;
  hsCode: string;
  taxOption?: TaxOption;
  primarySupplierId: string;
  primarySupplierName: string;
  brand: string;
  manufacturer: string;
  errors: ProductImportError[];
  warnings: string[];
  duplicateProduct?: Product;
  decision?: ProductImportDecision;
  duplicateReason?: string;
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
    sector: row.sector,
    hsCode: row.hsCode || undefined,
    taxOption: row.taxOption,
    primarySupplierId: row.primarySupplierId || undefined,
    primarySupplierName: row.primarySupplierName || undefined,
    brand: row.brand || undefined,
    manufacturer: row.manufacturer || undefined,
    location: row.locationCode || undefined,
    shelfCode: row.shelfCode || undefined,
    shelf: row.shelfCode || undefined,
    binCode: row.binCode || undefined,
    bin: row.binCode || undefined,
    status: 'active',
  };
}
