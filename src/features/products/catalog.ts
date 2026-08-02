import { Product, ProductSector, ProductType, StaffRole, TaxOption } from '../../types';
import { assertExtendedProductPermission } from './permissions';

export type ProductColumnId = 'sku' | 'name' | 'description' | 'category' | 'productType' | 'sector' | 'size' | 'costPrice' | 'sellingPrice' | 'quantity' | 'unitOfMeasure' | 'location' | 'shelf' | 'bin' | 'alternativeLookupCode' | 'barcode' | 'hsCode' | 'taxOption' | 'reorderLevel' | 'primarySupplier' | 'status' | 'createdAt' | 'updatedAt';
export const ALL_PRODUCT_COLUMNS: ProductColumnId[] = ['sku', 'name', 'description', 'category', 'productType', 'sector', 'size', 'costPrice', 'sellingPrice', 'quantity', 'unitOfMeasure', 'location', 'shelf', 'bin', 'alternativeLookupCode', 'barcode', 'hsCode', 'taxOption', 'reorderLevel', 'primarySupplier', 'status', 'createdAt', 'updatedAt'];
export const DEFAULT_PRODUCT_COLUMNS: ProductColumnId[] = ['sku', 'name', 'category', 'productType', 'costPrice', 'sellingPrice', 'quantity', 'unitOfMeasure', 'location', 'alternativeLookupCode'];

export type ProductSortField = 'sku' | 'name' | 'category' | 'location' | 'shelf' | 'productType' | 'sector' | 'costPrice' | 'sellingPrice' | 'quantity' | 'reorderLevel' | 'hsCode' | 'status';
export interface ProductCatalogContext { product: Product; locationName: string; shelfCode: string; binCode: string; quantity: number; }
export interface ProductCatalogFilters {
  productType?: ProductType | 'ALL'; sector?: ProductSector | 'ALL'; category?: string; taxOption?: TaxOption | 'ALL'; hsCode?: string;
  location?: string; shelf?: string; bin?: string; status?: 'active' | 'archived' | 'ALL'; stockState?: 'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK' | 'REORDER';
  supplier?: string; minPrice?: number; maxPrice?: number; minCost?: number; maxCost?: number;
}
export interface ProductSearchResult extends ProductCatalogContext { score: number; matchType: 'EXACT' | 'STRONG' | 'POSSIBLE'; }

export function normalizeSearchText(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/([a-z])([0-9])/g, '$1 $2').replace(/([0-9])([a-z])/g, '$1 $2').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
export function tokenizeSearch(value: unknown): string[] { return normalizeSearchText(value).split(' ').filter(token => token.length > 0); }

function sectorStrings(product: Product): string[] {
  return Object.values(product.sectorAttributes || {}).filter(value => typeof value === 'string') as string[];
}

function searchableFields(context: ProductCatalogContext): string[] {
  const product = context.product;
  return [product.sku, product.name, product.description, product.category, product.size, product.unitOfMeasure, product.unit, context.locationName, context.shelfCode, context.binCode, product.alternativeLookupCode, product.productType, product.sector, product.barcode, product.hsCode, product.taxOption, product.brand, product.manufacturer, product.manufacturerCode, product.primarySupplierName, ...sectorStrings(product)].filter(Boolean) as string[];
}

function tokenSimilarity(left: string[], right: string[]): number {
  const a = new Set(left); const b = new Set(right); const union = new Set([...a, ...b]);
  return union.size ? [...a].filter(token => b.has(token)).length / union.size : 0;
}

export function searchCatalogProducts(contexts: ProductCatalogContext[], query: string): ProductSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = tokenizeSearch(query);
  if (!queryTokens.length) return contexts.map(context => ({ ...context, score: 0, matchType: 'STRONG' as const }));
  return contexts.flatMap((context, stableIndex) => {
    const product = context.product;
    const fields = searchableFields(context).map(normalizeSearchText);
    const document = fields.join(' ');
    const allTokensMatch = queryTokens.every(token => document.includes(token));
    const name = normalizeSearchText(product.name);
    const sku = normalizeSearchText(product.sku); const barcode = normalizeSearchText(product.barcode); const alu = normalizeSearchText(product.alternativeLookupCode);
    let score = 0; let matchType: ProductSearchResult['matchType'] = 'STRONG';
    if (sku === normalizedQuery) { score = 1000; matchType = 'EXACT'; }
    else if (barcode && barcode === normalizedQuery) { score = 950; matchType = 'EXACT'; }
    else if (alu && alu === normalizedQuery) { score = 900; matchType = 'EXACT'; }
    else if (name === normalizedQuery) { score = 850; matchType = 'EXACT'; }
    else if (name.startsWith(normalizedQuery)) score = 800;
    else if (queryTokens.every(token => name.includes(token))) score = 750;
    else if (allTokensMatch) score = 600 + queryTokens.filter(token => [name, normalizeSearchText(product.category), normalizeSearchText(product.description)].some(value => value.includes(token))).length * 10;
    else {
      const similarity = tokenSimilarity(queryTokens, tokenizeSearch(product.name));
      if (similarity < 0.65) return [];
      score = Math.round(similarity * 100); matchType = 'POSSIBLE';
    }
    return [{ ...context, score: score - stableIndex / 100000, matchType }];
  }).sort((a, b) => b.score - a.score);
}

export function filterCatalogProducts(contexts: ProductCatalogContext[], filters: ProductCatalogFilters): ProductCatalogContext[] {
  return contexts.filter(({ product, locationName, shelfCode, binCode, quantity }) => {
    if (filters.productType && filters.productType !== 'ALL' && (product.productType || 'INVENTORY') !== filters.productType) return false;
    if (filters.sector && filters.sector !== 'ALL' && product.sector !== filters.sector) return false;
    if (filters.category && product.category !== filters.category) return false;
    if (filters.taxOption && filters.taxOption !== 'ALL' && product.taxOption !== filters.taxOption) return false;
    if (filters.hsCode && !normalizeSearchText(product.hsCode).includes(normalizeSearchText(filters.hsCode))) return false;
    if (filters.location && !normalizeSearchText(locationName).includes(normalizeSearchText(filters.location))) return false;
    if (filters.shelf && shelfCode !== filters.shelf) return false;
    if (filters.bin && binCode !== filters.bin) return false;
    if (filters.status && filters.status !== 'ALL' && (product.status || 'active') !== filters.status) return false;
    if (filters.supplier && !normalizeSearchText(product.primarySupplierName).includes(normalizeSearchText(filters.supplier))) return false;
    if (filters.minPrice !== undefined && product.sellingPrice < filters.minPrice) return false;
    if (filters.maxPrice !== undefined && product.sellingPrice > filters.maxPrice) return false;
    if (filters.minCost !== undefined && product.costPrice < filters.minCost) return false;
    if (filters.maxCost !== undefined && product.costPrice > filters.maxCost) return false;
    if (filters.stockState === 'IN_STOCK' && quantity <= 0) return false;
    if (filters.stockState === 'OUT_OF_STOCK' && quantity !== 0) return false;
    if (filters.stockState === 'REORDER' && quantity > product.reorderLevel) return false;
    return true;
  });
}

export function sortCatalogProducts(contexts: ProductCatalogContext[], field: ProductSortField, direction: 'asc' | 'desc'): ProductCatalogContext[] {
  const read = (context: ProductCatalogContext): string | number => {
    if (field === 'location') return context.locationName;
    if (field === 'shelf') return context.shelfCode;
    if (field === 'quantity') return context.quantity;
    const value = context.product[field];
    return typeof value === 'number' ? value : String(value || '');
  };
  return contexts.map((context, index) => ({ context, index })).sort((left, right) => {
    const a = read(left.context); const b = read(right.context);
    const compared = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    return (direction === 'asc' ? compared : -compared) || left.index - right.index;
  }).map(item => item.context);
}

function preferenceKey(vendorId: string, staffId: string): string { return `itred_product_columns_${vendorId}_${staffId}`; }
export function normalizeProductColumns(columns: ProductColumnId[]): ProductColumnId[] {
  const valid = Array.from(new Set(columns.filter(column => ALL_PRODUCT_COLUMNS.includes(column))));
  if (!valid.includes('sku') && !valid.includes('name')) valid.unshift('name');
  return valid;
}
export function loadProductColumnPreference(vendorId: string, staffId: string): ProductColumnId[] {
  try { const raw = localStorage.getItem(preferenceKey(vendorId, staffId)); return raw ? normalizeProductColumns(JSON.parse(raw)) : DEFAULT_PRODUCT_COLUMNS; }
  catch { return DEFAULT_PRODUCT_COLUMNS; }
}
export function saveProductColumnPreference(vendorId: string, staffId: string, role: StaffRole, columns: ProductColumnId[]): ProductColumnId[] {
  assertExtendedProductPermission(role, 'product.columns.configure');
  const normalized = normalizeProductColumns(columns); localStorage.setItem(preferenceKey(vendorId, staffId), JSON.stringify(normalized)); return normalized;
}
