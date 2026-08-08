import {
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  Supplier,
} from '../types';

export interface ReceiptDraftLine {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  deliveredQuantity?: number;
  acceptedQuantity?: number;
  damagedQuantity?: number;
  quarantinedQuantity?: number;
  rejectedQuantity?: number;
  unitCost: number;
  unitOfMeasure: string;
  batchNumber?: string;
  orderedQuantity: number;
  previouslyReceivedQuantity: number;
}

export interface CanonicalReceiptQuantities {
  deliveredQuantity: number; acceptedQuantity: number; damagedQuantity: number; quarantinedQuantity: number; rejectedQuantity: number;
}

export function canonicalReceiptQuantities(line: ReceiptDraftLine): CanonicalReceiptQuantities {
  const acceptedQuantity = Number(line.acceptedQuantity ?? line.quantity ?? 0);
  const damagedQuantity = Number(line.damagedQuantity ?? 0);
  const quarantinedQuantity = Number(line.quarantinedQuantity ?? 0);
  const rejectedQuantity = Number(line.rejectedQuantity ?? 0);
  const deliveredQuantity = Number(line.deliveredQuantity ?? acceptedQuantity + damagedQuantity + quarantinedQuantity + rejectedQuantity);
  const quantities = { deliveredQuantity, acceptedQuantity, damagedQuantity, quarantinedQuantity, rejectedQuantity };
  if (Object.values(quantities).some(quantity => !Number.isFinite(quantity) || quantity < 0) || deliveredQuantity <= 0) throw new SupplierReceivingError('invalid_quantity', 'Receipt quantities must be finite, non-negative, and delivered quantity must be positive.');
  if (Math.abs(deliveredQuantity - acceptedQuantity - damagedQuantity - quarantinedQuantity - rejectedQuantity) > 1e-9) throw new SupplierReceivingError('invalid_quantity', 'Delivered quantity must equal accepted, damaged, quarantined, and rejected quantities.');
  return quantities;
}

export interface PurchaseOrderComparison extends ReceiptDraftLine {
  outstandingBeforeReceipt: number;
  outstandingAfterReceipt: number;
  variance: number;
  status: 'MATCHED' | 'PARTIAL' | 'OVER_RECEIPT' | 'FREE_ORDER';
}

export class SupplierReceivingError extends Error {
  constructor(
    readonly code:
      | 'branch_destination'
      | 'duplicate_purchase_order_item'
      | 'over_receipt'
      | 'invalid_quantity',
    message: string,
  ) {
    super(message);
    this.name = 'SupplierReceivingError';
  }
}

export function filterSuppliers(suppliers: Supplier[], query: string): Supplier[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return suppliers;
  return suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(normalized) ||
    Boolean(supplier.code?.toLowerCase().includes(normalized)),
  );
}

export function filterOpenPurchaseOrders(
  purchaseOrders: PurchaseOrder[],
  supplierId: string,
): PurchaseOrder[] {
  return purchaseOrders.filter(order =>
    order.supplierId === supplierId &&
    (order.status === 'OPEN' || order.status === 'PARTIALLY_RECEIVED'),
  );
}

export function searchReceivingProducts(products: Product[], query: string): Product[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return products.filter(product => product.status !== 'archived' && (product.productType || 'INVENTORY') === 'INVENTORY' && (
    product.sku.toLowerCase().includes(normalized) ||
    product.name.toLowerCase().includes(normalized) ||
    Boolean(product.brand?.toLowerCase().includes(normalized)) ||
    Boolean(product.manufacturerCode?.toLowerCase().includes(normalized)) ||
    Boolean(product.barcode?.toLowerCase().includes(normalized))
  ));
}

function lineKey(line: Pick<ReceiptDraftLine, 'productId' | 'batchNumber' | 'unitOfMeasure'>): string {
  return [
    line.productId,
    line.batchNumber?.trim().toLowerCase() || '',
    line.unitOfMeasure.trim().toLowerCase(),
  ].join('|');
}

export function mergeReceiptLine(
  lines: ReceiptDraftLine[],
  incoming: ReceiptDraftLine,
): ReceiptDraftLine[] {
  const incomingQuantities = canonicalReceiptQuantities(incoming);
  const existingIndex = lines.findIndex(line => lineKey(line) === lineKey(incoming));
  if (existingIndex < 0) return [...lines, incoming];

  const existing = lines[existingIndex];
  if (existing.unitCost !== incoming.unitCost) {
    throw new SupplierReceivingError(
      'duplicate_purchase_order_item',
      'The same product, batch and unit cannot be added with different unit costs.',
    );
  }
  return lines.map((line, index) =>
    index === existingIndex
      ? (() => {
          const existing = canonicalReceiptQuantities(line);
          const acceptedQuantity = existing.acceptedQuantity + incomingQuantities.acceptedQuantity;
          const damagedQuantity = existing.damagedQuantity + incomingQuantities.damagedQuantity;
          const quarantinedQuantity = existing.quarantinedQuantity + incomingQuantities.quarantinedQuantity;
          const rejectedQuantity = existing.rejectedQuantity + incomingQuantities.rejectedQuantity;
          return { ...line, quantity: acceptedQuantity, acceptedQuantity, damagedQuantity, quarantinedQuantity, rejectedQuantity, deliveredQuantity: acceptedQuantity + damagedQuantity + quarantinedQuantity + rejectedQuantity };
        })()
      : line,
  );
}

export function compareReceiptToPurchaseOrder(
  lines: ReceiptDraftLine[],
  purchaseOrder?: PurchaseOrder,
): PurchaseOrderComparison[] {
  const poItems = new Map<string, PurchaseOrderItem>(
    (purchaseOrder?.items || []).map(item => [item.productId, item]),
  );
  return lines.map(line => {
    const quantities = canonicalReceiptQuantities(line);
    const ordered = poItems.get(line.productId);
    const orderedQuantity = ordered?.orderedQuantity ?? line.orderedQuantity;
    const previouslyReceivedQuantity =
      ordered?.receivedQuantity ?? line.previouslyReceivedQuantity;
    const outstandingBeforeReceipt = Math.max(0, orderedQuantity - previouslyReceivedQuantity);
    const outstandingAfterReceipt =
      Math.max(0, outstandingBeforeReceipt - quantities.deliveredQuantity);
    const variance = quantities.deliveredQuantity - outstandingBeforeReceipt;
    const status = !purchaseOrder
      ? 'FREE_ORDER'
      : variance > 0
        ? 'OVER_RECEIPT'
        : outstandingAfterReceipt > 0
          ? 'PARTIAL'
          : 'MATCHED';
    return {
      ...line,
      ...quantities,
      quantity: quantities.acceptedQuantity,
      orderedQuantity,
      previouslyReceivedQuantity,
      outstandingBeforeReceipt,
      outstandingAfterReceipt,
      variance,
      status,
    };
  });
}

export function assertReceiptAllowed(
  destinationType: 'warehouse' | 'branch',
  comparisons: PurchaseOrderComparison[],
  overReceiptExceptionRequested: boolean,
): void {
  if (destinationType !== 'warehouse') {
    throw new SupplierReceivingError(
      'branch_destination',
      'Supplier receipts must be directed to an active warehouse, never a branch.',
    );
  }
  if (
    comparisons.some(line => line.status === 'OVER_RECEIPT') &&
    !overReceiptExceptionRequested
  ) {
    throw new SupplierReceivingError(
      'over_receipt',
      'The receipt exceeds the purchase order. Request an authorised over-receipt exception.',
    );
  }
}

export function nextPurchaseOrderStatus(items: PurchaseOrderItem[]): PurchaseOrderStatus {
  const fullyReceived = items.every(item => item.receivedQuantity >= item.orderedQuantity);
  return fullyReceived ? 'COMPLETED' : 'PARTIALLY_RECEIVED';
}
