import {
  Branch,
  BranchInventory,
  Order,
  Product,
  Terminal,
} from '../types';
import { InventoryPostingEngine, InventoryRepository } from '../features/inventory/application';
import {
  deterministicInventoryBalanceId, InventoryBalance, InventoryDomainError,
  InventoryMovement as CanonicalInventoryMovement, StockLocation,
} from '../features/inventory/domain';
import {
  branchInventoryToCanonicalBalance, branchToCanonicalStockLocation,
  canonicalBalanceToBranchInventory,
} from '../features/inventory/infrastructure/legacyInventoryAdapter';

export interface SaleMovementCompatibility {
  branchId: string;
  terminalId: string;
  orderId: string;
  productName: string;
  movementType: 'sale';
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  createdAt: string;
}

export type SaleInventoryMovement = CanonicalInventoryMovement & {
  readonly compatibility: SaleMovementCompatibility;
};

/** @deprecated Use SaleInventoryMovement or the canonical InventoryMovement contract. */
export type InventoryMovement = SaleInventoryMovement;

export type SaleFailureCode =
  | 'invalid_order'
  | 'terminal_not_found'
  | 'terminal_branch_mismatch'
  | 'insufficient_stock'
  | 'write_failed';

export type SaleCompletionResult =
  | { success: true; order: Order; movements: SaleInventoryMovement[]; duplicate: boolean }
  | { success: false; code: SaleFailureCode; message: string };

export interface SaleTransactionStore {
  getOrder(orderId: string): Promise<Order | null>;
  getTerminal(terminalId: string): Promise<Terminal | null>;
  getBranch(branchId: string): Promise<Branch | null>;
  getProduct(productId: string): Promise<Product | null>;
  getInventory(branchId: string, productId: string): Promise<BranchInventory | null>;
  getMovementByIdempotencyKey(idempotencyKey: string, movementId: string): Promise<SaleInventoryMovement | null>;
  setOrder(order: Order): void;
  setInventory(inventory: BranchInventory): void;
  setMovement(movement: SaleInventoryMovement): void;
}

export type AtomicSaleRunner = (
  operation: (store: SaleTransactionStore) => Promise<SaleCompletionResult>,
) => Promise<SaleCompletionResult>;

export interface CompleteSaleTransactionInput {
  tenantId: string;
  vendorId: string;
  actorId: string;
  checkoutAttemptId: string;
  orderId: string;
  createdAt: string;
  orderData: Omit<Order, 'id' | 'createdAt' | 'status'>;
}

interface ProductDeduction {
  productId: string;
  productName: string;
  quantity: number;
}

class SaleTransactionFailure extends Error {
  constructor(readonly result: SaleCompletionResult & { success: false }) {
    super(result.message);
  }
}

function failure(code: SaleFailureCode, message: string): SaleCompletionResult & { success: false } {
  return { success: false, code, message };
}

export function saleMovementId(orderId: string, productId: string): string {
  return `sale_${encodeURIComponent(orderId)}_${encodeURIComponent(productId)}`;
}

export function saleMovementIdempotencyKey(input: Pick<CompleteSaleTransactionInput, 'tenantId' | 'vendorId' | 'checkoutAttemptId' | 'orderId'>, productId: string): string {
  return ['sale', input.tenantId, input.vendorId, input.checkoutAttemptId, input.orderId, productId]
    .map(value => encodeURIComponent(value))
    .join(':');
}

function canonicalFailure(error: unknown, productName: string): SaleTransactionFailure {
  if (error instanceof InventoryDomainError && error.code === 'INSUFFICIENT_STOCK') {
    return new SaleTransactionFailure(failure('insufficient_stock', `Insufficient branch stock for ${productName}.`));
  }
  if (error instanceof InventoryDomainError) {
    return new SaleTransactionFailure(failure('invalid_order', 'The sale inventory context is invalid.'));
  }
  throw error;
}

export async function completeSaleTransaction(
  input: CompleteSaleTransactionInput,
  runAtomic: AtomicSaleRunner,
): Promise<SaleCompletionResult> {
  const { tenantId, vendorId, actorId, checkoutAttemptId, orderId, createdAt, orderData } = input;
  if (
    !tenantId || !vendorId || !actorId || !checkoutAttemptId || !orderId ||
    tenantId !== vendorId || orderData.vendorId !== vendorId || !orderData.branchId ||
    !orderData.terminalId || orderData.items.length === 0
  ) {
    return failure('invalid_order', 'The sale is missing required transaction or tenant details.');
  }

  const deductions = new Map<string, ProductDeduction>();
  for (const item of orderData.items) {
    if (item.product.status === 'archived') return failure('invalid_order', `${item.product.name} is archived and cannot be added to a new sale.`);
    if (!item.product.id || !Number.isInteger(item.quantity) || item.quantity <= 0) return failure('invalid_order', 'Every sale item must have a positive whole quantity.');
    const existing = deductions.get(item.product.id);
    deductions.set(item.product.id, {
      productId: item.product.id,
      productName: item.product.name,
      quantity: (existing?.quantity || 0) + item.quantity,
    });
  }

  try {
    return await runAtomic(async store => {
      const existingOrder = await store.getOrder(orderId);
      if (existingOrder) return { success: true, order: existingOrder, movements: [], duplicate: true };

      const terminal = await store.getTerminal(orderData.terminalId);
      if (!terminal) return failure('terminal_not_found', 'The selected terminal no longer exists.');
      if (terminal.vendorId !== vendorId || terminal.branchId !== orderData.branchId || terminal.status !== 'active') {
        return failure('terminal_branch_mismatch', 'The selected terminal is not active for the sale branch.');
      }

      const branchRecord = await store.getBranch(orderData.branchId);
      if (!branchRecord || branchRecord.vendorId !== vendorId) return failure('invalid_order', 'The active sale branch is invalid.');
      const branchLocation = branchToCanonicalStockLocation(branchRecord, tenantId);
      if (branchLocation.status !== 'ACTIVE' || branchLocation.licenceStatus !== 'LICENSED') {
        return failure('invalid_order', 'The active sale branch cannot process inventory transactions.');
      }

      const products = new Map<string, Product>();
      const legacyInventory = new Map<string, BranchInventory>();
      const canonicalBalances = new Map<string, InventoryBalance>();
      const existingMovements = new Map<string, SaleInventoryMovement>();
      for (const deduction of deductions.values()) {
        const idempotencyKey = saleMovementIdempotencyKey(input, deduction.productId);
        const [product, inventory, existingMovement] = await Promise.all([
          store.getProduct(deduction.productId),
          store.getInventory(orderData.branchId, deduction.productId),
          store.getMovementByIdempotencyKey(idempotencyKey, saleMovementId(orderId, deduction.productId)),
        ]);
        if (!product || product.vendorId !== vendorId || product.status === 'archived') return failure('invalid_order', `${deduction.productName} is not an active canonical product.`);
        const available = inventory?.quantity || 0;
        if (!inventory || inventory.vendorId !== vendorId || inventory.branchId !== orderData.branchId || available < deduction.quantity) {
          return failure('insufficient_stock', `Insufficient branch stock for ${deduction.productName}. Available: ${available}, required: ${deduction.quantity}.`);
        }
        if (existingMovement) throw new Error('Sale movement exists without its completed order.');
        products.set(product.id, product);
        legacyInventory.set(product.id, inventory);
        const balance = branchInventoryToCanonicalBalance(inventory, tenantId);
        canonicalBalances.set(balance.id, balance);
      }

      const postedMovements = new Map<string, SaleInventoryMovement>();
      const repository: InventoryRepository = {
        async getStockLocation(id): Promise<StockLocation | null> { return id === branchLocation.id ? branchLocation : null; },
        async getBalance(t, v, locationId, productId) { return canonicalBalances.get(deterministicInventoryBalanceId({ tenantId: t, vendorId: v, stockLocationId: locationId, productId })) ?? null; },
        async getMovementByIdempotencyKey(_t, _v, key) { return existingMovements.get(key) ?? null; },
        async saveBalance(balance) {
          canonicalBalances.set(balance.id, balance);
          const legacy = legacyInventory.get(balance.productId);
          store.setInventory(canonicalBalanceToBranchInventory(balance, legacy?.averageUnitCost));
        },
        async saveMovement(movement) {
          const deduction = deductions.get(movement.productId)!;
          const compatibility: SaleMovementCompatibility = {
            branchId: orderData.branchId,
            terminalId: orderData.terminalId,
            orderId,
            productName: deduction.productName,
            movementType: 'sale',
            quantityDelta: -movement.quantity,
            quantityBefore: movement.sourceBeforeQty!,
            quantityAfter: movement.sourceAfterQty!,
            createdAt: movement.recordedAt,
          };
          const saleMovement: SaleInventoryMovement = Object.freeze({ ...movement, compatibility: Object.freeze(compatibility) });
          postedMovements.set(movement.idempotencyKey, saleMovement);
          store.setMovement(saleMovement);
        },
        async runAtomic<T>(operation: (transactionRepository: InventoryRepository) => Promise<T>) { return operation(repository); },
      };
      const engine = new InventoryPostingEngine(
        repository,
        async ({ tenantId: productTenantId, vendorId: productVendorId, productId }) =>
          productTenantId === tenantId && productVendorId === vendorId && products.has(productId),
        () => createdAt,
      );

      const movements: SaleInventoryMovement[] = [];
      for (const deduction of deductions.values()) {
        const idempotencyKey = saleMovementIdempotencyKey(input, deduction.productId);
        try {
          await engine.post({
            commandId: saleMovementId(orderId, deduction.productId),
            idempotencyKey,
            tenantId,
            vendorId,
            productId: deduction.productId,
            movementType: 'SALE',
            quantity: deduction.quantity,
            sourceLocationId: orderData.branchId,
            referenceType: 'SALE',
            referenceId: orderId,
            actorId,
            occurredAt: createdAt,
          });
        } catch (error) {
          throw canonicalFailure(error, deduction.productName);
        }
        movements.push(postedMovements.get(idempotencyKey)!);
      }

      const order: Order = { ...orderData, id: orderId, status: 'completed', createdAt };
      store.setOrder(order);
      return { success: true, order, movements, duplicate: false };
    });
  } catch (error) {
    if (error instanceof SaleTransactionFailure) return error.result;
    console.error('Atomic sale transaction failed:', error);
    return failure('write_failed', 'The online sale could not be committed. No order or stock deduction was completed.');
  }
}
