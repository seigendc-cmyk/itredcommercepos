import { Product, StaffRole } from '../../types';
import { assertExtendedProductPermission } from './permissions';
import { normalizeSearchText, tokenizeSearch } from './catalog';

export type DuplicateReason = 'SAME_SKU' | 'SAME_BARCODE' | 'SAME_ALU' | 'SAME_OEM_NUMBER' | 'SAME_MANUFACTURER_PART_NUMBER' | 'SAME_NAME' | 'SIMILAR_NAME' | 'SAME_CATEGORY_SIZE' | 'SAME_VEHICLE_FITMENT';
export interface ProductDuplicateMatch { product: Product; confidence: number; reasons: DuplicateReason[]; blocking: boolean; }
export type ProductDuplicateDecision = 'USE_EXISTING' | 'CONTINUE_SEPARATE' | 'CANCEL';
export interface ProductDuplicateDecisionInput { decision: ProductDuplicateDecision; reason?: string; actorId: string; }

export class ProductDuplicateError extends Error {
  constructor(readonly matches: ProductDuplicateMatch[], readonly blocking: boolean) {
    super(blocking ? 'An exact product identifier already exists.' : 'Possible duplicate product review is required.');
    this.name = 'ProductDuplicateError';
  }
}

export function normalizeProductIdentifier(value: unknown): string { return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ''); }

function levenshtein(left: string, right: string): number {
  const matrix = Array.from({ length: right.length + 1 }, (_, row) => [row, ...Array(left.length).fill(0)]);
  for (let column = 0; column <= left.length; column += 1) matrix[0][column] = column;
  for (let row = 1; row <= right.length; row += 1) for (let column = 1; column <= left.length; column += 1) matrix[row][column] = Math.min(matrix[row - 1][column] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column - 1] + (right[row - 1] === left[column - 1] ? 0 : 1));
  return matrix[right.length][left.length];
}

function nameSimilarity(left: string, right: string): number {
  const a = new Set(tokenizeSearch(left)); const b = new Set(tokenizeSearch(right)); const union = new Set([...a, ...b]);
  const tokenScore = union.size ? [...a].filter(token => b.has(token)).length / union.size : 0;
  const normalizedLeft = normalizeSearchText(left); const normalizedRight = normalizeSearchText(right);
  const editScore = Math.max(normalizedLeft.length, normalizedRight.length) ? 1 - levenshtein(normalizedLeft, normalizedRight) / Math.max(normalizedLeft.length, normalizedRight.length) : 0;
  return Math.max(tokenScore, editScore);
}

export function checkProductDuplicates(candidate: Partial<Product>, existing: Product[]): ProductDuplicateMatch[] {
  return existing.filter(product => product.id !== candidate.id && product.vendorId === candidate.vendorId).flatMap(product => {
    const reasons: DuplicateReason[] = [];
    const same = (left: unknown, right: unknown) => Boolean(normalizeProductIdentifier(left)) && normalizeProductIdentifier(left) === normalizeProductIdentifier(right);
    if (same(candidate.sku, product.sku)) reasons.push('SAME_SKU');
    if (same(candidate.barcode, product.barcode)) reasons.push('SAME_BARCODE');
    if (same(candidate.alternativeLookupCode, product.alternativeLookupCode)) reasons.push('SAME_ALU');
    if (same(candidate.sectorAttributes?.oemNumber, product.sectorAttributes?.oemNumber)) reasons.push('SAME_OEM_NUMBER');
    if (same(candidate.sectorAttributes?.manufacturerPartNumber, product.sectorAttributes?.manufacturerPartNumber)) reasons.push('SAME_MANUFACTURER_PART_NUMBER');
    const similarity = nameSimilarity(candidate.name || '', product.name);
    if (normalizeSearchText(candidate.name) && normalizeSearchText(candidate.name) === normalizeSearchText(product.name)) reasons.push('SAME_NAME');
    else if (similarity >= 0.65) reasons.push('SIMILAR_NAME');
    if (candidate.category && normalizeSearchText(candidate.category) === normalizeSearchText(product.category) && candidate.size && normalizeSearchText(candidate.size) === normalizeSearchText(product.size)) reasons.push('SAME_CATEGORY_SIZE');
    const fitment = ['vehicleMake', 'vehicleModel', 'engineCode'] as const;
    if (fitment.every(key => candidate.sectorAttributes?.[key] && same(candidate.sectorAttributes[key], product.sectorAttributes?.[key]))) reasons.push('SAME_VEHICLE_FITMENT');
    if (!reasons.length) return [];
    const blocking = reasons.includes('SAME_SKU') || reasons.includes('SAME_BARCODE');
    const confidence = blocking ? 1 : reasons.some(reason => ['SAME_ALU', 'SAME_OEM_NUMBER', 'SAME_MANUFACTURER_PART_NUMBER', 'SAME_NAME'].includes(reason)) ? 0.9 : Math.max(0.65, similarity);
    return [{ product, confidence, reasons, blocking }];
  }).sort((a, b) => Number(b.blocking) - Number(a.blocking) || b.confidence - a.confidence);
}

export function assertDuplicateDecision(matches: ProductDuplicateMatch[], decision: ProductDuplicateDecisionInput | undefined, role: StaffRole): void {
  if (!matches.length) return;
  assertExtendedProductPermission(role, 'product.duplicate.review');
  const blocking = matches.some(match => match.blocking);
  if (blocking) throw new ProductDuplicateError(matches, true);
  if (!decision || decision.decision !== 'CONTINUE_SEPARATE') throw new ProductDuplicateError(matches, false);
  assertExtendedProductPermission(role, 'product.duplicate.override');
  if (!decision.reason?.trim()) throw new Error('A reason is required to continue with a possible duplicate.');
}

/** Rejects ledger input that does not resolve to one active, unambiguous product master. */
export function assertCanonicalProductReference(products: Product[], productId: string): Product {
  const product = products.find(item => item.id === productId);
  if (!product) throw new Error(`Canonical product ${productId} does not exist; inventory movements cannot create products implicitly.`);
  if ((product.status || 'active') !== 'active') throw new Error(`Canonical product ${productId} is archived.`);
  const exactCollision = checkProductDuplicates(product, products).find(match => match.blocking);
  if (exactCollision) throw new Error(`Canonical product identity is unresolved: ${productId} conflicts with ${exactCollision.product.id}.`);
  return product;
}
