import type { Database } from 'sql.js';

const SYNC_STATUS_CHECK =
  "CHECK (sync_status IN ('PENDING','SYNCING','SYNCED','FAILED','CONFLICT','REQUIRES_REVIEW'))";

export interface OfflineMigration {
  version: number;
  name: string;
  sql: string;
  disableForeignKeys?: boolean;
}

export const OFFLINE_MIGRATIONS: OfflineMigration[] = [
  {
    version: 1,
    name: 'terminal_identity_and_catalog',
    sql: `
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE terminal_configuration (
        local_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        terminal_code TEXT NOT NULL,
        configuration_json TEXT NOT NULL,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (tenant_id, vendor_id, branch_id, terminal_id)
      );

      CREATE TABLE authorised_offline_users (
        local_id TEXT PRIMARY KEY,
        remote_user_id TEXT,
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT,
        password_hash_algorithm TEXT,
        credential_version INTEGER NOT NULL DEFAULT 1,
        authorised_until TEXT NOT NULL,
        revoked_at TEXT,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (password_hash IS NULL OR length(password_hash) >= 32)
      );

      CREATE TABLE products (
        local_id TEXT PRIMARY KEY,
        remote_id TEXT,
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        brand TEXT,
        manufacturer_code TEXT,
        barcode TEXT,
        unit_of_measure TEXT NOT NULL,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (tenant_id, vendor_id, branch_id, sku)
      );

      CREATE TABLE prices (
        local_id TEXT PRIMARY KEY,
        product_local_id TEXT NOT NULL REFERENCES products(local_id),
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        currency TEXT NOT NULL,
        unit_price_minor INTEGER NOT NULL,
        valid_from TEXT NOT NULL,
        valid_to TEXT,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE taxes (
        local_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        tax_code TEXT NOT NULL,
        tax_name TEXT NOT NULL,
        rate_basis_points INTEGER NOT NULL,
        valid_from TEXT NOT NULL,
        valid_to TEXT,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (tenant_id, vendor_id, branch_id, tax_code, valid_from)
      );

      CREATE TABLE branch_stock_balances (
        local_id TEXT PRIMARY KEY,
        product_local_id TEXT NOT NULL REFERENCES products(local_id),
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        authoritative_at TEXT NOT NULL,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (tenant_id, vendor_id, branch_id, product_local_id)
      );

      CREATE TABLE customers (
        local_id TEXT PRIMARY KEY,
        remote_id TEXT,
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        customer_number TEXT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'transaction_history_and_sync',
    sql: `
      CREATE TABLE shifts (
        local_id TEXT PRIMARY KEY,
        remote_id TEXT,
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        staff_local_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED','ABANDONED')),
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sales (
        local_id TEXT PRIMARY KEY,
        remote_id TEXT,
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        shift_local_id TEXT REFERENCES shifts(local_id),
        customer_local_id TEXT REFERENCES customers(local_id),
        local_order_number TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('DRAFT','ABANDONED')),
        currency TEXT NOT NULL,
        subtotal_minor INTEGER NOT NULL,
        tax_total_minor INTEGER NOT NULL,
        total_minor INTEGER NOT NULL,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (tenant_id, vendor_id, branch_id, terminal_id, local_order_number)
      );

      CREATE TABLE sale_items (
        local_id TEXT PRIMARY KEY,
        sale_local_id TEXT NOT NULL REFERENCES sales(local_id),
        product_local_id TEXT NOT NULL REFERENCES products(local_id),
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        sku_snapshot TEXT NOT NULL,
        product_name_snapshot TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price_minor_snapshot INTEGER NOT NULL,
        tax_code_snapshot TEXT NOT NULL,
        tax_rate_basis_points_snapshot INTEGER NOT NULL,
        tax_amount_minor INTEGER NOT NULL,
        line_total_minor INTEGER NOT NULL,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE payments (
        local_id TEXT PRIMARY KEY,
        sale_local_id TEXT NOT NULL REFERENCES sales(local_id),
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        provider_reference TEXT,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE receipts (
        local_id TEXT PRIMARY KEY,
        sale_local_id TEXT NOT NULL REFERENCES sales(local_id),
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        receipt_number TEXT NOT NULL,
        receipt_snapshot_json TEXT NOT NULL,
        issued_at TEXT,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE inventory_movements (
        local_id TEXT PRIMARY KEY,
        remote_id TEXT,
        product_local_id TEXT NOT NULL REFERENCES products(local_id),
        sale_local_id TEXT REFERENCES sales(local_id),
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        movement_type TEXT NOT NULL,
        quantity_before REAL NOT NULL,
        quantity_delta REAL NOT NULL,
        quantity_after REAL NOT NULL,
        source_document_reference TEXT NOT NULL,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE audit_events (
        local_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        actor_local_id TEXT,
        event_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_local_id TEXT,
        payload_json TEXT NOT NULL,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE bi_events (
        local_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        risk_score INTEGER NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE fiscalisation_status (
        local_id TEXT PRIMARY KEY,
        sale_local_id TEXT NOT NULL REFERENCES sales(local_id),
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        fiscal_status TEXT NOT NULL,
        fiscal_reference TEXT,
        last_attempt_at TEXT,
        error_message TEXT,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sync_queue (
        local_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_local_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
        payload_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (tenant_id, vendor_id, idempotency_key)
      );

      CREATE TABLE sync_acknowledgements (
        local_id TEXT PRIMARY KEY,
        queue_local_id TEXT NOT NULL REFERENCES sync_queue(local_id),
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        remote_id TEXT,
        remote_version TEXT,
        acknowledged_at TEXT NOT NULL,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE conflict_records (
        local_id TEXT PRIMARY KEY,
        queue_local_id TEXT REFERENCES sync_queue(local_id),
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_local_id TEXT NOT NULL,
        local_payload_json TEXT NOT NULL,
        remote_payload_json TEXT NOT NULL,
        resolution_status TEXT NOT NULL CHECK (resolution_status IN ('CONFLICT','REQUIRES_REVIEW','RESOLVED')),
        resolution_json TEXT,
        resolved_by TEXT,
        resolved_at TEXT,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TRIGGER immutable_sale_item_snapshots
      BEFORE UPDATE OF unit_price_minor_snapshot, tax_code_snapshot, tax_rate_basis_points_snapshot
      ON sale_items
      BEGIN
        SELECT RAISE(ABORT, 'Historical price and tax snapshots are immutable');
      END;

      CREATE INDEX idx_products_scope ON products(tenant_id, vendor_id, branch_id, terminal_id);
      CREATE INDEX idx_stock_scope ON branch_stock_balances(tenant_id, vendor_id, branch_id, product_local_id);
      CREATE INDEX idx_sync_queue_status ON sync_queue(tenant_id, vendor_id, sync_status, next_attempt_at);
      CREATE INDEX idx_inventory_movements_product ON inventory_movements(tenant_id, vendor_id, branch_id, product_local_id, created_at);
    `,
  },
  {
    version: 3,
    name: 'controlled_offline_checkout',
    disableForeignKeys: true,
    sql: `
      PRAGMA legacy_alter_table = ON;
      ALTER TABLE sales RENAME TO sales_foundation_v2;
      CREATE TABLE sales (
        local_id TEXT PRIMARY KEY,
        remote_id TEXT,
        transaction_id TEXT NOT NULL UNIQUE,
        idempotency_key TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        stock_location_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        cashier_id TEXT NOT NULL,
        shift_local_id TEXT NOT NULL REFERENCES shifts(local_id),
        customer_local_id TEXT REFERENCES customers(local_id),
        local_order_number TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN (
          'DRAFT','COMPLETED_PENDING_SYNC','SYNC_PROCESSING','SYNC_FAILED',
          'SYNCED','ABANDONED','VOID_PENDING_SYNC'
        )),
        currency TEXT NOT NULL,
        subtotal_minor INTEGER NOT NULL,
        tax_total_minor INTEGER NOT NULL,
        total_minor INTEGER NOT NULL,
        occurred_at TEXT NOT NULL,
        synced_at TEXT,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (stock_location_id = branch_id),
        UNIQUE (tenant_id, vendor_id, branch_id, terminal_id, local_order_number),
        UNIQUE (tenant_id, vendor_id, idempotency_key)
      );
      INSERT INTO sales(
        local_id, remote_id, transaction_id, idempotency_key,
        tenant_id, vendor_id, branch_id, terminal_id, stock_location_id,
        device_id, cashier_id, shift_local_id, customer_local_id,
        local_order_number, status, currency, subtotal_minor, tax_total_minor,
        total_minor, occurred_at, synced_at, sync_status, created_at, updated_at
      )
      SELECT
        local_id, remote_id, local_id, local_id,
        tenant_id, vendor_id, branch_id, terminal_id, branch_id,
        'UNENROLLED', 'UNKNOWN', COALESCE(shift_local_id, ''), customer_local_id,
        local_order_number, status, currency, subtotal_minor, tax_total_minor,
        total_minor, created_at, NULL, sync_status, created_at, updated_at
      FROM sales_foundation_v2;
      DROP TABLE sales_foundation_v2;
      PRAGMA legacy_alter_table = OFF;

      ALTER TABLE terminal_configuration ADD COLUMN device_id TEXT;
      ALTER TABLE terminal_configuration ADD COLUMN terminal_status TEXT NOT NULL DEFAULT 'SUSPENDED';
      ALTER TABLE terminal_configuration ADD COLUMN branch_status TEXT NOT NULL DEFAULT 'SUSPENDED';
      ALTER TABLE terminal_configuration ADD COLUMN licence_status TEXT NOT NULL DEFAULT 'UNLICENSED';
      ALTER TABLE terminal_configuration ADD COLUMN branch_licence_status TEXT NOT NULL DEFAULT 'UNLICENSED';
      ALTER TABLE terminal_configuration ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'INACTIVE';
      ALTER TABLE terminal_configuration ADD COLUMN configuration_valid_until TEXT;
      ALTER TABLE terminal_configuration ADD COLUMN entitlement_valid_until TEXT;

      ALTER TABLE products ADD COLUMN tax_local_id TEXT;
      ALTER TABLE payments ADD COLUMN verification_mode TEXT NOT NULL DEFAULT 'UNVERIFIED_PENDING_CONFIRMATION';
      ALTER TABLE receipts ADD COLUMN offline_receipt_status TEXT NOT NULL DEFAULT 'PENDING_SYNC';
      ALTER TABLE receipts ADD COLUMN occurred_at TEXT;
      ALTER TABLE audit_events ADD COLUMN occurred_at TEXT;
      ALTER TABLE audit_events ADD COLUMN device_id TEXT;
      ALTER TABLE audit_events ADD COLUMN cashier_id TEXT;
      ALTER TABLE audit_events ADD COLUMN shift_local_id TEXT;
      ALTER TABLE bi_events ADD COLUMN occurred_at TEXT;
      ALTER TABLE bi_events ADD COLUMN device_id TEXT;
      ALTER TABLE bi_events ADD COLUMN cashier_id TEXT;
      ALTER TABLE bi_events ADD COLUMN shift_local_id TEXT;
      ALTER TABLE bi_events ADD COLUMN outcome TEXT;
      ALTER TABLE bi_events ADD COLUMN reason_code TEXT;
      ALTER TABLE bi_events ADD COLUMN offline_status TEXT;

      CREATE TABLE device_enrolments (
        local_id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        enrolment_status TEXT NOT NULL CHECK (enrolment_status IN (
          'UNENROLLED','PENDING','ACTIVE','REVOKED','SUSPENDED','EXPIRED',
          'KEY_UNAVAILABLE','KEY_INVALID'
        )),
        public_key_identity TEXT NOT NULL,
        wrapped_operational_key TEXT NOT NULL,
        key_version INTEGER NOT NULL,
        enrolled_at TEXT NOT NULL,
        valid_until TEXT,
        revoked_at TEXT,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (tenant_id, vendor_id, branch_id, terminal_id, device_id)
      );

      CREATE TABLE offline_outbox (
        local_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        aggregate_type TEXT NOT NULL CHECK (aggregate_type = 'SALE'),
        aggregate_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type = 'OFFLINE_SALE_COMPLETED'),
        event_version INTEGER NOT NULL,
        payload_ciphertext TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL CHECK (sync_status = 'PENDING'),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (tenant_id, vendor_id, aggregate_id, event_version)
      );

      CREATE TABLE sale_corrections (
        local_id TEXT PRIMARY KEY,
        original_sale_local_id TEXT NOT NULL REFERENCES sales(local_id),
        tenant_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        cashier_id TEXT NOT NULL,
        shift_local_id TEXT NOT NULL,
        correction_type TEXT NOT NULL CHECK (correction_type IN ('REFUND','REVERSAL','ADJUSTMENT')),
        reason TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        occurred_at TEXT NOT NULL,
        sync_status TEXT NOT NULL ${SYNC_STATUS_CHECK},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TRIGGER immutable_completed_offline_sales_update
      BEFORE UPDATE ON sales
      WHEN OLD.status IN ('COMPLETED_PENDING_SYNC','SYNC_PROCESSING','SYNC_FAILED','SYNCED','VOID_PENDING_SYNC')
        AND (
          NEW.transaction_id != OLD.transaction_id OR
          NEW.tenant_id != OLD.tenant_id OR
          NEW.vendor_id != OLD.vendor_id OR
          NEW.branch_id != OLD.branch_id OR
          NEW.terminal_id != OLD.terminal_id OR
          NEW.stock_location_id != OLD.stock_location_id OR
          NEW.cashier_id != OLD.cashier_id OR
          NEW.total_minor != OLD.total_minor OR
          NEW.occurred_at != OLD.occurred_at
        )
      BEGIN
        SELECT RAISE(ABORT, 'Completed offline sales are immutable; use a correction transaction');
      END;

      CREATE TRIGGER immutable_completed_offline_sales_delete
      BEFORE DELETE ON sales
      WHEN OLD.status IN ('COMPLETED_PENDING_SYNC','SYNC_PROCESSING','SYNC_FAILED','SYNCED','VOID_PENDING_SYNC')
      BEGIN
        SELECT RAISE(ABORT, 'Completed offline sales cannot be deleted');
      END;

      CREATE INDEX idx_device_enrolment_scope
        ON device_enrolments(tenant_id, vendor_id, branch_id, terminal_id, device_id, enrolment_status);
      CREATE INDEX idx_offline_sale_idempotency
        ON sales(tenant_id, vendor_id, branch_id, terminal_id, idempotency_key);
      CREATE INDEX idx_offline_outbox_pending
        ON offline_outbox(tenant_id, vendor_id, sync_status, occurred_at);
    `,
  },
];

export function getOfflineSchemaVersion(database: Database): number {
  const result = database.exec('PRAGMA user_version');
  return Number(result[0]?.values[0]?.[0] || 0);
}

export function applyOfflineMigrations(
  database: Database,
  now = new Date().toISOString(),
): number {
  const currentVersion = getOfflineSchemaVersion(database);
  const pending = OFFLINE_MIGRATIONS.filter(migration => migration.version > currentVersion)
    .sort((left, right) => left.version - right.version);
  for (const migration of pending) {
    if (migration.disableForeignKeys) database.exec('PRAGMA foreign_keys = OFF');
    database.run('BEGIN IMMEDIATE');
    try {
      database.exec(migration.sql);
      database.run(
        'INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)',
        [migration.version, migration.name, now],
      );
      database.exec(`PRAGMA user_version = ${migration.version}`);
      database.run('COMMIT');
    } catch (error) {
      database.run('ROLLBACK');
      if (migration.disableForeignKeys) database.exec('PRAGMA foreign_keys = ON');
      throw error;
    }
    if (migration.disableForeignKeys) database.exec('PRAGMA foreign_keys = ON');
  }
  return getOfflineSchemaVersion(database);
}
