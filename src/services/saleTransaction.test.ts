import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Branch,
  BranchInventory,
  Order,
  Product,
  Terminal,
} from '../types';
import {
  AtomicSaleRunner,
  CompleteSaleTransactionInput,
  completeSaleTransaction,
  InventoryMovement,
  SaleTransactionStore,
} from './saleTransaction';

interface DatabaseState {
  orders: Map<string, Order>;
  terminals: Map<string, Terminal>;
  branches: Map<string, Branch>;
  products: Map<string, Product>;
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
    const branch: Branch = {
      id: 'branch-a',
      vendorId: 'vendor-a',
      name: 'Branch A',
      code: 'BR-A',
      address: 'Harare',
      phone: '',
      isDefault: true,
      status: 'active',
      licenseStatus: 'licensed',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    this.state = {
      orders: new Map(),
      terminals: new Map([[terminal.id, terminal]]),
      branches: new Map([[branch.id, branch]]),
      products: new Map([[product.id, product]]),
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
        getBranch: async branchId => pending.branches.get(branchId) || null,
        getProduct: async productId => pending.products.get(productId) || null,
        getInventory: async (branchId, productId) =>
          pending.inventory.get(`vendor-a_${branchId}_${productId}`) || null,
        getMovementByIdempotencyKey: async (idempotencyKey, movementId) => {
          const movement = pending.movements.get(movementId) || null;
          return movement?.idempotencyKey === idempotencyKey ? movement : null;
        },
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
      tenantId: 'vendor-a',
      vendorId: 'vendor-a',
      actorId: 'staff-a',
      checkoutAttemptId: orderId,
      orderId,
      createdAt: '2026-07-26T12:00:00.000Z',
      orderData: createOrderData(quantity),
    },
    database.runAtomic,
  );
}

function completeSaleWith(
  database: InMemoryAtomicDatabase,
  orderId: string,
  orderData: Omit<Order, 'id' | 'createdAt' | 'status'>,
  overrides: Partial<CompleteSaleTransactionInput> = {},
) {
  return completeSaleTransaction({
    tenantId: 'vendor-a',
    vendorId: 'vendor-a',
    actorId: 'staff-a',
    checkoutAttemptId: orderId,
    orderId,
    createdAt: '2026-07-26T12:00:00.000Z',
    orderData,
    ...overrides,
  }, database.runAtomic);
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

test('posts canonical SALE movement from the active branch with positive magnitude', async () => {
  const database = new InMemoryAtomicDatabase(5);
  const result = await completeSale(database, 'order-canonical', 2);
  assert.equal(result.success, true);
  if (!result.success) return;
  const movement = result.movements[0];
  assert.equal(movement.movementType, 'SALE');
  assert.equal(movement.tenantId, 'vendor-a');
  assert.equal(movement.vendorId, 'vendor-a');
  assert.equal(movement.sourceLocationId, 'branch-a');
  assert.equal(movement.destinationLocationId, undefined);
  assert.equal(movement.quantity, 2);
  assert.equal(movement.sourceBeforeQty, 5);
  assert.equal(movement.sourceAfterQty, 3);
  assert.equal(movement.referenceType, 'SALE');
  assert.equal(movement.referenceId, 'order-canonical');
  assert.equal(movement.actorId, 'staff-a');
});

test('rejects an explicit tenant mismatch without touching inventory', async () => {
  const database = new InMemoryAtomicDatabase(5);
  const result = await completeSaleWith(database, 'order-tenant-mismatch', createOrderData(1), { tenantId: 'tenant-b' });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, 'invalid_order');
  assert.equal(database.state.inventory.get('vendor-a_branch-a_product-a')?.quantity, 5);
});

test('rejects vendor-mismatched branch inventory ownership', async () => {
  const database = new InMemoryAtomicDatabase(5);
  database.state.branches.set('branch-a', { ...database.state.branches.get('branch-a')!, vendorId: 'vendor-b' });
  const result = await completeSale(database, 'order-vendor-mismatch', 1);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, 'invalid_order');
  assert.equal(database.state.inventory.get('vendor-a_branch-a_product-a')?.quantity, 5);
});

test('rejects inactive and unlicensed sale branches', async () => {
  const inactive = new InMemoryAtomicDatabase(5);
  inactive.state.branches.set('branch-a', { ...inactive.state.branches.get('branch-a')!, status: 'suspended' });
  assert.equal((await completeSale(inactive, 'order-inactive', 1)).success, false);
  const unlicensed = new InMemoryAtomicDatabase(5);
  unlicensed.state.branches.set('branch-a', { ...unlicensed.state.branches.get('branch-a')!, licenseStatus: 'unlicensed' });
  assert.equal((await completeSale(unlicensed, 'order-unlicensed', 1)).success, false);
  assert.equal(inactive.state.inventory.get('vendor-a_branch-a_product-a')?.quantity, 5);
  assert.equal(unlicensed.state.inventory.get('vendor-a_branch-a_product-a')?.quantity, 5);
});

test('cannot substitute warehouse inventory for the required branch source', async () => {
  const database = new InMemoryAtomicDatabase(0);
  database.state.branches.delete('branch-a');
  const result = await completeSale(database, 'order-warehouse-source', 1);
  assert.equal(result.success, false);
  assert.equal(database.state.orders.size, 0);
  assert.equal(database.state.movements.size, 0);
});

test('aggregates duplicate product lines into one deduction and movement', async () => {
  const database = new InMemoryAtomicDatabase(5);
  const orderData = createOrderData(1);
  orderData.items.push({ ...orderData.items[0], quantity: 2, subtotal: 20 });
  const result = await completeSaleWith(database, 'order-aggregate', orderData);
  assert.equal(result.success, true);
  assert.equal(database.state.inventory.get('vendor-a_branch-a_product-a')?.quantity, 2);
  assert.equal(database.state.movements.size, 1);
  if (result.success) assert.equal(result.movements[0].quantity, 3);
});

test('creates exactly one deterministic canonical movement for every product', async () => {
  const database = new InMemoryAtomicDatabase(5);
  const productB: Product = { ...product, id: 'product-b', sku: 'SKU-B', name: 'Product B' };
  database.state.products.set(productB.id, productB);
  database.state.inventory.set('vendor-a_branch-a_product-b', { id: 'vendor-a_branch-a_product-b', vendorId: 'vendor-a', branchId: 'branch-a', productId: 'product-b', quantity: 4, lastUpdated: product.createdAt });
  const orderData = createOrderData(1);
  orderData.items.push({ product: productB, quantity: 2, unitPrice: 10, discount: 0, subtotal: 20 });
  const result = await completeSaleWith(database, 'order-two-products', orderData);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.movements.length, 2);
  assert.equal(new Set(result.movements.map(movement => movement.productId)).size, 2);
  assert.equal(new Set(result.movements.map(movement => movement.idempotencyKey)).size, 2);
  assert.deepEqual(result.movements.map(movement => movement.id), ['sale_order-two-products_product-a', 'sale_order-two-products_product-b']);
});

test('retains a typed compatibility projection for existing sale reports', async () => {
  const result = await completeSale(new InMemoryAtomicDatabase(5), 'order-report', 2);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.movements[0].compatibility, {
    branchId: 'branch-a', terminalId: 'terminal-a', orderId: 'order-report', productName: 'Product A',
    movementType: 'sale', quantityDelta: -2, quantityBefore: 5, quantityAfter: 3, createdAt: '2026-07-26T12:00:00.000Z',
  });
});
