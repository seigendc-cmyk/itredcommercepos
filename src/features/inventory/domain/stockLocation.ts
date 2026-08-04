import { InventoryDomainError, requireInventoryIdentity } from './inventoryErrors';

export type StockLocationType = 'WAREHOUSE' | 'BRANCH';
export type StockLocationStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type StockLocationLicenceStatus = 'LICENSED' | 'UNLICENSED';

export interface StockLocation {
  id: string; tenantId: string; vendorId: string; type: StockLocationType; name: string; code: string;
  status: StockLocationStatus; licenceStatus: StockLocationLicenceStatus; createdAt: string; updatedAt: string;
}

export function validateStockLocation(location: StockLocation): StockLocation {
  for (const field of ['id', 'tenantId', 'vendorId', 'name', 'code', 'createdAt', 'updatedAt'] as const) requireInventoryIdentity(location[field], field);
  if (!['WAREHOUSE', 'BRANCH'].includes(location.type)) throw new InventoryDomainError('INVALID_ROUTE', 'Unknown stock location type.');
  if (!['ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(location.status)) throw new InventoryDomainError('LOCATION_INACTIVE', 'Unknown stock location status.');
  if (!['LICENSED', 'UNLICENSED'].includes(location.licenceStatus)) throw new InventoryDomainError('LOCATION_UNLICENSED', 'Unknown stock location licence status.');
  return location;
}
