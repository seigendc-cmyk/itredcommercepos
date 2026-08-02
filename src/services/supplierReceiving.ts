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
  unitCost: number;
  unitOfMeasure: string;
  batchNumber?: string;
  orderedQuantity: number;
  previouslyReceivedQuantity: number;
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
  if (incoming.quantity <= 0) {
    throw new SupplierReceivingError('invalid_quantity', 'Receipt quantity must be greater than zero.');
  }
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
      ? { ...line, quantity: line.quantity + incoming.quantity }
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
    const ordered = poItems.get(line.productId);
    const orderedQuantity = ordered?.orderedQuantity ?? line.orderedQuantity;
    const previouslyReceivedQuantity =
      ordered?.receivedQuantity ?? line.previouslyReceivedQuantity;
    const outstandingBeforeReceipt = Math.max(0, orderedQuantity - previouslyReceivedQuantity);
    const outstandingAfterReceipt =
      Math.max(0, outstandingBeforeReceipt - line.quantity);
    const variance = line.quantity - outstandingBeforeReceipt;
    const status = !purchaseOrder
      ? 'FREE_ORDER'
      : variance > 0
        ? 'OVER_RECEIPT'
        : outstandingAfterReceipt > 0
          ? 'PARTIAL'
          : 'MATCHED';
    return {
      ...line,
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
