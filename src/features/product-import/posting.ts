import { ApprovalDataPayload, Product, WorkflowActor } from '../../types';
import { CanonicalProductImportRow, ProductImportBatch, ProductImportLocation } from './domain';

export function buildOpeningBalanceRequest(batch: ProductImportBatch, row: CanonicalProductImportRow, product: Product, location: ProductImportLocation, requester: WorkflowActor) {
  return {
    entityType: 'OPENING_BALANCE_ADJUSTMENT' as const,
    entityId: `opening_${batch.batchId}_${row.rowNumber}`,
    title: `Opening balance for ${product.sku}`,
    description: `Opening stock from canonical product import ${batch.batchId}.`,
    requester,
    branchId: location.type === 'branch' ? location.id : undefined,
    branchName: location.type === 'branch' ? location.name : undefined,
    warehouseId: location.type === 'warehouse' ? location.id : undefined,
    warehouseName: location.type === 'warehouse' ? location.name : undefined,
    dataPayload: {
      locationType: location.type,
      locationId: location.id,
      locationName: location.name,
      sourceImportBatch: batch.batchId,
      reason: 'CANONICAL_PRODUCT_IMPORT',
      idempotencyKey: `${batch.batchId}:${row.rowNumber}:${product.id}`,
      expectedVersion: 0,
      items: [{ productId: product.id, productName: product.name, sku: product.sku, quantityDelta: row.quantity, quantity: row.quantity, unitOfMeasure: row.unitOfMeasure, reason: 'Opening balance from approved canonical import' }],
    } as ApprovalDataPayload,
  };
}
