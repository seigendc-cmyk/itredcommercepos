import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import initSqlJs, { SqlJsStatic } from 'sql.js';
import { createOfflineDatabase, restoreOfflineDatabase } from './database';
import { OFFLINE_MIGRATIONS } from './migrations';
import {
  OfflineAuthorisedUserRepository,
  OfflineProductRepository,
  OfflineSaleDraftRepository,
  OfflineSyncQueueRepository,
  OfflineSyncResultRepository,
} from './repositories';
import { OfflineScope } from './types';

let sqlitePromise: Promise<SqlJsStatic> | undefined;
function loadSqlite(): Promise<SqlJsStatic> {
  sqlitePromise ||= initSqlJs({
    locateFile: file => path.resolve(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
  });
  return sqlitePromise;
}

const scopeA: OfflineScope = {
  tenantId: 'tenant-a', vendorId: 'vendor-a', branchId: 'branch-a', terminalId: 'terminal-a',
};
const scopeB: OfflineScope = {
  tenantId: 'tenant-b', vendorId: 'vendor-b', branchId: 'branch-b', terminalId: 'terminal-b',
};

function seedDraftShift(database: ReturnType<typeof createOfflineDatabase>): string {
  const users = new OfflineAuthorisedUserRepository(database, scopeA);
  const cashierId = users.saveVerifier({
    remoteUserId: 'valid-user',
    displayName: 'Valid Cashier',
    role: 'cashier',
    passwordHash: `$argon2id$${'a'.repeat(64)}`,
    passwordHashAlgorithm: 'argon2id',
    authorisedUntil: '2026-12-31T00:00:00.000Z',
  });
  const now = new Date().toISOString();
  database.run(`
    INSERT INTO shifts(
      local_id, tenant_id, vendor_id, branch_id, terminal_id,
      staff_local_id, status, opened_at, sync_status, created_at, updated_at
    ) VALUES ('draft-shift', ?, ?, ?, ?, ?, 'OPEN', ?, 'SYNCED', ?, ?)
  `, [
    scopeA.tenantId, scopeA.vendorId, scopeA.branchId, scopeA.terminalId,
    cashierId, now, now, now,
  ]);
  return cashierId;
}

test('applies controlled migrations once and creates every required table', async () => {
  const database = createOfflineDatabase(await loadSqlite());
  const tables = database.rows<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).map(row => row.name);
  [
    'terminal_configuration', 'authorised_offline_users', 'products', 'prices', 'taxes',
    'branch_stock_balances', 'customers', 'shifts', 'sales', 'sale_items', 'payments',
    'receipts', 'inventory_movements', 'audit_events', 'bi_events', 'fiscalisation_status',
    'sync_queue', 'sync_acknowledgements', 'conflict_records',
  ].forEach(table => assert.ok(tables.includes(table), `missing ${table}`));
  assert.equal(database.schemaVersion, OFFLINE_MIGRATIONS.at(-1)?.version);
  assert.equal(database.migrate(), OFFLINE_MIGRATIONS.at(-1)?.version);
  assert.equal(database.rows<{ count: number }>('SELECT COUNT(*) AS count FROM schema_migrations')[0].count, 3);
  database.close();
});

test('repositories create globally unique records and manage sync state', async () => {
  const database = createOfflineDatabase(await loadSqlite());
  const products = new OfflineProductRepository(database, scopeA);
  const first = products.save({ sku: 'SKU-1', name: 'Coffee', unitOfMeasure: 'bag' });
  const second = products.save({ sku: 'SKU-2', name: 'Tea', unitOfMeasure: 'box' });
  assert.notEqual(first.localId, second.localId);
  assert.match(first.localId, /^product_[0-9a-f-]{36}$/);
  assert.equal(products.list().length, 2);

  const queue = new OfflineSyncQueueRepository(database, scopeA);
  const queued = queue.enqueue({
    entityType: 'product', entityLocalId: first.localId, operation: 'CREATE', payload: first,
  });
  assert.equal(queued.syncStatus, 'PENDING');
  queue.mark(queued.localId, 'FAILED', 'network unavailable');
  const failed = queue.list(['FAILED'])[0];
  assert.equal(failed.attemptCount, 1);
  assert.equal(failed.lastError, 'network unavailable');
  const results = new OfflineSyncResultRepository(database, scopeA);
  results.recordConflict(failed, { remoteVersion: 2 }, true);
  assert.equal(
    database.rows<{ count: number }>('SELECT COUNT(*) AS count FROM conflict_records')[0].count,
    1,
  );
  database.close();
});

test('repository reads are strictly isolated by tenant, vendor, branch and terminal', async () => {
  const database = createOfflineDatabase(await loadSqlite());
  const productsA = new OfflineProductRepository(database, scopeA);
  const productsB = new OfflineProductRepository(database, scopeB);
  const productA = productsA.save({ sku: 'SHARED', name: 'Vendor A', unitOfMeasure: 'unit' });
  const productB = productsB.save({ sku: 'SHARED', name: 'Vendor B', unitOfMeasure: 'unit' });
  assert.deepEqual(productsA.list().map(item => item.name), ['Vendor A']);
  assert.deepEqual(productsB.list().map(item => item.name), ['Vendor B']);
  assert.equal(productsA.findByLocalId(productB.localId), undefined);
  assert.equal(productsB.findByLocalId(productA.localId), undefined);
  database.close();
});

test('backup and restore preserve SQLite data and schema version', async () => {
  const sqlite = await loadSqlite();
  const database = createOfflineDatabase(sqlite);
  new OfflineProductRepository(database, scopeA).save({
    sku: 'BACKUP-1', name: 'Backup product', unitOfMeasure: 'unit',
  });
  const backup = database.backup();
  database.close();
  const restored = restoreOfflineDatabase(sqlite, backup);
  assert.equal(restored.schemaVersion, backup.schemaVersion);
  assert.equal(new OfflineProductRepository(restored, scopeA).list()[0].name, 'Backup product');
  restored.close();
});

test('credentials require derived verifiers and completed offline sales stay blocked', async () => {
  const database = createOfflineDatabase(await loadSqlite());
  const users = new OfflineAuthorisedUserRepository(database, scopeA);
  assert.throws(() => users.saveVerifier({
    remoteUserId: 'user-1', displayName: 'Cashier', role: 'cashier',
    passwordHash: 'plaintext', passwordHashAlgorithm: 'argon2id',
    authorisedUntil: '2026-12-31T00:00:00.000Z',
  }), /plaintext passwords are forbidden/);
  const sales = new OfflineSaleDraftRepository(database, scopeA);
  const cashierId = seedDraftShift(database);
  const saleId = sales.createDraft({
    deviceId: 'draft-device',
    cashierId,
    shiftId: 'draft-shift',
    localOrderNumber: 'LOCAL-DRAFT-1', currency: 'USD',
    subtotalMinor: 100, taxTotalMinor: 10, totalMinor: 110,
  });
  assert.throws(() => sales.complete(), /approved atomic offline checkout engine/);
  database.run("UPDATE sales SET status = 'COMPLETED_PENDING_SYNC' WHERE local_id = ?", [saleId]);
  assert.throws(
    () => database.run('UPDATE sales SET total_minor = 999 WHERE local_id = ?', [saleId]),
    /Completed offline sales are immutable/,
  );
  database.close();
});

test('historical sale-item price and tax snapshots are immutable', async () => {
  const database = createOfflineDatabase(await loadSqlite());
  const product = new OfflineProductRepository(database, scopeA).save({
    sku: 'SNAP-1', name: 'Snapshot product', unitOfMeasure: 'unit',
  });
  const cashierId = seedDraftShift(database);
  const saleId = new OfflineSaleDraftRepository(database, scopeA).createDraft({
    deviceId: 'draft-device',
    cashierId,
    shiftId: 'draft-shift',
    localOrderNumber: 'LOCAL-DRAFT-2', currency: 'USD',
    subtotalMinor: 100, taxTotalMinor: 10, totalMinor: 110,
  });
  const now = new Date().toISOString();
  database.run(`
    INSERT INTO sale_items(
      local_id, sale_local_id, product_local_id, tenant_id, vendor_id, branch_id, terminal_id,
      sku_snapshot, product_name_snapshot, quantity, unit_price_minor_snapshot,
      tax_code_snapshot, tax_rate_basis_points_snapshot, tax_amount_minor, line_total_minor,
      sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REQUIRES_REVIEW', ?, ?)
  `, [
    'sale-item-1', saleId, product.localId,
    scopeA.tenantId, scopeA.vendorId, scopeA.branchId, scopeA.terminalId,
    product.sku, product.name, 1, 100, 'VAT', 1000, 10, 110, now, now,
  ]);
  assert.throws(
    () => database.run("UPDATE sale_items SET unit_price_minor_snapshot = 200 WHERE local_id = 'sale-item-1'"),
    /Historical price and tax snapshots are immutable/,
  );
  database.close();
});
