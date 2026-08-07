import { InventoryBalance } from './inventoryBalance';
import { InventoryDomainError, requireInventoryIdentity } from './inventoryErrors';
import { InventoryMovement, InventoryMovementType, InventoryQuantityBucket } from './inventoryMovement';
import { StockLocation } from './stockLocation';

export interface InventoryPostingCommand {
  commandId: string; idempotencyKey: string; tenantId: string; vendorId: string; productId: string;
  movementType: InventoryMovementType; quantity: number; sourceLocationId?: string; destinationLocationId?: string;
  quantityBucket?: InventoryQuantityBucket;
  referenceType: string; referenceId: string; actorId: string; approvalRequestId?: string; occurredAt: string;
  correlationId?: string; reasonCode?: string; reversalOfMovementId?: string;
  expectedSourceVersion?: number; expectedDestinationVersion?: number;
}
export interface InventoryPostingResult { movement: InventoryMovement; balances: InventoryBalance[]; duplicate: boolean; }

const SOURCE_ONLY = new Set<InventoryMovementType>(['SALE', 'SUPPLIER_RETURN', 'DAMAGE_WRITE_OFF']);
const DESTINATION_ONLY = new Set<InventoryMovementType>(['OPENING_BALANCE', 'SUPPLIER_RECEIPT', 'SALE_REVERSAL', 'CUSTOMER_RETURN']);

export function validateInventoryPostingCommand(command: InventoryPostingCommand): InventoryPostingCommand {
  for (const field of ['commandId', 'idempotencyKey', 'tenantId', 'vendorId', 'productId', 'movementType', 'referenceType', 'referenceId', 'actorId', 'occurredAt'] as const) requireInventoryIdentity(command[field], field);
  if (!Number.isFinite(command.quantity) || command.quantity <= 0) throw new InventoryDomainError('INVALID_QUANTITY', 'Movement quantity must be a positive finite magnitude.');
  if (command.quantityBucket && !['ON_HAND', 'QUARANTINED', 'DAMAGED'].includes(command.quantityBucket)) throw new InventoryDomainError('INVALID_QUANTITY', 'Unknown inventory quantity bucket.');
  if (command.quantityBucket && command.quantityBucket !== 'ON_HAND' && command.movementType !== 'SUPPLIER_RECEIPT') throw new InventoryDomainError('INVALID_ROUTE', 'Only supplier receipts may post directly to quarantined or damaged stock.');
  if (command.sourceLocationId !== undefined) requireInventoryIdentity(command.sourceLocationId, 'sourceLocationId');
  if (command.destinationLocationId !== undefined) requireInventoryIdentity(command.destinationLocationId, 'destinationLocationId');
  for (const version of [command.expectedSourceVersion, command.expectedDestinationVersion]) {
    if (version !== undefined && (!Number.isInteger(version) || version < 0)) throw new InventoryDomainError('STALE_BALANCE', 'Expected balance versions must be non-negative integers.');
  }
  if (command.reversalOfMovementId !== undefined) requireInventoryIdentity(command.reversalOfMovementId, 'reversalOfMovementId');
  return command;
}

export function movementReducesSource(type: InventoryMovementType): boolean {
  return SOURCE_ONLY.has(type) || type === 'TRANSFER_DISPATCH';
}

export function validateInventoryMovementRoute(command: InventoryPostingCommand, source?: StockLocation, destination?: StockLocation): void {
  const hasSource = Boolean(command.sourceLocationId);
  const hasDestination = Boolean(command.destinationLocationId);
  if (SOURCE_ONLY.has(command.movementType) && (!hasSource || hasDestination)) throw new InventoryDomainError('INVALID_ROUTE', `${command.movementType} requires only a source location.`);
  if (DESTINATION_ONLY.has(command.movementType) && (hasSource || !hasDestination)) throw new InventoryDomainError('INVALID_ROUTE', `${command.movementType} requires only a destination location.`);
  if (command.movementType === 'SALE' && source?.type !== 'BRANCH') throw new InventoryDomainError('INVALID_ROUTE', 'SALE source must be a branch.');
  if (command.movementType === 'SUPPLIER_RECEIPT' && destination?.type !== 'WAREHOUSE') throw new InventoryDomainError('INVALID_ROUTE', 'SUPPLIER_RECEIPT destination must be a warehouse.');
  if (command.movementType === 'TRANSFER_DISPATCH' || command.movementType === 'TRANSFER_RECEIPT') {
    if (!hasSource || !hasDestination || !source || source.type === undefined || destination?.type !== 'BRANCH' || source.id === destination.id) {
      throw new InventoryDomainError('INVALID_ROUTE', `${command.movementType} requires a distinct warehouse-or-branch source and branch destination.`);
    }
  }
  if (command.movementType === 'STOCKTAKE_ADJUSTMENT' || command.movementType === 'MANUAL_ADJUSTMENT') {
    if (hasSource === hasDestination) throw new InventoryDomainError('INVALID_ROUTE', `${command.movementType} requires exactly one affected stock location.`);
  }
}
