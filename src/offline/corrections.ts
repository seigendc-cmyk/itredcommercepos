import { OfflineDatabase } from './database';
import { createOfflineId } from './ids';
import { OfflineScope } from './types';

export type OfflineCorrectionType = 'REFUND' | 'REVERSAL' | 'ADJUSTMENT';

export class OfflineCorrectionRepository {
  constructor(
    private readonly database: OfflineDatabase,
    private readonly scope: OfflineScope,
  ) {}

  create(input: {
    originalSaleId: string;
    deviceId: string;
    cashierId: string;
    shiftId: string;
    type: OfflineCorrectionType;
    reason: string;
    amountMinor: number;
    occurredAt: string;
  }): string {
    if (!input.reason.trim() || input.amountMinor <= 0) {
      throw new Error('Correction transactions require a reason and positive amount.');
    }
    const original = this.database.rows<Record<string, unknown>>(`
      SELECT local_id FROM sales
      WHERE local_id = ? AND tenant_id = ? AND vendor_id = ? AND branch_id = ? AND terminal_id = ?
        AND status IN ('COMPLETED_PENDING_SYNC','SYNC_PROCESSING','SYNC_FAILED','SYNCED')
    `, [
      input.originalSaleId,
      this.scope.tenantId, this.scope.vendorId, this.scope.branchId, this.scope.terminalId,
    ])[0];
    if (!original) throw new Error('Only a completed sale in the active scope may be corrected.');
    const localId = createOfflineId('correction');
    const now = new Date().toISOString();
    this.database.run(`
      INSERT INTO sale_corrections(
        local_id, original_sale_local_id, tenant_id, vendor_id, branch_id, terminal_id,
        device_id, cashier_id, shift_local_id, correction_type, reason,
        amount_minor, occurred_at, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `, [
      localId, input.originalSaleId,
      this.scope.tenantId, this.scope.vendorId, this.scope.branchId, this.scope.terminalId,
      input.deviceId, input.cashierId, input.shiftId, input.type,
      input.reason.trim(), input.amountMinor, input.occurredAt, now, now,
    ]);
    return localId;
  }
}
