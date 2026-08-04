import assert from 'node:assert/strict';
import test from 'node:test';
import { Branch, BranchInventory, Warehouse, WarehouseInventory } from '../../../types';
import { InventoryPostingEngine, InventoryRepository } from '../application';
import {
  deterministicInventoryBalanceId, emptyInventoryBalance, InventoryBalance, InventoryDomainError,
  InventoryMovement, InventoryPostingCommand, StockLocation, validateInventoryBalance,
} from '../domain';
import {
  branchInventoryToCanonicalBalance, branchToCanonicalStockLocation,
  warehouseInventoryToCanonicalBalance, warehouseToCanonicalStockLocation,
} from '../infrastructure';

const NOW = '2026-08-04T10:00:00.000Z';
const warehouse: StockLocation = { id: 'wh-1', tenantId: 'tenant-1', vendorId: 'vendor-1', type: 'WAREHOUSE', name: 'Main', code: 'WH1', status: 'ACTIVE', licenceStatus: 'LICENSED', createdAt: NOW, updatedAt: NOW };
const branch: StockLocation = { id: 'br-1', tenantId: 'tenant-1', vendorId: 'vendor-1', type: 'BRANCH', name: 'CBD', code: 'BR1', status: 'ACTIVE', licenceStatus: 'LICENSED', createdAt: NOW, updatedAt: NOW };
const branch2: StockLocation = { ...branch, id: 'br-2', name: 'North', code: 'BR2' };

class MemoryRepository implements InventoryRepository {
  locations = new Map<string, StockLocation>([[warehouse.id, warehouse], [branch.id, branch], [branch2.id, branch2]]);
  balances = new Map<string, InventoryBalance>();
  movements = new Map<string, InventoryMovement>();
  async getStockLocation(id: string) { return this.locations.get(id) ?? null; }
  async getBalance(tenantId: string, vendorId: string, locationId: string, productId: string) { return this.balances.get(deterministicInventoryBalanceId({ tenantId, vendorId, stockLocationId: locationId, productId })) ?? null; }
  async getMovementByIdempotencyKey(_tenantId: string, _vendorId: string, key: string) { return this.movements.get(key) ?? null; }
  async saveMovement(movement: InventoryMovement) { this.movements.set(movement.idempotencyKey, movement); }
  async saveBalance(balance: InventoryBalance) { this.balances.set(balance.id, balance); }
  async runAtomic<T>(operation: (repository: InventoryRepository) => Promise<T>) { return operation(this); }
}

function command(overrides: Partial<InventoryPostingCommand> = {}): InventoryPostingCommand {
  return { commandId: 'movement-1', idempotencyKey: 'key-1', tenantId: 'tenant-1', vendorId: 'vendor-1', productId: 'product-1', movementType: 'SUPPLIER_RECEIPT', quantity: 5, destinationLocationId: warehouse.id, referenceType: 'RECEIPT', referenceId: 'receipt-1', actorId: 'user-1', occurredAt: NOW, ...overrides };
}
function engine(repository = new MemoryRepository()) { return { repository, engine: new InventoryPostingEngine(repository, async () => true, () => NOW) }; }
async function rejectsCode(promise: Promise<unknown>, code: string) { await assert.rejects(promise, (error: InventoryDomainError) => error.code === code); }

test('balance IDs are deterministic and include every identity boundary', () => {
  const identity = { tenantId: 'tenant-1', vendorId: 'vendor-1', stockLocationId: 'wh-1', productId: 'product-1' };
  assert.equal(deterministicInventoryBalanceId(identity), deterministicInventoryBalanceId({ ...identity }));
  assert.notEqual(deterministicInventoryBalanceId(identity), deterministicInventoryBalanceId({ ...identity, tenantId: 'tenant-2' }));
});

test('negative and non-finite balance buckets are rejected', () => {
  const balance = emptyInventoryBalance({ tenantId: 't', vendorId: 'v', stockLocationId: 'l', productId: 'p' }, NOW);
  assert.throws(() => validateInventoryBalance({ ...balance, reservedQty: -1 }), /non-negative/);
  assert.throws(() => validateInventoryBalance({ ...balance, damagedQty: Number.NaN }), /finite/);
});

test('tenant and vendor identities must be explicit', () => {
  assert.throws(() => deterministicInventoryBalanceId({ tenantId: '', vendorId: 'v', stockLocationId: 'l', productId: 'p' }), /tenantId/);
  const legacy: WarehouseInventory = { id: 'x', vendorId: '', warehouseId: 'w', productId: 'p', quantity: 1, lastUpdated: NOW };
  assert.throws(() => warehouseInventoryToCanonicalBalance(legacy, 'tenant-1'), /vendorId/);
});

test('supplier receipt accepts a warehouse and rejects a branch', async () => {
  const accepted = engine();
  assert.equal((await accepted.engine.post(command())).movement.destinationAfterQty, 5);
  await rejectsCode(engine().engine.post(command({ destinationLocationId: branch.id })), 'INVALID_ROUTE');
});

test('transfer route accepts warehouse-to-branch and rejects branch-to-branch', async () => {
  const accepted = engine();
  accepted.repository.balances.set(deterministicInventoryBalanceId({ tenantId: 'tenant-1', vendorId: 'vendor-1', stockLocationId: warehouse.id, productId: 'product-1' }), { ...emptyInventoryBalance({ tenantId: 'tenant-1', vendorId: 'vendor-1', stockLocationId: warehouse.id, productId: 'product-1' }, NOW), onHandQty: 10 });
  assert.equal((await accepted.engine.post(command({ movementType: 'TRANSFER_DISPATCH', sourceLocationId: warehouse.id, destinationLocationId: branch.id }))).duplicate, false);
  await rejectsCode(engine().engine.post(command({ movementType: 'TRANSFER_DISPATCH', sourceLocationId: branch.id, destinationLocationId: branch2.id })), 'INVALID_ROUTE');
});

test('sale source must be a branch', async () => {
  await rejectsCode(engine().engine.post(command({ movementType: 'SALE', sourceLocationId: warehouse.id, destinationLocationId: undefined })), 'INVALID_ROUTE');
});

test('source stock cannot become negative', async () => {
  await rejectsCode(engine().engine.post(command({ movementType: 'SALE', quantity: 1, sourceLocationId: branch.id, destinationLocationId: undefined })), 'INSUFFICIENT_STOCK');
});

test('idempotent retry returns the existing posting', async () => {
  const context = engine();
  const first = await context.engine.post(command());
  const second = await context.engine.post(command({ quantity: 99 }));
  assert.equal(second.duplicate, true);
  assert.equal(second.movement, first.movement);
  assert.equal(second.movement.quantity, 5);
});

test('posting records canonical before and after quantities', async () => {
  const context = engine();
  const result = await context.engine.post(command());
  assert.equal(result.movement.destinationBeforeQty, 0);
  assert.equal(result.movement.destinationAfterQty, 5);
  assert.equal(result.balances[0].version, 1);
});

test('tenant mismatch is rejected', async () => {
  const context = engine();
  context.repository.locations.set(branch.id, { ...branch, tenantId: 'tenant-2' });
  await rejectsCode(context.engine.post(command({ movementType: 'SALE', sourceLocationId: branch.id, destinationLocationId: undefined })), 'LOCATION_OWNERSHIP_MISMATCH');
});

test('unlicensed and inactive locations are rejected', async () => {
  const unlicensed = engine();
  unlicensed.repository.locations.set(warehouse.id, { ...warehouse, licenceStatus: 'UNLICENSED' });
  await rejectsCode(unlicensed.engine.post(command()), 'LOCATION_UNLICENSED');
  const inactive = engine();
  inactive.repository.locations.set(warehouse.id, { ...warehouse, status: 'SUSPENDED' });
  await rejectsCode(inactive.engine.post(command()), 'LOCATION_INACTIVE');
});

test('legacy warehouse inventory maps without fabricating tenant identity', () => {
  const legacy: WarehouseInventory = { id: 'legacy', vendorId: 'vendor-1', warehouseId: 'wh-1', productId: 'product-1', quantity: 8, averageUnitCost: 2, lastUpdated: NOW };
  const mapped = warehouseInventoryToCanonicalBalance(legacy, 'tenant-1');
  assert.equal(mapped.tenantId, 'tenant-1'); assert.equal(mapped.stockLocationId, 'wh-1'); assert.equal(mapped.onHandQty, 8);
  const legacyLocation: Warehouse = { id: 'wh-1', vendorId: 'vendor-1', name: 'Main', code: 'WH1', location: 'Harare', isDefault: true, status: 'active', licenseStatus: 'licensed', createdAt: NOW };
  assert.deepEqual(warehouseToCanonicalStockLocation(legacyLocation, 'tenant-1'), { ...warehouse, name: 'Main' });
});

test('legacy branch inventory maps without fabricating tenant identity', () => {
  const legacy: BranchInventory = { id: 'legacy', vendorId: 'vendor-1', branchId: 'br-1', productId: 'product-1', quantity: 3, lastUpdated: NOW };
  const mapped = branchInventoryToCanonicalBalance(legacy, 'tenant-1');
  assert.equal(mapped.tenantId, 'tenant-1'); assert.equal(mapped.stockLocationId, 'br-1'); assert.equal(mapped.onHandQty, 3);
  const legacyLocation: Branch = { id: 'br-1', vendorId: 'vendor-1', name: 'CBD', code: 'BR1', address: 'Harare', phone: '', isDefault: true, status: 'active', licenseStatus: 'licensed', createdAt: NOW };
  assert.deepEqual(branchToCanonicalStockLocation(legacyLocation, 'tenant-1'), branch);
});
