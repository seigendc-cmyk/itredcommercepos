import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BranchInventory,
  Order,
  Product,
  Terminal,
} from '../types';
import {
  AtomicSaleRunner,
  completeSaleTransaction,
  InventoryMovement,
  SaleTransactionStore,
} from './saleTransaction';

interface DatabaseState {
  orders: Map<string, Order>;
  terminals: Map<string, Terminal>;
  inventory: Map<string, BranchInventory>;
  movements: Map<string, InventoryMovement>;
}

class InMemoryAtomicDatabase {
  state: DatabaseState;
  failOnWriteNumber?: number;
  private transactionQueue: Promise<void> = Promise.resolve();

  constructor(quantity: number, terminalBranchId = 'branch-a') {
    const terminal: Terminal = {
      id: 'terminal-a',
      vendorId: 'vendor-a',
      branchId: terminalBranchId,
      name: 'Terminal A',
      code: 'TERM-A',
      isDefault: true,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const inventory: BranchInventory = {
      id: 'vendor-a_branch-a_product-a',
      vendorId: 'vendor-a',
      branchId: 'branch-a',
      productId: 'product-a',
      quantity,
      lastUpdated: '2026-01-01T00:00:00.000Z',
    };
    this.state = {
      orders: new Map(),
      terminals: new Map([[terminal.id, terminal]]),
      inventory: new Map([[inventory.id, inventory]]),
      movements: new Map(),
    };
  }

  runAtomic: AtomicSaleRunner = operation => {
    const transaction = this.transactionQueue.then(async () => {
      const pending = structuredClone(this.state);
      let writeCount = 0;

      const failIfConfigured = () => {
        writeCount += 1;
        if (writeCount === this.failOnWriteNumber) {
          throw new Error('Injected transaction write failure');
        }
      };

      const store: SaleTransactionStore = {
        getOrder: async orderId => pending.orders.get(orderId) || null,
        getTerminal: async terminalId => pending.terminals.get(terminalId) || null,
        getInventory: async (branchId, productId) =>
          pending.inventory.get(`vendor-a_${branchId}_${productId}`) || null,
        setOrder: order => {
          failIfConfigured();
          pending.orders.set(order.id, order);
        },
        setInventory: inventory => {
          failIfConfigured();
          pending.inventory.set(inventory.id, inventory);
        },
        setMovement: movement => {
          failIfConfigured();
          pending.movements.set(movement.id, movement);
        },
      };

      const result = await operation(store);
      this.state = pending;
      return result;
    });

    this.transactionQueue = transaction.then(
      () => undefined,
      () => undefined,
    );
    return transaction;
  };
}

const product: Product = {
  id: 'product-a',
  vendorId: 'vendor-a',
  sku: 'SKU-A',
  name: 'Product A',
  category: 'General',
  costPrice: 4,
  sellingPrice: 10,
  unit: 'each',
  reorderLevel: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function createOrderData(quantity: number): Omit<Order, 'id' | 'createdAt' | 'status'> {
  return {
    vendorId: 'vendor-a',
    branchId: 'branch-a',
    branchName: 'Branch A',
    terminalId: 'terminal-a',
    terminalName: 'Terminal A',
    orderNumber: 'ORD-TEST',
    items: [{
      product,
      quantity,
      unitPrice: product.sellingPrice,
      discount: 0,
      subtotal: product.sellingPrice * quantity,
    }],
    subtotal: product.sellingPrice * quantity,
    taxAmount: 0,
    discountAmount: 0,
    totalAmount: product.sellingPrice * quantity,
    paymentMethod: 'cash',
  };
}

function completeSale(
  database: InMemoryAtomicDatabase,
  orderId: string,
  quantity: number,
) {
  return completeSaleTransaction(
    {
      vendorId: 'vendor-a',
      orderId,
      createdAt: '2026-07-26T12:00:00.000Z',
      orderData: createOrderData(quantity),
    },
    database.runAtomic,
  );
}

test('rejects insufficient active-branch stock without writing an order or movement', async () => {
  const database = new InMemoryAtomicDatabase(1);

  const result = await completeSale(database, 'order-insufficient', 2);

  assert.equal(result.success, false);
  if (result.success === false) assert.equal(result.code, 'insufficient_stock');
  assert.equal(database.state.inventory.get('vendor-a_branch-a_product-a')?.quantity, 1);
  assert.equal(database.state.orders.size, 0);
  assert.equal(database.state.movements.size, 0);
});

test('serializes concurrent checkout so only one sale can consume the final unit', async () => {
  const database = new InMemoryAtomicDatabase(1);

  const results = await Promise.all([
    completeSale(database, 'order-concurrent-a', 1),
    completeSale(database, 'order-concurrent-b', 1),
  ]);

  assert.equal(results.filter(result => result.success).length, 1);
  assert.equal(
    results.filter(result => result.success === false && result.code === 'insufficient_stock').length,
    1,
  );
  assert.equal(database.state.inventory.get('vendor-a_branch-a_product-a')?.quantity, 0);
  assert.equal(database.state.orders.size, 1);
  assert.equal(database.state.movements.size, 1);
});

test('rolls back every write when any transaction write fails', async () => {
  const database = new InMemoryAtomicDatabase(5);
  database.failOnWriteNumber = 2;

  const result = await completeSale(database, 'order-partial-failure', 2);

  assert.equal(result.success, false);
  if (result.success === false) assert.equal(result.code, 'write_failed');
  assert.equal(database.state.inventory.get('vendor-a_branch-a_product-a')?.quantity, 5);
  assert.equal(database.state.orders.size, 0);
  assert.equal(database.state.movements.size, 0);
});

test('rejects a terminal assigned to another branch', async () => {
  const database = new InMemoryAtomicDatabase(5, 'branch-b');

  const result = await completeSale(database, 'order-wrong-terminal', 1);

  assert.equal(result.success, false);
  if (result.success === false) assert.equal(result.code, 'terminal_branch_mismatch');
  assert.equal(database.state.inventory.get('vendor-a_branch-a_product-a')?.quantity, 5);
  assert.equal(database.state.orders.size, 0);
});

test('returns the existing order for a duplicate attempt without deducting stock twice', async () => {
  const database = new InMemoryAtomicDatabase(5);

  const first = await completeSale(database, 'order-idempotent', 2);
  const duplicate = await completeSale(database, 'order-idempotent', 2);

  assert.equal(first.success, true);
  assert.equal(duplicate.success, true);
  if (duplicate.success) assert.equal(duplicate.duplicate, true);
  assert.equal(database.state.inventory.get('vendor-a_branch-a_product-a')?.quantity, 3);
  assert.equal(database.state.orders.size, 1);
  assert.equal(database.state.movements.size, 1);
});
