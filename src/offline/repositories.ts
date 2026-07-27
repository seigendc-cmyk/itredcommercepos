import { OfflineDatabase } from './database';
import { createOfflineId } from './ids';
import {
  OfflineProductRecord,
  OfflineScope,
  OfflineSyncStatus,
  SyncQueueRecord,
} from './types';

function assertScope(scope: OfflineScope): void {
  if (!scope.tenantId || !scope.vendorId || !scope.branchId || !scope.terminalId) {
    throw new Error('Offline repository access requires tenant, vendor, branch and terminal scope.');
  }
}

interface ProductRow extends Record<string, unknown> {
  local_id: string;
  remote_id: string | null;
  tenant_id: string;
  vendor_id: string;
  branch_id: string;
  terminal_id: string;
  sku: string;
  name: string;
  brand: string | null;
  manufacturer_code: string | null;
  barcode: string | null;
  unit_of_measure: string;
  sync_status: OfflineSyncStatus;
  created_at: string;
  updated_at: string;
}

function mapProduct(row: ProductRow): OfflineProductRecord {
  return {
    localId: row.local_id,
    remoteId: row.remote_id || undefined,
    tenantId: row.tenant_id,
    vendorId: row.vendor_id,
    branchId: row.branch_id,
    terminalId: row.terminal_id,
    sku: row.sku,
    name: row.name,
    brand: row.brand || undefined,
    manufacturerCode: row.manufacturer_code || undefined,
    barcode: row.barcode || undefined,
    unitOfMeasure: row.unit_of_measure,
    syncStatus: row.sync_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class OfflineProductRepository {
  constructor(
    private readonly database: OfflineDatabase,
    private readonly scope: OfflineScope,
  ) {
    assertScope(scope);
  }

  save(input: {
    localId?: string;
    remoteId?: string;
    sku: string;
    name: string;
    brand?: string;
    manufacturerCode?: string;
    barcode?: string;
    unitOfMeasure: string;
    syncStatus?: OfflineSyncStatus;
  }): OfflineProductRecord {
    const now = new Date().toISOString();
    const localId = input.localId || createOfflineId('product');
    this.database.run(`
      INSERT INTO products(
        local_id, remote_id, tenant_id, vendor_id, branch_id, terminal_id,
        sku, name, brand, manufacturer_code, barcode, unit_of_measure,
        sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(local_id) DO UPDATE SET
        remote_id = excluded.remote_id,
        sku = excluded.sku,
        name = excluded.name,
        brand = excluded.brand,
        manufacturer_code = excluded.manufacturer_code,
        barcode = excluded.barcode,
        unit_of_measure = excluded.unit_of_measure,
        sync_status = excluded.sync_status,
        updated_at = excluded.updated_at
      WHERE products.tenant_id = excluded.tenant_id
        AND products.vendor_id = excluded.vendor_id
        AND products.branch_id = excluded.branch_id
        AND products.terminal_id = excluded.terminal_id
    `, [
      localId, input.remoteId || null,
      this.scope.tenantId, this.scope.vendorId, this.scope.branchId, this.scope.terminalId,
      input.sku, input.name, input.brand || null, input.manufacturerCode || null,
      input.barcode || null, input.unitOfMeasure, input.syncStatus || 'PENDING', now, now,
    ]);
    const saved = this.findByLocalId(localId);
    if (!saved) throw new Error('Product was not saved inside the active offline scope.');
    return saved;
  }

  findByLocalId(localId: string): OfflineProductRecord | undefined {
    return this.database.rows<ProductRow>(`
      SELECT * FROM products
      WHERE local_id = ? AND tenant_id = ? AND vendor_id = ? AND branch_id = ? AND terminal_id = ?
    `, [
      localId, this.scope.tenantId, this.scope.vendorId,
      this.scope.branchId, this.scope.terminalId,
    ]).map(mapProduct)[0];
  }

  list(): OfflineProductRecord[] {
    return this.database.rows<ProductRow>(`
      SELECT * FROM products
      WHERE tenant_id = ? AND vendor_id = ? AND branch_id = ? AND terminal_id = ?
      ORDER BY name
    `, [
      this.scope.tenantId, this.scope.vendorId,
      this.scope.branchId, this.scope.terminalId,
    ]).map(mapProduct);
  }
}

interface QueueRow extends Record<string, unknown> {
  local_id: string;
  tenant_id: string;
  vendor_id: string;
  branch_id: string;
  terminal_id: string;
  entity_type: string;
  entity_local_id: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payload_json: string;
  idempotency_key: string;
  sync_status: OfflineSyncStatus;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function mapQueue(row: QueueRow): SyncQueueRecord {
  return {
    localId: row.local_id,
    tenantId: row.tenant_id,
    vendorId: row.vendor_id,
    branchId: row.branch_id,
    terminalId: row.terminal_id,
    entityType: row.entity_type,
    entityLocalId: row.entity_local_id,
    operation: row.operation,
    payloadJson: row.payload_json,
    idempotencyKey: row.idempotency_key,
    syncStatus: row.sync_status,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at || undefined,
    lastError: row.last_error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class OfflineSyncQueueRepository {
  constructor(
    private readonly database: OfflineDatabase,
    private readonly scope: OfflineScope,
  ) {
    assertScope(scope);
  }

  enqueue(input: {
    entityType: string;
    entityLocalId: string;
    operation: 'CREATE' | 'UPDATE' | 'DELETE';
    payload: unknown;
    idempotencyKey?: string;
  }): SyncQueueRecord {
    const now = new Date().toISOString();
    const localId = createOfflineId('sync');
    const idempotencyKey = input.idempotencyKey || createOfflineId('idem');
    this.database.run(`
      INSERT INTO sync_queue(
        local_id, tenant_id, vendor_id, branch_id, terminal_id,
        entity_type, entity_local_id, operation, payload_json, idempotency_key,
        sync_status, attempt_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)
    `, [
      localId, this.scope.tenantId, this.scope.vendorId,
      this.scope.branchId, this.scope.terminalId,
      input.entityType, input.entityLocalId, input.operation,
      JSON.stringify(input.payload), idempotencyKey, now, now,
    ]);
    return this.list(['PENDING']).find(item => item.localId === localId)!;
  }

  list(statuses: OfflineSyncStatus[]): SyncQueueRecord[] {
    if (statuses.length === 0) return [];
    const placeholders = statuses.map(() => '?').join(', ');
    return this.database.rows<QueueRow>(`
      SELECT * FROM sync_queue
      WHERE tenant_id = ? AND vendor_id = ? AND branch_id = ? AND terminal_id = ?
        AND sync_status IN (${placeholders})
      ORDER BY created_at
    `, [
      this.scope.tenantId, this.scope.vendorId,
      this.scope.branchId, this.scope.terminalId,
      ...statuses,
    ]).map(mapQueue);
  }

  mark(localId: string, status: OfflineSyncStatus, error?: string): void {
    const now = new Date().toISOString();
    this.database.run(`
      UPDATE sync_queue
      SET sync_status = ?, last_error = ?, updated_at = ?,
          attempt_count = CASE WHEN ? IN ('FAILED','CONFLICT','REQUIRES_REVIEW')
            THEN attempt_count + 1 ELSE attempt_count END
      WHERE local_id = ? AND tenant_id = ? AND vendor_id = ? AND branch_id = ? AND terminal_id = ?
    `, [
      status, error || null, now, status, localId,
      this.scope.tenantId, this.scope.vendorId, this.scope.branchId, this.scope.terminalId,
    ]);
  }
}

export class OfflineAuthorisedUserRepository {
  constructor(
    private readonly database: OfflineDatabase,
    private readonly scope: OfflineScope,
  ) {
    assertScope(scope);
  }

  saveVerifier(input: {
    remoteUserId: string;
    displayName: string;
    role: string;
    passwordHash: string;
    passwordHashAlgorithm: 'argon2id' | 'scrypt' | 'pbkdf2-sha256';
    authorisedUntil: string;
  }): string {
    const expectedPrefix: Record<typeof input.passwordHashAlgorithm, string> = {
      argon2id: '$argon2id$',
      scrypt: '$scrypt$',
      'pbkdf2-sha256': '$pbkdf2-sha256$',
    };
    if (
      input.passwordHash.length < 32 ||
      !input.passwordHash.startsWith(expectedPrefix[input.passwordHashAlgorithm])
    ) {
      throw new Error('Only a strong derived password verifier may be stored; plaintext passwords are forbidden.');
    }
    const localId = createOfflineId('user');
    const now = new Date().toISOString();
    this.database.run(`
      INSERT INTO authorised_offline_users(
        local_id, remote_user_id, tenant_id, vendor_id, branch_id, terminal_id,
        display_name, role, password_hash, password_hash_algorithm,
        authorised_until, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
    `, [
      localId, input.remoteUserId,
      this.scope.tenantId, this.scope.vendorId, this.scope.branchId, this.scope.terminalId,
      input.displayName, input.role, input.passwordHash,
      input.passwordHashAlgorithm, input.authorisedUntil, now, now,
    ]);
    return localId;
  }
}

export class OfflineSyncResultRepository {
  constructor(
    private readonly database: OfflineDatabase,
    private readonly scope: OfflineScope,
  ) {
    assertScope(scope);
  }

  acknowledge(
    queue: SyncQueueRecord,
    result: { remoteId?: string; remoteVersion?: string },
  ): string {
    const localId = createOfflineId('ack');
    const now = new Date().toISOString();
    this.database.run(`
      INSERT INTO sync_acknowledgements(
        local_id, queue_local_id, tenant_id, vendor_id, branch_id, terminal_id,
        remote_id, remote_version, acknowledged_at, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
    `, [
      localId, queue.localId,
      this.scope.tenantId, this.scope.vendorId, this.scope.branchId, this.scope.terminalId,
      result.remoteId || null, result.remoteVersion || null, now, now, now,
    ]);
    return localId;
  }

  recordConflict(
    queue: SyncQueueRecord,
    remotePayload: unknown,
    requiresReview: boolean,
  ): string {
    const localId = createOfflineId('conflict');
    const now = new Date().toISOString();
    const status = requiresReview ? 'REQUIRES_REVIEW' : 'CONFLICT';
    this.database.run(`
      INSERT INTO conflict_records(
        local_id, queue_local_id, tenant_id, vendor_id, branch_id, terminal_id,
        entity_type, entity_local_id, local_payload_json, remote_payload_json,
        resolution_status, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      localId, queue.localId,
      this.scope.tenantId, this.scope.vendorId, this.scope.branchId, this.scope.terminalId,
      queue.entityType, queue.entityLocalId, queue.payloadJson,
      JSON.stringify(remotePayload), status, status, now, now,
    ]);
    return localId;
  }
}

export class OfflineSaleDraftRepository {
  constructor(
    private readonly database: OfflineDatabase,
    private readonly scope: OfflineScope,
  ) {
    assertScope(scope);
  }

  createDraft(input: {
    deviceId: string;
    cashierId: string;
    shiftId: string;
    localOrderNumber: string;
    currency: string;
    subtotalMinor: number;
    taxTotalMinor: number;
    totalMinor: number;
  }): string {
    const localId = createOfflineId('sale');
    const transactionId = createOfflineId('draft_txn');
    const idempotencyKey = createOfflineId('draft_idem');
    const now = new Date().toISOString();
    this.database.run(`
      INSERT INTO sales(
        local_id, transaction_id, idempotency_key,
        tenant_id, vendor_id, branch_id, terminal_id, stock_location_id,
        device_id, cashier_id, shift_local_id,
        local_order_number, status, currency, subtotal_minor,
        tax_total_minor, total_minor, occurred_at, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, 'DRAFT', ?, ?, ?, ?, ?, 'REQUIRES_REVIEW', ?, ?)
    `, [
      localId, transactionId, idempotencyKey,
      this.scope.tenantId, this.scope.vendorId,
      this.scope.branchId, this.scope.terminalId, this.scope.branchId,
      input.deviceId, input.cashierId, input.shiftId,
      input.localOrderNumber, input.currency, input.subtotalMinor,
      input.taxTotalMinor, input.totalMinor, now, now, now,
    ]);
    return localId;
  }

  complete(): never {
    throw new Error('Completed offline sales must use the approved atomic offline checkout engine.');
  }
}
