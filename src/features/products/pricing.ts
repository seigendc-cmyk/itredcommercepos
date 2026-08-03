import { Product } from '../../types';

export function getProductSellingPrice(product: Product, branchId?: string): number {
  const override = branchId ? product.branchPrices?.[branchId] : undefined;
  return Number.isFinite(override) && Number(override) >= 0 ? Number(override) : product.sellingPrice;
}
