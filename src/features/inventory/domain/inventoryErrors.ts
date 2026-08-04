export type InventoryErrorCode =
  | 'INVALID_IDENTITY' | 'INVALID_QUANTITY' | 'INVALID_BALANCE' | 'INVALID_ROUTE'
  | 'PRODUCT_NOT_FOUND' | 'LOCATION_NOT_FOUND' | 'LOCATION_OWNERSHIP_MISMATCH'
  | 'LOCATION_INACTIVE' | 'LOCATION_UNLICENSED' | 'INSUFFICIENT_STOCK';

export class InventoryDomainError extends Error {
  constructor(public readonly code: InventoryErrorCode, message: string) {
    super(message);
    this.name = 'InventoryDomainError';
  }
}

export function requireInventoryIdentity(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InventoryDomainError('INVALID_IDENTITY', `${field} is required.`);
  }
}
