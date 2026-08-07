import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import type { StockTransfer } from '../types';

function stableCommandKey(prefix: string, transferId: string): string {
  return `${prefix}:${transferId}:${crypto.randomUUID()}`;
}

async function callTransfer<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const result = await httpsCallable<Record<string, unknown>, T>(functions, name)(data);
  return result.data;
}

export function dispatchTransferCommand(vendorId: string, transferId: string): Promise<StockTransfer> {
  return callTransfer('dispatchTransfer', { vendorId, transferId, idempotencyKey: `dispatch:${transferId}` });
}

export function receiveTransferCommand(
  vendorId: string,
  transferId: string,
  receipts: { lineIndex: number; quantityReceived: number }[],
  reason: string,
  idempotencyKey = stableCommandKey('receipt', transferId),
): Promise<StockTransfer> {
  return callTransfer('receiveTransfer', { vendorId, transferId, receipts, reason, idempotencyKey });
}

export function recordTransferDiscrepancyCommand(
  vendorId: string,
  transferId: string,
  lineIndex: number,
  discrepancyType: 'SHORTAGE' | 'DAMAGE' | 'LOSS' | 'QUANTITY_DISAGREEMENT',
  quantity: number,
  reason: string,
): Promise<StockTransfer> {
  return callTransfer('recordTransferDiscrepancy', {
    vendorId, transferId, lineIndex, discrepancyType, quantity, reason,
    idempotencyKey: stableCommandKey('discrepancy', transferId),
  });
}

export function reverseTransferCommand(vendorId: string, transferId: string, reason: string): Promise<StockTransfer> {
  return callTransfer('reverseTransfer', { vendorId, transferId, reason, idempotencyKey: `reverse:${transferId}` });
}

export interface TransferReconciliationResult {
  transferId: string;
  reconciled: boolean;
  lines: Array<{ lineIndex: number; productId: string; warehouseDispatched: number; inTransitOutstanding: number; branchReceived: number; disputed: number; reversed: number; reconciled: boolean }>;
}

export function reconcileTransferCommand(vendorId: string, transferId: string): Promise<TransferReconciliationResult> {
  return callTransfer('reconcileTransfer', { vendorId, transferId });
}
