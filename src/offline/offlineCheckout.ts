import { isControlledOfflineCheckoutEnabled } from './config';
import { OfflineDatabase } from './database';
import { OfflineDataProtector } from './encryption';
import { createOfflineId } from './ids';
import { OfflineScope } from './types';

export type OfflineOperationalState =
  | 'ONLINE'
  | 'OFFLINE'
  | 'SYNCING'
  | 'SYNC ERROR'
  | 'FISCALISATION PENDING'
  | 'CONFIGURATION OUTDATED'
  | 'TERMINAL SUSPENDED';

export type OfflinePaymentMethod = 'CASH' | 'APPROVED_LOCAL_CREDIT';
export type OfflinePaymentVerificationMode = 'LOCAL_CASH' | 'PREAUTHORISED';

export interface OfflineCheckoutInput extends OfflineScope {
  deviceId: string;
  cashierId: string;
  shiftId: string;
  stockLocationId: string;
  idempotencyKey: string;
  localOrderNumber: string;
  currency: string;
  occurredAt: string;
  items: { productLocalId: string; quantity: number }[];
  payments: {
    method: OfflinePaymentMethod;
    verificationMode: OfflinePaymentVerificationMode;
    amountMinor: number;
  }[];
}

export interface OfflineCheckoutResult {
  saleId: string;
  transactionId: string;
  receiptId: string;
  outboxId: string;
  status: 'COMPLETED_PENDING_SYNC';
  fiscalStatus: 'PENDING';
  receiptStatus: 'OFFLINE COMPLETED — PENDING SYNC';
  occurredAt: string;
  syncedAt?: string;
  duplicate: boolean;
  totalMinor: number;
}

type FailurePoint =
  | 'sale_header'
  | 'sale_item'
  | 'payment'
  | 'inventory'
  | 'receipt'
  | 'audit'
  | 'bi_event'
  | 'outbox';

export class OfflineCheckoutError extends Error {
  constructor(
    readonly code:
      | 'disabled'
      | 'database_corrupt'
      | 'configuration_outdated'
      | 'terminal_suspended'
      | 'device_not_enrolled'
      | 'encryption_unavailable'
      | 'cashier_unauthorised'
      | 'offline_access_expired'
      | 'shift_closed'
      | 'wrong_stock_location'
      | 'product_unavailable'
      | 'price_unavailable'
      | 'tax_unavailable'
      | 'insufficient_stock'
      | 'payment_invalid'
      | 'write_failed',
    message: string,
  ) {
    super(message);
    this.name = 'OfflineCheckoutError';
  }
}

interface ProductPricingRow extends Record<string, unknown> {
  product_local_id: string;
  sku: string;
  name: string;
  unit_of_measure: string;
  price_local_id: string;
  unit_price_minor: number;
  tax_local_id: string;
  tax_code: string;
  rate_basis_points: number;
}

interface PreparedLine extends ProductPricingRow {
  quantity: number;
  subtotalMinor: number;
  taxAmountMinor: number;
  lineTotalMinor: number;
}

interface ExistingSaleRow extends Record<string, unknown> {
  local_id: string;
  transaction_id: string;
  total_minor: number;
  occurred_at: string;
}

interface OfflineCheckoutOptions {
  enabled?: boolean;
  protector?: OfflineDataProtector;
  now?: () => Date;
  injectFailure?: (point: FailurePoint) => void;
}

function assertScope(input: OfflineCheckoutInput): void {
  if (
    !input.tenantId || !input.vendorId || !input.branchId || !input.terminalId ||
    !input.deviceId || !input.cashierId || !input.shiftId
  ) {
    throw new OfflineCheckoutError('configuration_outdated', 'Offline checkout context is incomplete.');
  }
  if (input.stockLocationId !== input.branchId) {
    throw new OfflineCheckoutError(
      'wrong_stock_location',
      'Offline sales may deduct stock only from the selling branch.',
    );
  }
}

export class ControlledOfflineCheckoutEngine {
  private readonly enabled: boolean;
  private readonly protector?: OfflineDataProtector;
  private readonly now: () => Date;
  private readonly injectFailure?: (point: FailurePoint) => void;

  constructor(
    private readonly database: OfflineDatabase,
    options: OfflineCheckoutOptions = {},
  ) {
    this.enabled = options.enabled ?? isControlledOfflineCheckoutEnabled();
    this.protector = options.protector;
    this.now = options.now || (() => new Date());
    this.injectFailure = options.injectFailure;
  }

  private failAt(point: FailurePoint): void {
    this.injectFailure?.(point);
  }

  private existing(input: OfflineCheckoutInput): OfflineCheckoutResult | undefined {
    const sale = this.database.rows<ExistingSaleRow>(`
      SELECT local_id, transaction_id, total_minor, occurred_at
      FROM sales
      WHERE tenant_id = ? AND vendor_id = ? AND branch_id = ? AND terminal_id = ?
        AND idempotency_key = ? AND status = 'COMPLETED_PENDING_SYNC'
    `, [
      input.tenantId, input.vendorId, input.branchId, input.terminalId, input.idempotencyKey,
    ])[0];
    if (!sale) return undefined;
    const receipt = this.database.rows<{ local_id: string } & Record<string, unknown>>(
      'SELECT local_id FROM receipts WHERE sale_local_id = ?',
      [sale.local_id],
    )[0];
    const outbox = this.database.rows<{ local_id: string } & Record<string, unknown>>(
      'SELECT local_id FROM offline_outbox WHERE aggregate_id = ?',
      [sale.local_id],
    )[0];
    return {
      saleId: sale.local_id,
      transactionId: sale.transaction_id,
      receiptId: receipt?.local_id || '',
      outboxId: outbox?.local_id || '',
      status: 'COMPLETED_PENDING_SYNC',
      fiscalStatus: 'PENDING',
      receiptStatus: 'OFFLINE COMPLETED — PENDING SYNC',
      occurredAt: sale.occurred_at,
      duplicate: true,
      totalMinor: sale.total_minor,
    };
  }

  private prepareLines(input: OfflineCheckoutInput): PreparedLine[] {
    if (input.items.length === 0) {
      throw new OfflineCheckoutError('product_unavailable', 'An offline sale requires at least one item.');
    }
    return input.items.map(item => {
      if (item.quantity <= 0) {
        throw new OfflineCheckoutError('product_unavailable', 'Offline sale quantities must be positive.');
      }
      const row = this.database.rows<ProductPricingRow>(`
        SELECT
          p.local_id AS product_local_id, p.sku, p.name, p.unit_of_measure,
          pr.local_id AS price_local_id, pr.unit_price_minor,
          t.local_id AS tax_local_id, t.tax_code, t.rate_basis_points
        FROM products p
        JOIN prices pr ON pr.product_local_id = p.local_id
          AND pr.tenant_id = p.tenant_id AND pr.vendor_id = p.vendor_id
          AND pr.branch_id = p.branch_id
        JOIN taxes t ON t.local_id = p.tax_local_id
          AND t.tenant_id = p.tenant_id AND t.vendor_id = p.vendor_id
          AND t.branch_id = p.branch_id
        WHERE p.local_id = ?
          AND p.tenant_id = ? AND p.vendor_id = ? AND p.branch_id = ? AND p.terminal_id = ?
          AND pr.currency = ?
          AND pr.valid_from <= ? AND (pr.valid_to IS NULL OR pr.valid_to > ?)
          AND t.valid_from <= ? AND (t.valid_to IS NULL OR t.valid_to > ?)
        ORDER BY pr.valid_from DESC, t.valid_from DESC
        LIMIT 1
      `, [
        item.productLocalId,
        input.tenantId, input.vendorId, input.branchId, input.terminalId,
        input.currency,
        input.occurredAt, input.occurredAt,
        input.occurredAt, input.occurredAt,
      ])[0];
      if (!row) {
        throw new OfflineCheckoutError(
          'price_unavailable',
          'A current branch-scoped price and tax snapshot is required.',
        );
      }
      const subtotalMinor = Math.round(row.unit_price_minor * item.quantity);
      const taxAmountMinor = Math.round(subtotalMinor * row.rate_basis_points / 10_000);
      return {
        ...row,
        quantity: item.quantity,
        subtotalMinor,
        taxAmountMinor,
        lineTotalMinor: subtotalMinor + taxAmountMinor,
      };
    });
  }

  private safelyRecordFailure(input: OfflineCheckoutInput, error: OfflineCheckoutError): void {
    try {
      const now = this.now().toISOString();
      const eventType = error.code === 'encryption_unavailable'
        ? 'OFFLINE_ENCRYPTION_FAILURE'
        : error.code === 'write_failed'
          ? 'OFFLINE_SALE_FAILED'
          : 'OFFLINE_SALE_BLOCKED';
      this.database.run(`
        INSERT INTO bi_events(
          local_id, tenant_id, vendor_id, branch_id, terminal_id,
          event_type, payload_json, risk_score, sync_status, created_at, updated_at,
          occurred_at, device_id, cashier_id, shift_local_id, outcome, reason_code, offline_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 80, 'PENDING', ?, ?, ?, ?, ?, ?, 'BLOCKED', ?, 'OFFLINE')
      `, [
        createOfflineId('bi'), input.tenantId, input.vendorId, input.branchId, input.terminalId,
        eventType, JSON.stringify({ reasonCode: error.code }), now, now, input.occurredAt,
        input.deviceId, input.cashierId, input.shiftId, error.code,
      ]);
    } catch {
      // The sale failure remains authoritative; diagnostic logging must never expose secrets.
    }
  }

  async complete(input: OfflineCheckoutInput): Promise<OfflineCheckoutResult> {
    assertScope(input);
    if (!this.enabled) {
      const error = new OfflineCheckoutError('disabled', 'Controlled offline checkout is disabled for this deployment.');
      this.safelyRecordFailure(input, error);
      throw error;
    }
    if (!this.protector) {
      const error = new OfflineCheckoutError('encryption_unavailable', 'Device-bound encryption is unavailable.');
      this.safelyRecordFailure(input, error);
      throw error;
    }
    const integrity = this.database.rows<Record<string, unknown>>('PRAGMA integrity_check')[0];
    if (!integrity || Object.values(integrity)[0] !== 'ok') {
      throw new OfflineCheckoutError('database_corrupt', 'The offline database failed its integrity check.');
    }
    const duplicate = this.existing(input);
    if (duplicate) {
      const event = new OfflineCheckoutError('write_failed', 'Duplicate offline sale attempt returned the existing sale.');
      try {
        const duplicateId = createOfflineId('bi');
        const duplicateAt = this.now().toISOString();
        this.database.run(`
          INSERT INTO bi_events(
            local_id, tenant_id, vendor_id, branch_id, terminal_id,
            event_type, payload_json, risk_score, sync_status, created_at, updated_at,
            occurred_at, device_id, cashier_id, shift_local_id, outcome, reason_code, offline_status
          ) VALUES (?, ?, ?, ?, ?, 'OFFLINE_DUPLICATE_SALE_BLOCKED', ?, 70, 'PENDING', ?, ?, ?, ?, ?, ?, 'DUPLICATE_RETURNED', 'duplicate_attempt', 'OFFLINE')
        `, [
          duplicateId, input.tenantId, input.vendorId, input.branchId, input.terminalId,
          JSON.stringify({ saleId: duplicate.saleId }), duplicateAt, duplicateAt,
          input.occurredAt, input.deviceId, input.cashierId, input.shiftId,
        ]);
      } catch {
        this.safelyRecordFailure(input, event);
      }
      return duplicate;
    }

    let preparedLines: PreparedLine[];
    try {
      preparedLines = this.prepareLines(input);
    } catch (error) {
      const checkoutError = error instanceof OfflineCheckoutError
        ? error
        : new OfflineCheckoutError('write_failed', 'Offline sale preparation failed.');
      this.safelyRecordFailure(input, checkoutError);
      throw checkoutError;
    }
    const subtotalMinor = preparedLines.reduce((sum, line) => sum + line.subtotalMinor, 0);
    const taxTotalMinor = preparedLines.reduce((sum, line) => sum + line.taxAmountMinor, 0);
    const totalMinor = subtotalMinor + taxTotalMinor;
    const paymentTotal = input.payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
    if (
      input.payments.length === 0 ||
      paymentTotal !== totalMinor ||
      input.payments.some(payment =>
        (payment.method === 'CASH' && payment.verificationMode !== 'LOCAL_CASH') ||
        (payment.method === 'APPROVED_LOCAL_CREDIT' && payment.verificationMode !== 'PREAUTHORISED')
      )
    ) {
      const error = new OfflineCheckoutError('payment_invalid', 'Approved offline payments must exactly balance the sale.');
      this.safelyRecordFailure(input, error);
      throw error;
    }

    const saleId = createOfflineId('sale');
    const transactionId = createOfflineId('txn');
    const receiptId = createOfflineId('receipt');
    const outboxId = createOfflineId('outbox');
    const saleItemIds = preparedLines.map(() => createOfflineId('sale_item'));
    const paymentIds = input.payments.map(() => createOfflineId('payment'));
    const movementIds = preparedLines.map(() => createOfflineId('movement'));
    const biEventTypes = [
      'OFFLINE_CHECKOUT_STARTED',
      'OFFLINE_STOCK_DEDUCTED',
      'OFFLINE_PAYMENT_RECORDED',
      'OFFLINE_RECEIPT_GENERATED',
      'OFFLINE_OUTBOX_CREATED',
      'OFFLINE_SALE_COMPLETED',
    ];
    const biEventIds = biEventTypes.map(() => createOfflineId('bi'));
    const now = this.now().toISOString();
    const outboxPlaintext = JSON.stringify({
      saleId,
      transactionId,
      tenantId: input.tenantId,
      vendorId: input.vendorId,
      branchId: input.branchId,
      terminalId: input.terminalId,
      deviceId: input.deviceId,
      cashierId: input.cashierId,
      shiftId: input.shiftId,
      occurredAt: input.occurredAt,
      totalMinor,
      currency: input.currency,
      items: preparedLines.map(line => ({
        productLocalId: line.product_local_id,
        quantity: line.quantity,
        unitPriceMinorSnapshot: line.unit_price_minor,
        taxRateBasisPointsSnapshot: line.rate_basis_points,
      })),
    });
    const payloadCiphertext = await this.protector.encryptJson(JSON.parse(outboxPlaintext));
    const payloadHash = await this.protector.hash(payloadCiphertext);

    try {
      return this.database.transaction(() => {
        const existing = this.existing(input);
        if (existing) return existing;
        const terminal = this.database.rows<Record<string, unknown>>(`
          SELECT * FROM terminal_configuration
          WHERE tenant_id = ? AND vendor_id = ? AND branch_id = ? AND terminal_id = ?
            AND device_id = ?
        `, [input.tenantId, input.vendorId, input.branchId, input.terminalId, input.deviceId])[0];
        if (!terminal) {
          throw new OfflineCheckoutError('configuration_outdated', 'Registered terminal configuration was not found.');
        }
        if (terminal.terminal_status !== 'ACTIVE' || terminal.branch_status !== 'ACTIVE') {
          throw new OfflineCheckoutError('terminal_suspended', 'The branch or terminal is suspended.');
        }
        if (
          terminal.licence_status !== 'LICENSED' ||
          terminal.branch_licence_status !== 'LICENSED' ||
          terminal.subscription_status !== 'ACTIVE' ||
          !terminal.configuration_valid_until ||
          String(terminal.configuration_valid_until) < now ||
          !terminal.entitlement_valid_until ||
          String(terminal.entitlement_valid_until) < now
        ) {
          throw new OfflineCheckoutError('configuration_outdated', 'Offline configuration or entitlement is outdated.');
        }
        const device = this.database.rows<Record<string, unknown>>(`
          SELECT * FROM device_enrolments
          WHERE tenant_id = ? AND vendor_id = ? AND branch_id = ? AND terminal_id = ?
            AND device_id = ?
        `, [input.tenantId, input.vendorId, input.branchId, input.terminalId, input.deviceId])[0];
        if (
          !device ||
          device.enrolment_status !== 'ACTIVE' ||
          Number(device.key_version) !== this.protector!.envelope.keyVersion ||
          device.wrapped_operational_key !== this.protector!.envelope.wrappedOperationalKey ||
          (device.valid_until && String(device.valid_until) < now)
        ) {
          throw new OfflineCheckoutError('device_not_enrolled', 'The device is not actively enrolled for this terminal.');
        }
        const cashier = this.database.rows<Record<string, unknown>>(`
          SELECT * FROM authorised_offline_users
          WHERE local_id = ? AND tenant_id = ? AND vendor_id = ? AND branch_id = ? AND terminal_id = ?
        `, [input.cashierId, input.tenantId, input.vendorId, input.branchId, input.terminalId])[0];
        if (!cashier || cashier.revoked_at) {
          throw new OfflineCheckoutError('cashier_unauthorised', 'The cashier is not authorised for offline access.');
        }
        if (String(cashier.authorised_until) < now) {
          throw new OfflineCheckoutError('offline_access_expired', 'The cashier offline-login authorization has expired.');
        }
        const shift = this.database.rows<Record<string, unknown>>(`
          SELECT * FROM shifts
          WHERE local_id = ? AND tenant_id = ? AND vendor_id = ? AND branch_id = ? AND terminal_id = ?
            AND staff_local_id = ? AND status = 'OPEN'
        `, [
          input.shiftId, input.tenantId, input.vendorId, input.branchId,
          input.terminalId, input.cashierId,
        ])[0];
        if (!shift) {
          throw new OfflineCheckoutError('shift_closed', 'A valid open terminal shift is required.');
        }

        const revalidated = this.prepareLines(input);
        revalidated.forEach((line, index) => {
          if (
            line.price_local_id !== preparedLines[index].price_local_id ||
            line.tax_local_id !== preparedLines[index].tax_local_id ||
            line.unit_price_minor !== preparedLines[index].unit_price_minor ||
            line.rate_basis_points !== preparedLines[index].rate_basis_points
          ) {
            throw new OfflineCheckoutError('price_unavailable', 'Price or tax configuration changed during checkout.');
          }
        });

        this.database.run(`
          INSERT INTO sales(
            local_id, transaction_id, idempotency_key,
            tenant_id, vendor_id, branch_id, terminal_id, stock_location_id,
            device_id, cashier_id, shift_local_id, local_order_number, status,
            currency, subtotal_minor, tax_total_minor, total_minor,
            occurred_at, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED_PENDING_SYNC',
            ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `, [
          saleId, transactionId, input.idempotencyKey,
          input.tenantId, input.vendorId, input.branchId, input.terminalId,
          input.stockLocationId, input.deviceId, input.cashierId, input.shiftId,
          input.localOrderNumber, input.currency, subtotalMinor, taxTotalMinor,
          totalMinor, input.occurredAt, now, now,
        ]);
        this.failAt('sale_header');

        preparedLines.forEach((line, index) => {
          this.database.run(`
            INSERT INTO sale_items(
              local_id, sale_local_id, product_local_id,
              tenant_id, vendor_id, branch_id, terminal_id,
              sku_snapshot, product_name_snapshot, quantity,
              unit_price_minor_snapshot, tax_code_snapshot,
              tax_rate_basis_points_snapshot, tax_amount_minor, line_total_minor,
              sync_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
          `, [
            saleItemIds[index], saleId, line.product_local_id,
            input.tenantId, input.vendorId, input.branchId, input.terminalId,
            line.sku, line.name, line.quantity, line.unit_price_minor,
            line.tax_code, line.rate_basis_points, line.taxAmountMinor,
            line.lineTotalMinor, now, now,
          ]);
          this.failAt('sale_item');
        });

        input.payments.forEach((payment, index) => {
          this.database.run(`
            INSERT INTO payments(
              local_id, sale_local_id, tenant_id, vendor_id, branch_id, terminal_id,
              payment_method, amount_minor, currency, verification_mode,
              sync_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
          `, [
            paymentIds[index], saleId,
            input.tenantId, input.vendorId, input.branchId, input.terminalId,
            payment.method, payment.amountMinor, input.currency,
            payment.verificationMode, now, now,
          ]);
          this.failAt('payment');
        });

        preparedLines.forEach((line, index) => {
          const stock = this.database.rows<Record<string, unknown>>(`
            SELECT local_id, quantity FROM branch_stock_balances
            WHERE product_local_id = ?
              AND tenant_id = ? AND vendor_id = ? AND branch_id = ? AND terminal_id = ?
          `, [
            line.product_local_id, input.tenantId, input.vendorId,
            input.branchId, input.terminalId,
          ])[0];
          if (!stock || !Number.isFinite(Number(stock.quantity))) {
            throw new OfflineCheckoutError('insufficient_stock', 'Branch stock is unresolved or corrupted.');
          }
          const before = Number(stock.quantity);
          this.database.run(`
            UPDATE branch_stock_balances
            SET quantity = quantity - ?, sync_status = 'PENDING', updated_at = ?
            WHERE local_id = ? AND tenant_id = ? AND vendor_id = ? AND branch_id = ? AND terminal_id = ?
              AND quantity >= ?
          `, [
            line.quantity, now, String(stock.local_id),
            input.tenantId, input.vendorId, input.branchId, input.terminalId,
            line.quantity,
          ]);
          if (this.database.getRowsModified() !== 1) {
            throw new OfflineCheckoutError('insufficient_stock', `Insufficient branch stock for ${line.name}.`);
          }
          this.database.run(`
            INSERT INTO inventory_movements(
              local_id, product_local_id, sale_local_id,
              tenant_id, vendor_id, branch_id, terminal_id,
              movement_type, quantity_before, quantity_delta, quantity_after,
              source_document_reference, sync_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OFFLINE_SALE', ?, ?, ?, ?, 'PENDING', ?, ?)
          `, [
            movementIds[index], line.product_local_id, saleId,
            input.tenantId, input.vendorId, input.branchId, input.terminalId,
            before, -line.quantity, before - line.quantity,
            transactionId, input.occurredAt, now,
          ]);
          this.failAt('inventory');
        });

        const receiptSnapshot = JSON.stringify({
          receiptId,
          transactionId,
          localOrderNumber: input.localOrderNumber,
          occurredAt: input.occurredAt,
          totalMinor,
          currency: input.currency,
          status: 'OFFLINE COMPLETED — PENDING SYNC',
          fiscalStatus: 'PENDING',
        });
        this.database.run(`
          INSERT INTO receipts(
            local_id, sale_local_id, tenant_id, vendor_id, branch_id, terminal_id,
            receipt_number, receipt_snapshot_json, issued_at, offline_receipt_status,
            occurred_at, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_SYNC', ?, 'PENDING', ?, ?)
        `, [
          receiptId, saleId,
          input.tenantId, input.vendorId, input.branchId, input.terminalId,
          input.localOrderNumber, receiptSnapshot, input.occurredAt,
          input.occurredAt, now, now,
        ]);
        this.failAt('receipt');

        this.database.run(`
          INSERT INTO audit_events(
            local_id, tenant_id, vendor_id, branch_id, terminal_id,
            actor_local_id, event_type, entity_type, entity_local_id,
            payload_json, sync_status, created_at, updated_at,
            occurred_at, device_id, cashier_id, shift_local_id
          ) VALUES (?, ?, ?, ?, ?, ?, 'OFFLINE_SALE_COMPLETED', 'SALE', ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)
        `, [
          createOfflineId('audit'),
          input.tenantId, input.vendorId, input.branchId, input.terminalId,
          input.cashierId, saleId,
          JSON.stringify({ transactionId, totalMinor }),
          now, now, input.occurredAt, input.deviceId, input.cashierId, input.shiftId,
        ]);
        this.failAt('audit');

        biEventTypes.forEach((eventType, index) => {
          this.database.run(`
            INSERT INTO bi_events(
              local_id, tenant_id, vendor_id, branch_id, terminal_id,
              event_type, payload_json, risk_score, sync_status, created_at, updated_at,
              occurred_at, device_id, cashier_id, shift_local_id, outcome, reason_code, offline_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 20, 'PENDING', ?, ?, ?, ?, ?, ?, 'SUCCESS', NULL, 'OFFLINE')
          `, [
            biEventIds[index],
            input.tenantId, input.vendorId, input.branchId, input.terminalId,
            eventType, JSON.stringify({ saleId, transactionId }),
            now, now, input.occurredAt, input.deviceId, input.cashierId, input.shiftId,
          ]);
          this.failAt('bi_event');
        });

        this.database.run(`
          INSERT INTO fiscalisation_status(
            local_id, sale_local_id, tenant_id, vendor_id, branch_id, terminal_id,
            fiscal_status, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, ?)
        `, [
          createOfflineId('fiscal'), saleId,
          input.tenantId, input.vendorId, input.branchId, input.terminalId, now, now,
        ]);
        this.database.run(`
          INSERT INTO offline_outbox(
            local_id, tenant_id, vendor_id, branch_id, terminal_id,
            aggregate_type, aggregate_id, event_type, event_version,
            payload_ciphertext, payload_hash, occurred_at,
            attempt_count, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'SALE', ?, 'OFFLINE_SALE_COMPLETED', 1, ?, ?, ?, 0, 'PENDING', ?, ?)
        `, [
          outboxId, input.tenantId, input.vendorId, input.branchId, input.terminalId,
          saleId, payloadCiphertext, payloadHash, input.occurredAt, now, now,
        ]);
        this.database.run(`
          INSERT INTO sync_queue(
            local_id, tenant_id, vendor_id, branch_id, terminal_id,
            entity_type, entity_local_id, operation, payload_json, idempotency_key,
            sync_status, attempt_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'OFFLINE_OUTBOX', ?, 'CREATE', ?, ?, 'PENDING', 0, ?, ?)
        `, [
          createOfflineId('sync'),
          input.tenantId, input.vendorId, input.branchId, input.terminalId,
          outboxId, JSON.stringify({ outboxId }), input.idempotencyKey, now, now,
        ]);
        this.failAt('outbox');

        return {
          saleId,
          transactionId,
          receiptId,
          outboxId,
          status: 'COMPLETED_PENDING_SYNC',
          fiscalStatus: 'PENDING',
          receiptStatus: 'OFFLINE COMPLETED — PENDING SYNC',
          occurredAt: input.occurredAt,
          duplicate: false,
          totalMinor,
        };
      });
    } catch (error) {
      const checkoutError = error instanceof OfflineCheckoutError
        ? error
        : new OfflineCheckoutError('write_failed', 'The offline sale transaction rolled back.');
      this.safelyRecordFailure(input, checkoutError);
      throw checkoutError;
    }
  }
}

export function resolveOfflineOperationalState(input: {
  online: boolean;
  syncing?: boolean;
  syncError?: boolean;
  fiscalisationPending?: boolean;
  configurationOutdated?: boolean;
  terminalSuspended?: boolean;
}): OfflineOperationalState {
  if (input.terminalSuspended) return 'TERMINAL SUSPENDED';
  if (input.configurationOutdated) return 'CONFIGURATION OUTDATED';
  if (input.syncError) return 'SYNC ERROR';
  if (input.syncing) return 'SYNCING';
  if (input.fiscalisationPending) return 'FISCALISATION PENDING';
  return input.online ? 'ONLINE' : 'OFFLINE';
}
