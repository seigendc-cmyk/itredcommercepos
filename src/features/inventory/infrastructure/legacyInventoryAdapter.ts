import { Branch, BranchInventory, Warehouse, WarehouseInventory } from '../../../types';
import {
  deterministicInventoryBalanceId, InventoryBalance, requireInventoryIdentity,
  StockLocation, validateInventoryBalance, validateStockLocation,
} from '../domain';

function canonicalStatus(status: Warehouse['status'] | Branch['status']): StockLocation['status'] {
  if (status === 'suspended') return 'SUSPENDED';
  if (status === 'archived') return 'ARCHIVED';
  return 'ACTIVE';
}

function canonicalLicence(status: Warehouse['licenseStatus'] | Branch['licenseStatus']): StockLocation['licenceStatus'] {
  return status === 'unlicensed' ? 'UNLICENSED' : 'LICENSED';
}

function requireTenantAndVendor(tenantId: string, vendorId: string): void {
  requireInventoryIdentity(tenantId, 'tenantId');
  requireInventoryIdentity(vendorId, 'vendorId');
}

export function warehouseInventoryToCanonicalBalance(inventory: WarehouseInventory, tenantId: string): InventoryBalance {
  requireTenantAndVendor(tenantId, inventory.vendorId);
  const identity = { tenantId, vendorId: inventory.vendorId, stockLocationId: inventory.warehouseId, productId: inventory.productId };
  return validateInventoryBalance({
    ...identity, id: deterministicInventoryBalanceId(identity), onHandQty: inventory.quantity,
    reservedQty: 0, inTransitQty: 0, quarantinedQty: 0, damagedQty: 0, version: 0, updatedAt: inventory.lastUpdated,
  });
}

export function branchInventoryToCanonicalBalance(inventory: BranchInventory, tenantId: string): InventoryBalance {
  requireTenantAndVendor(tenantId, inventory.vendorId);
  const identity = { tenantId, vendorId: inventory.vendorId, stockLocationId: inventory.branchId, productId: inventory.productId };
  return validateInventoryBalance({
    ...identity, id: deterministicInventoryBalanceId(identity), onHandQty: inventory.quantity,
    reservedQty: 0, inTransitQty: 0, quarantinedQty: 0, damagedQty: 0, version: 0, updatedAt: inventory.lastUpdated,
  });
}

export function warehouseToCanonicalStockLocation(warehouse: Warehouse, tenantId: string): StockLocation {
  requireTenantAndVendor(tenantId, warehouse.vendorId);
  return validateStockLocation({
    id: warehouse.id, tenantId, vendorId: warehouse.vendorId, type: 'WAREHOUSE', name: warehouse.name, code: warehouse.code,
    status: canonicalStatus(warehouse.status), licenceStatus: canonicalLicence(warehouse.licenseStatus),
    createdAt: warehouse.createdAt, updatedAt: warehouse.createdAt,
  });
}

export function branchToCanonicalStockLocation(branch: Branch, tenantId: string): StockLocation {
  requireTenantAndVendor(tenantId, branch.vendorId);
  return validateStockLocation({
    id: branch.id, tenantId, vendorId: branch.vendorId, type: 'BRANCH', name: branch.name, code: branch.code,
    status: canonicalStatus(branch.status), licenceStatus: canonicalLicence(branch.licenseStatus),
    createdAt: branch.createdAt, updatedAt: branch.createdAt,
  });
}

export function canonicalBalanceToWarehouseInventory(balance: InventoryBalance, averageUnitCost?: number): WarehouseInventory {
  validateInventoryBalance(balance);
  return { id: `${balance.vendorId}_${balance.stockLocationId}_${balance.productId}`, vendorId: balance.vendorId, warehouseId: balance.stockLocationId, productId: balance.productId, quantity: balance.onHandQty, ...(averageUnitCost === undefined ? {} : { averageUnitCost }), lastUpdated: balance.updatedAt };
}

export function canonicalBalanceToBranchInventory(balance: InventoryBalance, averageUnitCost?: number): BranchInventory {
  validateInventoryBalance(balance);
  return { id: `${balance.vendorId}_${balance.stockLocationId}_${balance.productId}`, vendorId: balance.vendorId, branchId: balance.stockLocationId, productId: balance.productId, quantity: balance.onHandQty, ...(averageUnitCost === undefined ? {} : { averageUnitCost }), lastUpdated: balance.updatedAt };
}

export function canonicalStockLocationToWarehouse(location: StockLocation, existing: Warehouse): Warehouse {
  validateStockLocation(location);
  if (location.type !== 'WAREHOUSE' || location.id !== existing.id || location.vendorId !== existing.vendorId) {
    throw new Error('Canonical warehouse identity must match the legacy warehouse being updated.');
  }
  return {
    ...existing,
    name: location.name,
    code: location.code,
    status: location.status.toLowerCase() as Warehouse['status'],
    licenseStatus: location.licenceStatus.toLowerCase() as Warehouse['licenseStatus'],
  };
}

export function canonicalStockLocationToBranch(location: StockLocation, existing: Branch): Branch {
  validateStockLocation(location);
  if (location.type !== 'BRANCH' || location.id !== existing.id || location.vendorId !== existing.vendorId) {
    throw new Error('Canonical branch identity must match the legacy branch being updated.');
  }
  return {
    ...existing,
    name: location.name,
    code: location.code,
    status: location.status.toLowerCase() as Branch['status'],
    licenseStatus: location.licenceStatus.toLowerCase() as Branch['licenseStatus'],
  };
}

export const mapWarehouseInventoryToBalance = warehouseInventoryToCanonicalBalance;
export const mapBranchInventoryToBalance = branchInventoryToCanonicalBalance;
export const mapWarehouseToStockLocation = warehouseToCanonicalStockLocation;
export const mapBranchToStockLocation = branchToCanonicalStockLocation;
