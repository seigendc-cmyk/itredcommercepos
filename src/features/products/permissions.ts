import { StaffRole } from '../../types';

export type ExtendedProductPermission =
  | 'product.view' | 'product.create' | 'product.update' | 'product.import' | 'product.template.export'
  | 'product.duplicate.review' | 'product.duplicate.override' | 'product.columns.configure'
  | 'product.tax.edit' | 'product.hs_code.edit';

const PERMISSIONS: Record<StaffRole, readonly ExtendedProductPermission[]> = {
  sysadmin: ['product.view', 'product.create', 'product.update', 'product.import', 'product.template.export', 'product.duplicate.review', 'product.duplicate.override', 'product.columns.configure', 'product.tax.edit', 'product.hs_code.edit'],
  manager: ['product.view', 'product.create', 'product.update', 'product.import', 'product.template.export', 'product.duplicate.review', 'product.duplicate.override', 'product.columns.configure', 'product.tax.edit', 'product.hs_code.edit'],
  warehouse_staff: ['product.view', 'product.create', 'product.update', 'product.import', 'product.template.export', 'product.duplicate.review', 'product.columns.configure', 'product.hs_code.edit'],
  cashier: ['product.view'],
};

export function hasExtendedProductPermission(role: StaffRole, permission: ExtendedProductPermission): boolean { return PERMISSIONS[role].includes(permission); }
export function assertExtendedProductPermission(role: StaffRole, permission: ExtendedProductPermission): void {
  if (!hasExtendedProductPermission(role, permission)) throw new Error(`Permission denied: ${permission}.`);
}
