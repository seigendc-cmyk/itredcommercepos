import { InventoryDomainError, requireInventoryIdentity } from './inventoryErrors';

export interface InventoryBalanceIdentity { tenantId: string; vendorId: string; stockLocationId: string; productId: string; }
export interface InventoryBalance extends InventoryBalanceIdentity {
  id: string; onHandQty: number; reservedQty: number; inTransitQty: number; quarantinedQty: number;
  damagedQty: number; version: number; updatedAt: string;
}

export function deterministicInventoryBalanceId(identity: InventoryBalanceIdentity): string {
  for (const field of ['tenantId', 'vendorId', 'stockLocationId', 'productId'] as const) requireInventoryIdentity(identity[field], field);
  return [identity.tenantId, identity.vendorId, identity.stockLocationId, identity.productId]
    .map((value) => encodeURIComponent(value.trim())).join('::');
}
export const createInventoryBalanceId = deterministicInventoryBalanceId;

export function validateInventoryBalance(balance: InventoryBalance): InventoryBalance {
  for (const field of ['id', 'tenantId', 'vendorId', 'stockLocationId', 'productId', 'updatedAt'] as const) requireInventoryIdentity(balance[field], field);
  for (const field of ['onHandQty', 'reservedQty', 'inTransitQty', 'quarantinedQty', 'damagedQty'] as const) {
    if (!Number.isFinite(balance[field]) || balance[field] < 0) throw new InventoryDomainError('INVALID_BALANCE', `${field} must be a finite, non-negative number.`);
  }
  if (!Number.isInteger(balance.version) || balance.version < 0) throw new InventoryDomainError('INVALID_BALANCE', 'version must be a non-negative integer.');
  return balance;
}

export function emptyInventoryBalance(identity: InventoryBalanceIdentity, updatedAt: string): InventoryBalance {
  return validateInventoryBalance({ ...identity, id: deterministicInventoryBalanceId(identity), onHandQty: 0, reservedQty: 0, inTransitQty: 0, quarantinedQty: 0, damagedQty: 0, version: 0, updatedAt });
}
