import { StaffRole } from '../../types';

export type StocktakePermission =
  | 'stocktake.view'
  | 'stocktake.perform'
  | 'stocktake.draft.save'
  | 'stocktake.submit'
  | 'stocktake.print'
  | 'stocktake.export'
  | 'stocktake.view_system_quantity'
  | 'stocktake.view_valuation'
  | 'stocktake.review'
  | 'stocktake.variance.approve';

const ROLE_PERMISSIONS: Record<StaffRole, readonly StocktakePermission[]> = {
  sysadmin: ['stocktake.view', 'stocktake.perform', 'stocktake.draft.save', 'stocktake.submit', 'stocktake.print', 'stocktake.export', 'stocktake.view_system_quantity', 'stocktake.view_valuation', 'stocktake.review', 'stocktake.variance.approve'],
  manager: ['stocktake.view', 'stocktake.perform', 'stocktake.draft.save', 'stocktake.submit', 'stocktake.print', 'stocktake.export', 'stocktake.view_system_quantity', 'stocktake.view_valuation', 'stocktake.review', 'stocktake.variance.approve'],
  warehouse_staff: ['stocktake.view', 'stocktake.perform', 'stocktake.draft.save', 'stocktake.submit', 'stocktake.print', 'stocktake.export', 'stocktake.view_system_quantity'],
  cashier: [],
};

export function hasStocktakePermission(role: StaffRole, permission: StocktakePermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function assertStocktakePermission(role: StaffRole, permission: StocktakePermission): void {
  if (!hasStocktakePermission(role, permission)) {
    throw new Error(`Permission denied: ${permission}.`);
  }
}
