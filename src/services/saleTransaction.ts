import {
  BranchInventory,
  Order,
  Terminal,
} from '../types';

export interface InventoryMovement {
  id: string;
  vendorId: string;
  branchId: string;
  terminalId: string;
  orderId: string;
  productId: string;
  productName: string;
  movementType: 'sale';
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  createdAt: string;
}

export type SaleFailureCode =
  | 'invalid_order'
  | 'terminal_not_found'
  | 'terminal_branch_mismatch'
  | 'insufficient_stock'
  | 'write_failed';

export type SaleCompletionResult =
  | {
      success: true;
      order: Order;
      movements: InventoryMovement[];
      duplicate: boolean;
    }
  | {
      success: false;
      code: SaleFailureCode;
      message: string;
    };

export interface SaleTransactionStore {
  getOrder(orderId: string): Promise<Order | null>;
  getTerminal(terminalId: string): Promise<Terminal | null>;
  getInventory(branchId: string, productId: string): Promise<BranchInventory | null>;
  setOrder(order: Order): void;
  setInventory(inventory: BranchInventory): void;
  setMovement(movement: InventoryMovement): void;
}

export type AtomicSaleRunner = (
  operation: (store: SaleTransactionStore) => Promise<SaleCompletionResult>,
) => Promise<SaleCompletionResult>;

interface CompleteSaleTransactionInput {
  vendorId: string;
  orderId: string;
  createdAt: string;
  orderData: Omit<Order, 'id' | 'createdAt' | 'status'>;
}

interface ProductDeduction {
  productId: string;
  productName: string;
  quantity: number;
}

function failure(code: SaleFailureCode, message: string): SaleCompletionResult {
  return { success: false, code, message };
}

export async function completeSaleTransaction(
  input: CompleteSaleTransactionInput,
  runAtomic: AtomicSaleRunner,
): Promise<SaleCompletionResult> {
  const { vendorId, orderId, createdAt, orderData } = input;

  if (
    !vendorId ||
    !orderId ||
    orderData.vendorId !== vendorId ||
    !orderData.branchId ||
    !orderData.terminalId ||
    orderData.items.length === 0
  ) {
    return failure('invalid_order', 'The sale is missing required transaction details.');
  }

  const deductions = new Map<string, ProductDeduction>();
  for (const item of orderData.items) {
    if (item.product.status === 'archived') {
      return failure('invalid_order', `${item.product.name} is archived and cannot be added to a new sale.`);
    }
    if (!item.product.id || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return failure('invalid_order', 'Every sale item must have a positive whole quantity.');
    }

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
      if (existingOrder) {
        return {
          success: true,
          order: existingOrder,
          movements: [],
          duplicate: true,
        };
      }

      const terminal = await store.getTerminal(orderData.terminalId);
      if (!terminal) {
        return failure('terminal_not_found', 'The selected terminal no longer exists.');
      }
      if (
        terminal.vendorId !== vendorId ||
        terminal.branchId !== orderData.branchId ||
        terminal.status !== 'active'
      ) {
        return failure(
          'terminal_branch_mismatch',
          'The selected terminal is not active for the sale branch.',
        );
      }

      const inventoryUpdates: BranchInventory[] = [];
      const movements: InventoryMovement[] = [];
      let movementIndex = 0;

      for (const deduction of deductions.values()) {
        const inventory = await store.getInventory(orderData.branchId, deduction.productId);
        const available = inventory?.quantity || 0;
        if (
          !inventory ||
          inventory.vendorId !== vendorId ||
          inventory.branchId !== orderData.branchId ||
          available < deduction.quantity
        ) {
          return failure(
            'insufficient_stock',
            `Insufficient branch stock for ${deduction.productName}. Available: ${available}, required: ${deduction.quantity}.`,
          );
        }

        const quantityAfter = available - deduction.quantity;
        inventoryUpdates.push({
          ...inventory,
          quantity: quantityAfter,
          lastUpdated: createdAt,
        });
        movements.push({
          id: `sale_${orderId}_${movementIndex}`,
          vendorId,
          branchId: orderData.branchId,
          terminalId: orderData.terminalId,
          orderId,
          productId: deduction.productId,
          productName: deduction.productName,
          movementType: 'sale',
          quantityDelta: -deduction.quantity,
          quantityBefore: available,
          quantityAfter,
          createdAt,
        });
        movementIndex += 1;
      }

      const order: Order = {
        ...orderData,
        id: orderId,
        status: 'completed',
        createdAt,
      };

      store.setOrder(order);
      inventoryUpdates.forEach(update => store.setInventory(update));
      movements.forEach(movement => store.setMovement(movement));

      return {
        success: true,
        order,
        movements,
        duplicate: false,
      };
    });
  } catch (error) {
    console.error('Atomic sale transaction failed:', error);
    return failure(
      'write_failed',
      'The online sale could not be committed. No order or stock deduction was completed.',
    );
  }
}
