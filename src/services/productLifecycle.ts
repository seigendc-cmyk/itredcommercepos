import { Product, StaffRole } from '../types';

export type ProductPermission = 'product.delete' | 'product.archive' | 'product.restore';

const ROLE_PERMISSIONS: Record<StaffRole, ProductPermission[]> = {
  sysadmin: ['product.delete', 'product.archive', 'product.restore'],
  manager: ['product.archive', 'product.restore'],
  warehouse_staff: [],
  cashier: [],
};

export function assertProductPermission(role: StaffRole, permission: ProductPermission): void {
  if (!ROLE_PERMISSIONS[role].includes(permission)) throw new Error(`Permission ${permission} is required.`);
}

export interface ProductUsageSummary {
  stockByLocation: { locationId: string; locationName: string; quantity: number }[];
  references: string[];
}

export function determineProductRemoval(product: Product, usage: ProductUsageSummary): 'delete' | 'archive' {
  return usage.stockByLocation.some(item => item.quantity !== 0) || usage.references.length > 0
    ? 'archive'
    : 'delete';
}

export function productAvailableForNewTransactions(product: Product): boolean {
  return (product.status || 'active') === 'active';
}
