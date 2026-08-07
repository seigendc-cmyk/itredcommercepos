export type TransferLocationType = 'WAREHOUSE' | 'BRANCH';
export type TransferCommandKind = 'dispatch' | 'receive' | 'discrepancy' | 'reverse';
export type TransferDiscrepancyType = 'SHORTAGE' | 'DAMAGE' | 'LOSS' | 'QUANTITY_DISAGREEMENT';

export interface TransferLineState {
  productId: string;
  quantityApproved: number;
  quantityDispatched: number;
  quantityReceived: number;
  quantityDisputed: number;
  quantityReversed: number;
}

export function outstandingQuantity(line: TransferLineState): number {
  return line.quantityDispatched - line.quantityReceived - line.quantityDisputed - line.quantityReversed;
}

export function assertPositiveQuantity(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantity must be positive.');
}

export function applyReceipt(line: TransferLineState, quantity: number): TransferLineState {
  assertPositiveQuantity(quantity);
  if (quantity > outstandingQuantity(line)) throw new Error('Receipt exceeds outstanding in-transit quantity.');
  return { ...line, quantityReceived: line.quantityReceived + quantity };
}

export function applyDiscrepancy(line: TransferLineState, quantity: number): TransferLineState {
  assertPositiveQuantity(quantity);
  if (quantity > outstandingQuantity(line)) throw new Error('Discrepancy exceeds outstanding in-transit quantity.');
  return { ...line, quantityDisputed: line.quantityDisputed + quantity };
}

export function transferReconciles(line: TransferLineState): boolean {
  const outstanding = outstandingQuantity(line);
  return outstanding >= 0 && line.quantityDispatched === line.quantityReceived + outstanding + line.quantityDisputed + line.quantityReversed;
}
