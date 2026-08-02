import { Product, ProductType } from '../../types';

export interface ProductLocationStockView {
  productId: string;
  sku: string;
  productName: string;
  description: string;
  category: string;
  size: string;
  unitOfMeasure: string;
  alternativeLookupCode: string;
  productType: ProductType;
  stockLocationId: string;
  locationName: string;
  shelfCode: string;
  binCode: string;
  systemQuantity: number;
}

export function buildProductLocationStockView(product: Product, location: { id: string; name: string }, quantity: number): ProductLocationStockView {
  return {
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    description: product.description || '',
    category: product.category,
    size: product.size || '',
    unitOfMeasure: product.unitOfMeasure || product.unit || '',
    alternativeLookupCode: product.alternativeLookupCode || '',
    productType: product.productType || 'INVENTORY',
    stockLocationId: location.id,
    locationName: location.name,
    shelfCode: product.shelf || '',
    binCode: product.bin || '',
    systemQuantity: quantity,
  };
}
