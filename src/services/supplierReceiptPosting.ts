import {
  ApprovalQuantityDecision, Product, PurchaseOrder, SupplierReceipt, Warehouse,
  WarehouseInventory, WorkflowActor,
} from '../types';
import { InventoryPostingEngine, InventoryRepository } from '../features/inventory/application';
import {
  deterministicInventoryBalanceId, emptyInventoryBalance, InventoryBalance,
  InventoryDomainError, InventoryMovement, StockLocation,
} from '../features/inventory/domain';
import {
  canonicalBalanceToWarehouseInventory, warehouseInventoryToCanonicalBalance,
  warehouseToCanonicalStockLocation,
} from '../features/inventory/infrastructure/legacyInventoryAdapter';
import { weightedAverageCost } from '../features/inventory/averageCost';
import { nextPurchaseOrderStatus } from './supplierReceiving';

export type ReceiptClassification = 'ACCEPTED' | 'QUARANTINED' | 'DAMAGED';

export interface ApprovedSupplierReceiptLine {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  unitOfMeasure?: string;
  batchNumber?: string;
  orderedQuantity?: number;
  previouslyReceivedQuantity?: number;
  receiptClassification?: ReceiptClassification;
}

export interface SupplierReceiptMovementCompatibility {
  warehouseId: string;
  receiptId: string;
  productName: string;
  batchNumber: string;
  unitOfMeasure: string;
  unitCost: number;
  receiptClassification: ReceiptClassification;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  previousAverageCost: number;
  resultingAverageCost: number;
  orderedQuantity: number;
  previouslyReceivedQuantity: number;
  currentReceiptQuantity: number;
  remainingQuantity: number;
  variance: number;
  createdAt: string;
}

export type SupplierReceiptInventoryMovement = InventoryMovement & {
  readonly compatibility: SupplierReceiptMovementCompatibility;
};

export type PostedSupplierReceipt = SupplierReceipt & { tenantId: string };

export type SupplierReceiptPostingErrorCode =
  | 'branch_destination' | 'warehouse_not_found' | 'tenant_mismatch' | 'vendor_mismatch'
  | 'inactive_warehouse' | 'unlicensed_warehouse' | 'invalid_quantity' | 'unknown_product'
  | 'archived_product' | 'duplicate_line_conflict' | 'over_receipt' | 'stale_purchase_order'
  | 'duplicate_posting' | 'write_failure';

export class SupplierReceiptPostingError extends Error {
  constructor(readonly code: SupplierReceiptPostingErrorCode, message: string) {
    super(message);
    this.name = 'SupplierReceiptPostingError';
  }
}

export interface ApprovedSupplierReceiptPostingInput {
  tenantId: string;
  vendorId: string;
  receiptId: string;
  approvalRequestId?: string;
  warehouseId: string;
  destinationType?: 'warehouse' | 'branch';
  supplierId?: string;
  supplierName: string;
  referenceNo: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  overReceiptExceptionApproved: boolean;
  actor: WorkflowActor;
  requestedAt: string;
  postedAt: string;
  notes?: string;
  lines: ApprovedSupplierReceiptLine[];
}

export interface SupplierReceiptPostingStore {
  getReceipt(receiptId: string): Promise<PostedSupplierReceipt | null>;
  getWarehouse(warehouseId: string): Promise<Warehouse | null>;
  getProduct(productId: string): Promise<Product | null>;
  getInventory(warehouseId: string, productId: string): Promise<WarehouseInventory | null>;
  getMovement(idempotencyKey: string, movementId: string): Promise<SupplierReceiptInventoryMovement | null>;
  getPurchaseOrder(purchaseOrderId: string): Promise<PurchaseOrder | null>;
  saveInventory(inventory: WarehouseInventory): void;
  saveMovement(movement: SupplierReceiptInventoryMovement): void;
  savePurchaseOrder(purchaseOrder: PurchaseOrder): void;
  saveReceipt(receipt: PostedSupplierReceipt): void;
}

export interface SupplierReceiptPostingResult {
  receipt: PostedSupplierReceipt;
  movements: SupplierReceiptInventoryMovement[];
  quantityDecisions: ApprovalQuantityDecision[];
  duplicate: boolean;
}

function lineIdentity(line: ApprovedSupplierReceiptLine): string {
  return [line.productId, line.batchNumber?.trim().toLowerCase() || '', line.unitOfMeasure?.trim().toLowerCase() || 'unit'].join('|');
}

function mergeLines(lines: ApprovedSupplierReceiptLine[]): ApprovedSupplierReceiptLine[] {
  const merged = new Map<string, ApprovedSupplierReceiptLine>();
  for (const rawLine of lines) {
    const line = { ...rawLine, receiptClassification: rawLine.receiptClassification ?? 'ACCEPTED' as ReceiptClassification };
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new SupplierReceiptPostingError('invalid_quantity', `Receipt quantity must be positive for ${line.productName}.`);
    if (!Number.isFinite(line.unitCost) || line.unitCost < 0) throw new SupplierReceiptPostingError('invalid_quantity', `Receipt unit cost is invalid for ${line.productName}.`);
    if (!['ACCEPTED', 'QUARANTINED', 'DAMAGED'].includes(line.receiptClassification)) throw new SupplierReceiptPostingError('invalid_quantity', `Receipt classification is invalid for ${line.productName}.`);
    const key = lineIdentity(line);
    const existing = merged.get(key);
    if (!existing) merged.set(key, line);
    else if (existing.unitCost !== line.unitCost || existing.receiptClassification !== line.receiptClassification) {
      throw new SupplierReceiptPostingError('duplicate_line_conflict', `Conflicting duplicate receipt line for ${line.productName}.`);
    } else merged.set(key, { ...existing, quantity: existing.quantity + line.quantity });
  }
  return [...merged.values()];
}

export function supplierReceiptMovementId(receiptId: string, index: number, line: ApprovedSupplierReceiptLine): string {
  return ['supplier_receipt', receiptId, String(index), line.productId, line.batchNumber || '', line.unitOfMeasure || 'unit'].map(encodeURIComponent).join('_');
}

export function supplierReceiptIdempotencyKey(input: Pick<ApprovedSupplierReceiptPostingInput, 'tenantId' | 'vendorId' | 'receiptId'>, index: number, line: ApprovedSupplierReceiptLine): string {
  return ['supplier-receipt', input.tenantId, input.vendorId, input.receiptId, String(index), line.productId, line.batchNumber || '', line.unitOfMeasure || 'unit'].map(encodeURIComponent).join(':');
}

function quantityBucket(classification: ReceiptClassification): 'ON_HAND' | 'QUARANTINED' | 'DAMAGED' {
  if (classification === 'QUARANTINED') return 'QUARANTINED';
  if (classification === 'DAMAGED') return 'DAMAGED';
  return 'ON_HAND';
}

export async function postApprovedSupplierReceipt(
  input: ApprovedSupplierReceiptPostingInput,
  store: SupplierReceiptPostingStore,
): Promise<SupplierReceiptPostingResult> {
  if (!input.tenantId || input.tenantId !== input.vendorId) throw new SupplierReceiptPostingError('tenant_mismatch', 'Receipt tenant identity does not match the current compatibility partition.');
  if (input.destinationType === 'branch') throw new SupplierReceiptPostingError('branch_destination', 'Supplier receipts cannot be posted to a branch.');
  if (!input.warehouseId) throw new SupplierReceiptPostingError('warehouse_not_found', 'Receipt warehouse is required.');
  if (!input.lines.length) throw new SupplierReceiptPostingError('invalid_quantity', 'Supplier receipt has no inventory lines.');

  const existingReceipt = await store.getReceipt(input.receiptId);
  if (existingReceipt) return { receipt: existingReceipt, movements: [], quantityDecisions: [], duplicate: true };
  const warehouse = await store.getWarehouse(input.warehouseId);
  if (!warehouse) throw new SupplierReceiptPostingError('warehouse_not_found', 'The supplier receipt warehouse does not exist.');
  if (warehouse.vendorId !== input.vendorId) throw new SupplierReceiptPostingError('vendor_mismatch', 'The supplier receipt warehouse belongs to another vendor.');
  const location = warehouseToCanonicalStockLocation(warehouse, input.tenantId);
  if (location.status !== 'ACTIVE') throw new SupplierReceiptPostingError('inactive_warehouse', 'The supplier receipt warehouse is not active.');
  if (location.licenceStatus !== 'LICENSED') throw new SupplierReceiptPostingError('unlicensed_warehouse', 'The supplier receipt warehouse is not licensed.');

  const lines = mergeLines(input.lines);
  const purchaseOrder = input.purchaseOrderId ? await store.getPurchaseOrder(input.purchaseOrderId) : null;
  if (input.purchaseOrderId && (!purchaseOrder || purchaseOrder.vendorId !== input.vendorId || !['OPEN', 'PARTIALLY_RECEIVED'].includes(purchaseOrder.status))) {
    throw new SupplierReceiptPostingError('stale_purchase_order', 'The selected purchase order is no longer open for receiving.');
  }
  if (purchaseOrder && input.supplierId && purchaseOrder.supplierId !== input.supplierId) throw new SupplierReceiptPostingError('stale_purchase_order', 'The selected purchase order belongs to another supplier.');

  const receiptTotals = new Map<string, number>();
  lines.forEach(line => receiptTotals.set(line.productId, (receiptTotals.get(line.productId) || 0) + line.quantity));
  let updatedPurchaseOrder: PurchaseOrder | null = null;
  if (purchaseOrder) {
    const unmatched = new Set(receiptTotals.keys());
    const updatedItems = purchaseOrder.items.map(item => {
      const receivedNow = receiptTotals.get(item.productId) || 0;
      unmatched.delete(item.productId);
      const orderedQuantity = Number(item.orderedQuantity || 0);
      const receivedQuantity = Number(item.receivedQuantity || 0) + receivedNow;
      if (receivedQuantity > orderedQuantity && !input.overReceiptExceptionApproved) throw new SupplierReceiptPostingError('over_receipt', `Over-receipt is not approved for ${item.productName}.`);
      return { ...item, orderedQuantity, receivedQuantity };
    });
    if (unmatched.size && !input.overReceiptExceptionApproved) throw new SupplierReceiptPostingError('over_receipt', 'The receipt contains a product not present on the selected purchase order.');
    const status = nextPurchaseOrderStatus(updatedItems);
    updatedPurchaseOrder = { ...purchaseOrder, items: updatedItems, status, updatedAt: input.postedAt, ...(status === 'COMPLETED' ? { completedAt: input.postedAt } : {}) };
  }

  const products = new Map<string, Product>();
  const legacyInventory = new Map<string, WarehouseInventory | null>();
  const balances = new Map<string, InventoryBalance>();
  const priorCosts = new Map<string, number>();
  const resultingCosts = new Map<string, number>();
  const existingMovements = new Map<string, SupplierReceiptInventoryMovement>();
  const productLines = new Map<string, ApprovedSupplierReceiptLine[]>();
  lines.forEach(line => productLines.set(line.productId, [...(productLines.get(line.productId) || []), line]));

  for (const [productId, groupedLines] of productLines) {
    const [product, inventory] = await Promise.all([store.getProduct(productId), store.getInventory(input.warehouseId, productId)]);
    if (!product) throw new SupplierReceiptPostingError('unknown_product', `Unknown product ${productId}.`);
    if (product.vendorId !== input.vendorId) throw new SupplierReceiptPostingError('vendor_mismatch', `Product ${product.name} belongs to another vendor.`);
    if (product.status === 'archived') throw new SupplierReceiptPostingError('archived_product', `${product.name} is archived.`);
    products.set(productId, product);
    legacyInventory.set(productId, inventory);
    const identity = { tenantId: input.tenantId, vendorId: input.vendorId, stockLocationId: input.warehouseId, productId };
    const balance = inventory ? warehouseInventoryToCanonicalBalance(inventory, input.tenantId) : emptyInventoryBalance(identity, input.postedAt);
    balances.set(balance.id, balance);
    const priorAverage = Number(inventory?.averageUnitCost ?? product.costPrice ?? 0);
    const receiptQuantity = groupedLines.reduce((sum, line) => sum + line.quantity, 0);
    const receiptCost = groupedLines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    priorCosts.set(productId, priorAverage);
    resultingCosts.set(productId, weightedAverageCost(balance.onHandQty + balance.quarantinedQty + balance.damagedQty, priorAverage, receiptQuantity, receiptCost));
  }
  for (const [index, line] of lines.entries()) {
    const key = supplierReceiptIdempotencyKey(input, index, line);
    const movement = await store.getMovement(key, supplierReceiptMovementId(input.receiptId, index, line));
    if (movement) existingMovements.set(key, movement);
  }
  if (existingMovements.size) throw new SupplierReceiptPostingError('duplicate_posting', 'A supplier receipt movement already exists without its completed receipt.');

  const posted = new Map<string, SupplierReceiptInventoryMovement>();
  const repository: InventoryRepository = {
    async getStockLocation(id): Promise<StockLocation | null> { return id === location.id ? location : null; },
    async getBalance(t, v, stockLocationId, productId) { return balances.get(deterministicInventoryBalanceId({ tenantId: t, vendorId: v, stockLocationId, productId })) ?? null; },
    async getMovementByIdempotencyKey(_t, _v, key) { return existingMovements.get(key) ?? null; },
    async saveBalance(balance) {
      balances.set(balance.id, balance);
      store.saveInventory(canonicalBalanceToWarehouseInventory(balance, resultingCosts.get(balance.productId)));
    },
    async saveMovement(movement) {
      const index = lines.findIndex((line, candidateIndex) => supplierReceiptIdempotencyKey(input, candidateIndex, line) === movement.idempotencyKey);
      const line = lines[index];
      const poLine = purchaseOrder?.items.find(item => item.productId === line.productId);
      const ordered = poLine?.orderedQuantity ?? line.orderedQuantity ?? 0;
      const previouslyReceived = Number(poLine?.receivedQuantity ?? line.previouslyReceivedQuantity ?? 0);
      const currentTotal = receiptTotals.get(line.productId) || line.quantity;
      const compatibility: SupplierReceiptMovementCompatibility = {
        warehouseId: input.warehouseId, receiptId: input.receiptId, productName: line.productName,
        batchNumber: line.batchNumber || '', unitOfMeasure: line.unitOfMeasure || 'unit', unitCost: line.unitCost,
        receiptClassification: line.receiptClassification ?? 'ACCEPTED', quantityDelta: movement.quantity,
        quantityBefore: movement.destinationBeforeQty!, quantityAfter: movement.destinationAfterQty!,
        previousAverageCost: priorCosts.get(line.productId) || 0, resultingAverageCost: resultingCosts.get(line.productId) || 0,
        orderedQuantity: ordered, previouslyReceivedQuantity: previouslyReceived, currentReceiptQuantity: line.quantity,
        remainingQuantity: Math.max(0, ordered - previouslyReceived - currentTotal),
        variance: currentTotal - Math.max(0, ordered - previouslyReceived), createdAt: input.postedAt,
      };
      const canonicalMovement: SupplierReceiptInventoryMovement = Object.freeze({ ...movement, compatibility: Object.freeze(compatibility) });
      posted.set(movement.idempotencyKey, canonicalMovement);
      store.saveMovement(canonicalMovement);
    },
    async runAtomic<T>(operation: (transactionRepository: InventoryRepository) => Promise<T>) { return operation(repository); },
  };
  const engine = new InventoryPostingEngine(repository, async request => request.tenantId === input.tenantId && request.vendorId === input.vendorId && products.has(request.productId), () => input.postedAt);

  const movements: SupplierReceiptInventoryMovement[] = [];
  for (const [index, line] of lines.entries()) {
    const key = supplierReceiptIdempotencyKey(input, index, line);
    try {
      await engine.post({
        commandId: supplierReceiptMovementId(input.receiptId, index, line), idempotencyKey: key,
        tenantId: input.tenantId, vendorId: input.vendorId, productId: line.productId,
        movementType: 'SUPPLIER_RECEIPT', quantity: line.quantity,
        quantityBucket: quantityBucket(line.receiptClassification ?? 'ACCEPTED'), destinationLocationId: input.warehouseId,
        referenceType: 'SUPPLIER_RECEIPT', referenceId: input.receiptId, actorId: input.actor.id,
        approvalRequestId: input.approvalRequestId, occurredAt: input.postedAt,
      });
    } catch (error) {
      if (error instanceof SupplierReceiptPostingError) throw error;
      if (error instanceof InventoryDomainError && error.code === 'INVALID_QUANTITY') throw new SupplierReceiptPostingError('invalid_quantity', error.message);
      throw new SupplierReceiptPostingError('write_failure', 'The supplier receipt could not be posted.');
    }
    movements.push(posted.get(key)!);
  }
  if (updatedPurchaseOrder) store.savePurchaseOrder(updatedPurchaseOrder);
  const receipt: PostedSupplierReceipt = {
    id: input.receiptId, tenantId: input.tenantId, vendorId: input.vendorId, warehouseId: input.warehouseId,
    supplierName: input.supplierName, referenceNo: input.referenceNo, purchaseOrderId: input.purchaseOrderId,
    purchaseOrderNumber: input.purchaseOrderNumber, date: input.postedAt,
    items: lines.map(line => {
      const poLine = purchaseOrder?.items.find(item => item.productId === line.productId);
      const orderedQuantity = Number(poLine?.orderedQuantity ?? line.orderedQuantity ?? 0);
      const previouslyReceivedQuantity = Number(poLine?.receivedQuantity ?? line.previouslyReceivedQuantity ?? 0);
      const currentProductReceipt = receiptTotals.get(line.productId) || line.quantity;
      return {
        ...line, quantity: line.quantity, unitCost: line.unitCost, totalCost: line.quantity * line.unitCost,
        receiptClassification: line.receiptClassification ?? 'ACCEPTED', orderedQuantity, previouslyReceivedQuantity,
        currentReceiptQuantity: line.quantity,
        remainingQuantity: Math.max(0, orderedQuantity - previouslyReceivedQuantity - currentProductReceipt),
        variance: currentProductReceipt - Math.max(0, orderedQuantity - previouslyReceivedQuantity),
      };
    }),
    totalAmount: lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0), notes: input.notes,
    createdBy: input.actor.name, status: 'COMPLETED', createdAt: input.requestedAt,
  };
  store.saveReceipt(receipt);
  const quantityDecisions = movements.map(movement => ({
    productId: movement.productId, productName: movement.compatibility.productName, locationType: 'warehouse' as const,
    locationId: input.warehouseId, beforeQuantity: movement.destinationBeforeQty!, quantityDelta: movement.quantity,
    afterQuantity: movement.destinationAfterQty!,
  }));
  return { receipt, movements, quantityDecisions, duplicate: false };
}
