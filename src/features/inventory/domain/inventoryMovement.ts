export type InventoryMovementType = 'OPENING_BALANCE' | 'SUPPLIER_RECEIPT' | 'TRANSFER_DISPATCH' | 'TRANSFER_RECEIPT' | 'SALE' | 'SALE_REVERSAL' | 'CUSTOMER_RETURN' | 'SUPPLIER_RETURN' | 'STOCKTAKE_ADJUSTMENT' | 'DAMAGE_WRITE_OFF' | 'MANUAL_ADJUSTMENT';
export type InventoryMovementStatus = 'POSTED';

export interface InventoryMovement {
  readonly id: string; readonly idempotencyKey: string; readonly tenantId: string; readonly vendorId: string; readonly productId: string;
  readonly sourceLocationId?: string; readonly destinationLocationId?: string; readonly movementType: InventoryMovementType; readonly quantity: number;
  readonly sourceBeforeQty?: number; readonly sourceAfterQty?: number; readonly destinationBeforeQty?: number; readonly destinationAfterQty?: number;
  readonly referenceType: string; readonly referenceId: string; readonly actorId: string; readonly approvalRequestId?: string;
  readonly status: InventoryMovementStatus; readonly occurredAt: string; readonly recordedAt: string;
}

export function immutableInventoryMovement(movement: InventoryMovement): InventoryMovement { return Object.freeze({ ...movement }); }
