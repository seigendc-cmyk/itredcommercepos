import { Product, PurchaseOrderItem } from '../../types';

export interface PurchaseRecommendation extends Omit<PurchaseOrderItem, 'receivedQuantity'> {
  systemQuantity: number;
  recommendedQuantity: number;
  rationale: string;
}

export function buildPurchaseRecommendations(
  products: Product[],
  systemQuantities: Record<string, number>,
): PurchaseRecommendation[] {
  return products
    .filter(product => product.status !== 'archived' && (product.productType || 'INVENTORY') === 'INVENTORY')
    .map(product => {
      const systemQuantity = systemQuantities[product.id] || 0;
      const target = Math.max(product.reorderLevel * 2, product.reorderLevel + 1);
      const recommendedQuantity = Math.max(0, target - systemQuantity);
      return {
        productId: product.id, productName: product.name, sku: product.sku,
        orderedQuantity: recommendedQuantity, unitCost: product.costPrice,
        unitOfMeasure: product.unit, systemQuantity, recommendedQuantity,
        rationale: `System quantity ${systemQuantity}; reorder level ${product.reorderLevel}; target ${target}.`,
      };
    })
    .filter(item => item.recommendedQuantity > 0)
    .sort((a, b) => b.recommendedQuantity - a.recommendedQuantity);
}
