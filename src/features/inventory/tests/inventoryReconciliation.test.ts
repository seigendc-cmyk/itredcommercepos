import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryPostingEngine, InventoryRepository } from '../application';
import { createCompensatingInventoryCommand, reconcileInventoryBalances } from '../application/inventoryReconciliation';
import {
  emptyInventoryBalance,
  InventoryBalance,
  InventoryMovement,
  InventoryPostingCommand,
  StockLocation,
} from '../domain';

const NOW = '2026-08-06T00:00:00.000Z';

class MemoryRepository implements InventoryRepository {
  locations = new Map<string, StockLocation>();
  balances = new Map<string, InventoryBalance>();
  movements = new Map<string, InventoryMovement>();
  async getStockLocation(id: string) { return this.locations.get(id) ?? null; }
  async getBalance(_tenantId: string, _vendorId: string, locationId: string, productId: string) {
    return [...this.balances.values()].find(balance => balance.stockLocationId === locationId && balance.productId === productId) ?? null;
  }
  async getMovementByIdempotencyKey(_tenantId: string, _vendorId: string, key: string) { return this.movements.get(key) ?? null; }
  async saveMovement(movement: InventoryMovement) { this.movements.set(movement.idempotencyKey, movement); }
  async saveBalance(balance: InventoryBalance) { this.balances.set(balance.id, balance); }
  async runAtomic<T>(operation: (repository: InventoryRepository) => Promise<T>) { return operation(this); }
}

function location(id: string, type: 'WAREHOUSE' | 'BRANCH'): StockLocation {
  return { id, tenantId: 'tenant', vendorId: 'vendor', type, name: id, code: id, status: 'ACTIVE', licenceStatus: 'LICENSED', createdAt: NOW, updatedAt: NOW };
}

function command(overrides: Partial<InventoryPostingCommand>): InventoryPostingCommand {
  return {
    commandId: 'command', idempotencyKey: 'key', tenantId: 'tenant', vendorId: 'vendor', productId: 'product',
    movementType: 'OPENING_BALANCE', quantity: 10, destinationLocationId: 'warehouse', referenceType: 'TEST', referenceId: 'test', actorId: 'actor', occurredAt: NOW,
    ...overrides,
  };
}

test('transfer dispatch and receipt reconcile source, in-transit and destination exactly once', async () => {
  const repository = new MemoryRepository();
  repository.locations.set('warehouse', location('warehouse', 'WAREHOUSE'));
  repository.locations.set('branch', location('branch', 'BRANCH'));
  const warehouse = emptyInventoryBalance({ tenantId: 'tenant', vendorId: 'vendor', stockLocationId: 'warehouse', productId: 'product' }, NOW);
  repository.balances.set(warehouse.id, { ...warehouse, onHandQty: 10 });
  const engine = new InventoryPostingEngine(repository, () => true, () => NOW);
  const dispatch = await engine.post(command({ commandId: 'dispatch', idempotencyKey: 'dispatch', movementType: 'TRANSFER_DISPATCH', quantity: 6, sourceLocationId: 'warehouse', destinationLocationId: 'branch' }));
  await engine.post(command({ commandId: 'receipt', idempotencyKey: 'receipt', movementType: 'TRANSFER_RECEIPT', quantity: 6, sourceLocationId: 'warehouse', destinationLocationId: 'branch' }));
  const duplicate = await engine.post(command({ commandId: 'receipt', idempotencyKey: 'receipt', movementType: 'TRANSFER_RECEIPT', quantity: 6, sourceLocationId: 'warehouse', destinationLocationId: 'branch' }));
  assert.equal(dispatch.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal((await repository.getBalance('tenant', 'vendor', 'warehouse', 'product'))?.onHandQty, 4);
  assert.deepEqual(
    { onHand: (await repository.getBalance('tenant', 'vendor', 'branch', 'product'))?.onHandQty, inTransit: (await repository.getBalance('tenant', 'vendor', 'branch', 'product'))?.inTransitQty },
    { onHand: 6, inTransit: 0 },
  );
  assert.equal(repository.movements.size, 2);
});

test('compensating reversal restores balance without editing movement history', async () => {
  const repository = new MemoryRepository();
  repository.locations.set('branch', location('branch', 'BRANCH'));
  const branch = emptyInventoryBalance({ tenantId: 'tenant', vendorId: 'vendor', stockLocationId: 'branch', productId: 'product' }, NOW);
  repository.balances.set(branch.id, { ...branch, onHandQty: 5 });
  const engine = new InventoryPostingEngine(repository, () => true, () => NOW);
  const damage = await engine.post(command({ commandId: 'damage', idempotencyKey: 'damage', movementType: 'DAMAGE_WRITE_OFF', quantity: 2, sourceLocationId: 'branch', destinationLocationId: undefined }));
  const reversal = createCompensatingInventoryCommand(damage.movement, { correctionId: 'correction', actorId: 'manager', occurredAt: NOW, reasonCode: 'DAMAGE_ENTRY_ERROR' });
  await engine.post(reversal);
  assert.equal((await repository.getBalance('tenant', 'vendor', 'branch', 'product'))?.onHandQty, 5);
  assert.equal(repository.movements.size, 2);
  assert.equal(repository.movements.get(reversal.idempotencyKey)?.reversalOfMovementId, damage.movement.id);
});

test('reconciliation reports seeded balance-versus-ledger divergence without mutation', async () => {
  const repository = new MemoryRepository();
  repository.locations.set('warehouse', location('warehouse', 'WAREHOUSE'));
  const engine = new InventoryPostingEngine(repository, () => true, () => NOW);
  await engine.post(command({ quantity: 10 }));
  const balance = (await repository.getBalance('tenant', 'vendor', 'warehouse', 'product'))!;
  const divergent = { ...balance, onHandQty: 13 };
  const findings = reconcileInventoryBalances([divergent], [...repository.movements.values()]);
  assert.equal(findings.length, 1);
  assert.deepEqual({
    tenantId: findings[0].tenantId,
    vendorId: findings[0].vendorId,
    stockLocationId: findings[0].stockLocationId,
    productId: findings[0].productId,
    bucket: findings[0].bucket,
    ledgerQuantity: findings[0].ledgerQuantity,
    balanceQuantity: findings[0].balanceQuantity,
    difference: findings[0].difference,
  }, {
    tenantId: 'tenant', vendorId: 'vendor', stockLocationId: 'warehouse', productId: 'product',
    bucket: 'onHandQty', ledgerQuantity: 10, balanceQuantity: 13, difference: 3,
  });
  assert.equal(divergent.onHandQty, 13);
});
