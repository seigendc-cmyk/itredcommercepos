import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import initSqlJs, { SqlJsStatic } from 'sql.js';
import { createOfflineDatabase, OfflineDatabase, restoreOfflineDatabase } from './database';
import { provisionApprovedDeviceEnrollment } from './deviceEnrollment';
import {
  DeviceWrappingKeyStore,
  EncryptedOfflineBinaryStore,
  OfflineDataProtector,
} from './encryption';
import {
  ControlledOfflineCheckoutEngine,
  OfflineCheckoutInput,
  resolveOfflineOperationalState,
} from './offlineCheckout';
import { OfflineBinaryStore } from './persistence';
import { OfflineAuthorisedUserRepository, OfflineProductRepository } from './repositories';
import { OfflineScope } from './types';

class MemoryKeyStore implements DeviceWrappingKeyStore {
  private readonly keys = new Map<string, CryptoKey>();
  async get(deviceId: string) { return this.keys.get(deviceId); }
  async set(deviceId: string, key: CryptoKey) { this.keys.set(deviceId, key); }
  async remove(deviceId: string) { this.keys.delete(deviceId); }
}

class MemoryBinaryStore implements OfflineBinaryStore {
  bytes?: Uint8Array;
  async load() { return this.bytes; }
  async save(bytes: Uint8Array) { this.bytes = bytes.slice(); }
  async clear() { this.bytes = undefined; }
}

let sqlitePromise: Promise<SqlJsStatic> | undefined;
function loadSqlite(): Promise<SqlJsStatic> {
  sqlitePromise ||= initSqlJs({
    locateFile: file => path.resolve(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
  });
  return sqlitePromise;
}

const scope: OfflineScope = {
  tenantId: 'tenant-1',
  vendorId: 'vendor-1',
  branchId: 'branch-1',
  terminalId: 'terminal-1',
};
const fixedNow = new Date('2026-07-26T12:00:00.000Z');

interface Fixture {
  database: OfflineDatabase;
  keyStore: MemoryKeyStore;
  protector: OfflineDataProtector;
  input: OfflineCheckoutInput;
  productId: string;
  cashierId: string;
}

async function fixture(): Promise<Fixture> {
  const database = createOfflineDatabase(await loadSqlite());
  const keyStore = new MemoryKeyStore();
  const protector = await OfflineDataProtector.enroll('device-1', keyStore);
  provisionApprovedDeviceEnrollment(database, {
    ...scope,
    deviceId: 'device-1',
    terminalCode: 'POS-01',
    configuration: { offlineCheckout: true },
    configurationValidUntil: '2026-07-27T12:00:00.000Z',
    entitlementValidUntil: '2026-07-27T12:00:00.000Z',
    envelope: protector.envelope,
    validUntil: '2026-07-27T12:00:00.000Z',
  }, true);
  const cashierId = new OfflineAuthorisedUserRepository(database, scope).saveVerifier({
    remoteUserId: 'cashier-remote-1',
    displayName: 'Offline Cashier',
    role: 'cashier',
    passwordHash: `$argon2id$${'a'.repeat(64)}`,
    passwordHashAlgorithm: 'argon2id',
    authorisedUntil: '2026-07-27T12:00:00.000Z',
  });
  const product = new OfflineProductRepository(database, scope).save({
    sku: 'SKU-1',
    name: 'Coffee',
    unitOfMeasure: 'bag',
    syncStatus: 'SYNCED',
  });
  const taxId = 'tax-1';
  const now = fixedNow.toISOString();
  database.run(`
    INSERT INTO taxes(
      local_id, tenant_id, vendor_id, branch_id, terminal_id,
      tax_code, tax_name, rate_basis_points, valid_from,
      sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'VAT', 'VAT 10%', 1000, '2026-01-01T00:00:00.000Z', 'SYNCED', ?, ?)
  `, [taxId, scope.tenantId, scope.vendorId, scope.branchId, scope.terminalId, now, now]);
  database.run('UPDATE products SET tax_local_id = ? WHERE local_id = ?', [taxId, product.localId]);
  database.run(`
    INSERT INTO prices(
      local_id, product_local_id, tenant_id, vendor_id, branch_id, terminal_id,
      currency, unit_price_minor, valid_from, sync_status, created_at, updated_at
    ) VALUES ('price-1', ?, ?, ?, ?, ?, 'USD', 1000, '2026-01-01T00:00:00.000Z', 'SYNCED', ?, ?)
  `, [
    product.localId, scope.tenantId, scope.vendorId, scope.branchId, scope.terminalId, now, now,
  ]);
  database.run(`
    INSERT INTO branch_stock_balances(
      local_id, product_local_id, tenant_id, vendor_id, branch_id, terminal_id,
      quantity, authoritative_at, sync_status, created_at, updated_at
    ) VALUES ('stock-1', ?, ?, ?, ?, ?, 10, ?, 'SYNCED', ?, ?)
  `, [
    product.localId, scope.tenantId, scope.vendorId, scope.branchId,
    scope.terminalId, now, now, now,
  ]);
  database.run(`
    INSERT INTO shifts(
      local_id, tenant_id, vendor_id, branch_id, terminal_id,
      staff_local_id, status, opened_at, sync_status, created_at, updated_at
    ) VALUES ('shift-1', ?, ?, ?, ?, ?, 'OPEN', ?, 'SYNCED', ?, ?)
  `, [
    scope.tenantId, scope.vendorId, scope.branchId, scope.terminalId,
    cashierId, now, now, now,
  ]);
  return {
    database,
    keyStore,
    protector,
    productId: product.localId,
    cashierId,
    input: {
      ...scope,
      deviceId: 'device-1',
      cashierId,
      shiftId: 'shift-1',
      stockLocationId: scope.branchId,
      idempotencyKey: 'attempt-1',
      localOrderNumber: 'OFF-0001',
      currency: 'USD',
      occurredAt: '2026-07-26T11:59:00.000Z',
      items: [{ productLocalId: product.localId, quantity: 2 }],
      payments: [{ method: 'CASH', verificationMode: 'LOCAL_CASH', amountMinor: 2200 }],
    },
  };
}

function count(database: OfflineDatabase, table: string): number {
  const allowed = new Set([
    'sales', 'sale_items', 'payments', 'inventory_movements', 'receipts',
    'audit_events', 'bi_events', 'offline_outbox', 'sync_queue',
  ]);
  if (!allowed.has(table)) throw new Error('Unsupported test table');
  return database.rows<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)[0].count;
}

test('atomic offline success commits every required record and snapshots', async () => {
  const current = await fixture();
  const result = await new ControlledOfflineCheckoutEngine(current.database, {
    enabled: true, protector: current.protector, now: () => fixedNow,
  }).complete(current.input);
  assert.equal(result.status, 'COMPLETED_PENDING_SYNC');
  assert.equal(result.fiscalStatus, 'PENDING');
  assert.equal(result.receiptStatus, 'OFFLINE COMPLETED — PENDING SYNC');
  assert.equal(result.occurredAt, current.input.occurredAt);
  assert.equal(result.syncedAt, undefined);
  ['sales', 'sale_items', 'payments', 'inventory_movements', 'receipts',
    'audit_events', 'offline_outbox', 'sync_queue'].forEach(table => {
    assert.equal(count(current.database, table), 1, table);
  });
  assert.equal(count(current.database, 'bi_events'), 6);
  assert.equal(
    current.database.rows<{ quantity: number }>(
      "SELECT quantity FROM branch_stock_balances WHERE local_id = 'stock-1'",
    )[0].quantity,
    8,
  );
  const snapshot = current.database.rows<Record<string, unknown>>(
    'SELECT unit_price_minor_snapshot, tax_rate_basis_points_snapshot FROM sale_items',
  )[0];
  assert.equal(snapshot.unit_price_minor_snapshot, 1000);
  assert.equal(snapshot.tax_rate_basis_points_snapshot, 1000);
  current.database.close();
});

test('every required write failure rolls back the entire sale', async () => {
  for (const failurePoint of [
    'sale_header', 'sale_item', 'payment', 'inventory', 'receipt', 'audit', 'bi_event', 'outbox',
  ] as const) {
    const current = await fixture();
    const engine = new ControlledOfflineCheckoutEngine(current.database, {
      enabled: true,
      protector: current.protector,
      now: () => fixedNow,
      injectFailure: point => {
        if (point === failurePoint) throw new Error(`Injected ${point} failure`);
      },
    });
    await assert.rejects(() => engine.complete(current.input), /rolled back/);
    assert.equal(count(current.database, 'sales'), 0, failurePoint);
    assert.equal(count(current.database, 'offline_outbox'), 0, failurePoint);
    assert.equal(
      current.database.rows<{ quantity: number }>(
        "SELECT quantity FROM branch_stock_balances WHERE local_id = 'stock-1'",
      )[0].quantity,
      10,
      failurePoint,
    );
    current.database.close();
  }
});

test('insufficient, warehouse and another-branch stock cannot be sold', async () => {
  const insufficient = await fixture();
  insufficient.input.items[0].quantity = 11;
  insufficient.input.payments[0].amountMinor = 12100;
  await assert.rejects(
    () => new ControlledOfflineCheckoutEngine(insufficient.database, {
      enabled: true, protector: insufficient.protector, now: () => fixedNow,
    }).complete(insufficient.input),
    /Insufficient branch stock/,
  );
  assert.equal(count(insufficient.database, 'sales'), 0);
  insufficient.database.close();

  const warehouse = await fixture();
  warehouse.input.stockLocationId = 'warehouse-1';
  await assert.rejects(
    () => new ControlledOfflineCheckoutEngine(warehouse.database, {
      enabled: true, protector: warehouse.protector, now: () => fixedNow,
    }).complete(warehouse.input),
    /selling branch/,
  );
  warehouse.database.close();

  const otherBranch = await fixture();
  otherBranch.database.run("DELETE FROM branch_stock_balances WHERE local_id = 'stock-1'");
  otherBranch.database.run(`
    INSERT INTO branch_stock_balances(
      local_id, product_local_id, tenant_id, vendor_id, branch_id, terminal_id,
      quantity, authoritative_at, sync_status, created_at, updated_at
    ) VALUES ('other-stock', ?, ?, ?, 'branch-2', ?, 10, ?, 'SYNCED', ?, ?)
  `, [
    otherBranch.productId, scope.tenantId, scope.vendorId, scope.terminalId,
    fixedNow.toISOString(), fixedNow.toISOString(), fixedNow.toISOString(),
  ]);
  await assert.rejects(
    () => new ControlledOfflineCheckoutEngine(otherBranch.database, {
      enabled: true, protector: otherBranch.protector, now: () => fixedNow,
    }).complete(otherBranch.input),
    /unresolved or corrupted/,
  );
  otherBranch.database.close();
});

test('duplicate attempts return the completed sale without a second deduction', async () => {
  const current = await fixture();
  const engine = new ControlledOfflineCheckoutEngine(current.database, {
    enabled: true, protector: current.protector, now: () => fixedNow,
  });
  const first = await engine.complete(current.input);
  const duplicate = await engine.complete(current.input);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.saleId, first.saleId);
  assert.equal(count(current.database, 'sales'), 1);
  assert.equal(
    current.database.rows<{ quantity: number }>("SELECT quantity FROM branch_stock_balances WHERE local_id = 'stock-1'")[0].quantity,
    8,
  );
  current.database.close();
});

test('completed sale and pending outbox survive encrypted device restart', async () => {
  const current = await fixture();
  const first = await new ControlledOfflineCheckoutEngine(current.database, {
    enabled: true, protector: current.protector, now: () => fixedNow,
  }).complete(current.input);
  const sqlite = await loadSqlite();
  const binary = new MemoryBinaryStore();
  const encrypted = new EncryptedOfflineBinaryStore(binary, current.protector);
  await encrypted.save(current.database.backup().bytes);
  assert.ok(binary.bytes);
  assert.equal(new TextDecoder().decode(binary.bytes).includes(first.transactionId), false);
  current.database.close();
  const recoveredProtector = await OfflineDataProtector.recover(
    current.protector.envelope,
    current.keyStore,
  );
  const restoredBytes = await new EncryptedOfflineBinaryStore(binary, recoveredProtector).load();
  assert.ok(restoredBytes);
  const restored = restoreOfflineDatabase(sqlite, {
    format: 'itred-sqlite-v1',
    schemaVersion: 3,
    createdAt: fixedNow.toISOString(),
    bytes: restoredBytes,
  });
  const duplicate = await new ControlledOfflineCheckoutEngine(restored, {
    enabled: true, protector: recoveredProtector, now: () => fixedNow,
  }).complete(current.input);
  assert.equal(duplicate.saleId, first.saleId);
  assert.equal(count(restored, 'offline_outbox'), 1);
  restored.close();
});

test('expired access, invalid device, closed shift, terminal controls and missing encryption fail closed', async () => {
  const expired = await fixture();
  expired.database.run(
    "UPDATE authorised_offline_users SET authorised_until = '2026-07-25T00:00:00.000Z' WHERE local_id = ?",
    [expired.cashierId],
  );
  await assert.rejects(
    () => new ControlledOfflineCheckoutEngine(expired.database, {
      enabled: true, protector: expired.protector, now: () => fixedNow,
    }).complete(expired.input),
    /expired/,
  );
  expired.database.close();

  const suspended = await fixture();
  suspended.database.run("UPDATE terminal_configuration SET terminal_status = 'SUSPENDED'");
  await assert.rejects(
    () => new ControlledOfflineCheckoutEngine(suspended.database, {
      enabled: true, protector: suspended.protector, now: () => fixedNow,
    }).complete(suspended.input),
    /suspended/,
  );
  suspended.database.close();

  const revokedDevice = await fixture();
  revokedDevice.database.run("UPDATE device_enrolments SET enrolment_status = 'REVOKED'");
  await assert.rejects(
    () => new ControlledOfflineCheckoutEngine(revokedDevice.database, {
      enabled: true, protector: revokedDevice.protector, now: () => fixedNow,
    }).complete(revokedDevice.input),
    /not actively enrolled/,
  );
  revokedDevice.database.close();

  const closedShift = await fixture();
  closedShift.database.run("UPDATE shifts SET status = 'CLOSED'");
  await assert.rejects(
    () => new ControlledOfflineCheckoutEngine(closedShift.database, {
      enabled: true, protector: closedShift.protector, now: () => fixedNow,
    }).complete(closedShift.input),
    /open terminal shift/i,
  );
  closedShift.database.close();

  const unlicensed = await fixture();
  unlicensed.database.run("UPDATE terminal_configuration SET licence_status = 'UNLICENSED'");
  await assert.rejects(
    () => new ControlledOfflineCheckoutEngine(unlicensed.database, {
      enabled: true, protector: unlicensed.protector, now: () => fixedNow,
    }).complete(unlicensed.input),
    /configuration or entitlement is outdated/,
  );
  unlicensed.database.close();

  const unlicensedBranch = await fixture();
  unlicensedBranch.database.run("UPDATE terminal_configuration SET branch_licence_status = 'UNLICENSED'");
  await assert.rejects(
    () => new ControlledOfflineCheckoutEngine(unlicensedBranch.database, {
      enabled: true, protector: unlicensedBranch.protector, now: () => fixedNow,
    }).complete(unlicensedBranch.input),
    /configuration or entitlement is outdated/,
  );
  unlicensedBranch.database.close();

  const inactiveSubscription = await fixture();
  inactiveSubscription.database.run("UPDATE terminal_configuration SET subscription_status = 'INACTIVE'");
  await assert.rejects(
    () => new ControlledOfflineCheckoutEngine(inactiveSubscription.database, {
      enabled: true, protector: inactiveSubscription.protector, now: () => fixedNow,
    }).complete(inactiveSubscription.input),
    /configuration or entitlement is outdated/,
  );
  inactiveSubscription.database.close();

  const noKey = await fixture();
  await assert.rejects(
    () => new ControlledOfflineCheckoutEngine(noKey.database, {
      enabled: true, now: () => fixedNow,
    }).complete(noKey.input),
    /encryption is unavailable/,
  );
  assert.equal(count(noKey.database, 'sales'), 0);
  noKey.database.close();
});

test('failed online device enrolment emits durable BI without exposing key material', async () => {
  const current = await fixture();
  await assert.rejects(
    async () => provisionApprovedDeviceEnrollment(current.database, {
      ...scope,
      deviceId: 'device-2',
      terminalCode: 'POS-01',
      configuration: { offlineCheckout: true },
      configurationValidUntil: '2026-07-27T12:00:00.000Z',
      entitlementValidUntil: '2026-07-27T12:00:00.000Z',
      envelope: current.protector.envelope,
    }, false),
    /authorised online session/,
  );
  const event = current.database.rows<Record<string, unknown>>(
    "SELECT event_type, payload_json FROM bi_events WHERE event_type = 'DEVICE_ENROLMENT_FAILED'",
  )[0];
  assert.equal(event.event_type, 'DEVICE_ENROLMENT_FAILED');
  assert.equal(String(event.payload_json).includes(current.protector.envelope.wrappedOperationalKey), false);
  current.database.close();
});

test('operational-state resolver covers every approved display state', () => {
  assert.equal(resolveOfflineOperationalState({ online: true }), 'ONLINE');
  assert.equal(resolveOfflineOperationalState({ online: false }), 'OFFLINE');
  assert.equal(resolveOfflineOperationalState({ online: false, syncing: true }), 'SYNCING');
  assert.equal(resolveOfflineOperationalState({ online: false, syncError: true }), 'SYNC ERROR');
  assert.equal(resolveOfflineOperationalState({ online: false, fiscalisationPending: true }), 'FISCALISATION PENDING');
  assert.equal(resolveOfflineOperationalState({ online: false, configurationOutdated: true }), 'CONFIGURATION OUTDATED');
  assert.equal(resolveOfflineOperationalState({ online: false, terminalSuspended: true }), 'TERMINAL SUSPENDED');
});
