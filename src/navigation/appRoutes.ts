import { AppMenuId, StaffMember, SubscriptionPlanType } from '../types';

export type AppRouteId =
  | 'dashboard'
  | 'pos'
  | 'inventory'
  | 'warehouses'
  | 'branches'
  | 'terminals'
  | 'supplier-receipts'
  | 'purchase-orders'
  | 'stock-transfers'
  | 'approvals'
  | 'staff'
  | 'roles-permissions'
  | 'notifications'
  | 'billing'
  | 'delivery'
  | 'bi'
  | 'reports'
  | 'settings'
  | 'administration'
  | 'synchronisation';

export interface AppRouteDefinition {
  id: AppRouteId;
  path: string;
  label: string;
  description: string;
  tab: AppMenuId;
  permission: AppMenuId;
  context: 'branch' | 'warehouse' | 'organisation';
  feature?: 'delivery';
  workspaceNote?: string;
}

export type RouteAccessOutcome =
  | 'ALLOWED'
  | 'INACTIVE_STAFF'
  | 'MISSING_PERMISSION'
  | 'UPGRADE_REQUIRED';

export interface RouteAccessDecision {
  outcome: RouteAccessOutcome;
  allowed: boolean;
  renderUpgradeCard: boolean;
  message?: string;
}

export const APP_ROUTES: readonly AppRouteDefinition[] = [
  { id: 'dashboard', path: '/dashboard', label: 'Dashboard', description: 'Your authorised operational workspace.', tab: 'desk', permission: 'desk', context: 'organisation' },
  { id: 'pos', path: '/pos', label: 'POS Terminal', description: 'Sell from the active branch terminal.', tab: 'pos', permission: 'pos', context: 'branch' },
  { id: 'inventory', path: '/inventory', label: 'Inventory', description: 'Products, stock availability and controlled counts.', tab: 'products', permission: 'products', context: 'branch', workspaceNote: 'Uses the existing Products & Stocktake workspace.' },
  { id: 'warehouses', path: '/warehouses', label: 'Warehouses', description: 'Central inventory locations and warehouse stock.', tab: 'warehouse', permission: 'warehouse', context: 'warehouse' },
  { id: 'branches', path: '/branches', label: 'Branches', description: 'Retail branches and branch inventory.', tab: 'branches', permission: 'branches', context: 'branch' },
  { id: 'terminals', path: '/terminals', label: 'Terminals', description: 'POS terminals assigned to active branches.', tab: 'branches', permission: 'branches', context: 'branch', workspaceNote: 'Uses the existing combined Branches & Terminals workspace.' },
  { id: 'supplier-receipts', path: '/supplier-receipts', label: 'Supplier Receipts', description: 'Controlled supplier intake into active warehouses.', tab: 'warehouse', permission: 'warehouse', context: 'warehouse', workspaceNote: 'Uses the Receipts section of Warehouse Hub.' },
  { id: 'purchase-orders', path: '/purchase-orders', label: 'Purchase Orders', description: 'Open and partially received supplier orders.', tab: 'warehouse', permission: 'warehouse', context: 'warehouse', workspaceNote: 'Uses the existing supplier-receiving workflow; no dedicated page exists.' },
  { id: 'stock-transfers', path: '/stock-transfers', label: 'Stock Transfers', description: 'Controlled warehouse and branch transfers.', tab: 'transfers', permission: 'transfers', context: 'organisation' },
  { id: 'approvals', path: '/approvals', label: 'Approval Desk', description: 'Controlled business decisions and submitted requests.', tab: 'approvals', permission: 'approvals', context: 'organisation' },
  { id: 'staff', path: '/staff', label: 'Staff', description: 'Staff profiles, assignments and access status.', tab: 'staff', permission: 'staff', context: 'organisation' },
  { id: 'roles-permissions', path: '/roles-permissions', label: 'Roles & Permissions', description: 'Authorised role and menu configuration.', tab: 'staff', permission: 'staff', context: 'organisation', workspaceNote: 'Uses the existing Staff & Role Access workspace.' },
  { id: 'notifications', path: '/notifications', label: 'Notifications', description: 'Business records requiring authorised attention.', tab: 'approvals', permission: 'approvals', context: 'organisation', workspaceNote: 'Uses the existing Approval Desk notification queue.' },
  { id: 'billing', path: '/billing', label: 'Billing & Subscription', description: 'Plans, add-ons, invoices and service charges.', tab: 'billing', permission: 'billing', context: 'organisation' },
  { id: 'delivery', path: '/delivery', label: 'Delivery Management', description: 'Licensed vendor-managed delivery resources.', tab: 'delivery', permission: 'delivery', context: 'branch', feature: 'delivery' },
  { id: 'bi', path: '/bi', label: 'BI System', description: 'Authorised BI events and operational intelligence.', tab: 'bi_audit', permission: 'bi_audit', context: 'organisation' },
  { id: 'reports', path: '/reports', label: 'Reports', description: 'Sales history and operational reporting.', tab: 'reports', permission: 'reports', context: 'organisation' },
  { id: 'settings', path: '/settings', label: 'System Settings', description: 'Business, hardware and governance configuration.', tab: 'settings', permission: 'settings', context: 'organisation' },
  { id: 'administration', path: '/administration', label: 'Administration', description: 'Authorised system and governance administration.', tab: 'settings', permission: 'settings', context: 'organisation', workspaceNote: 'Uses the governance section of System Settings.' },
  { id: 'synchronisation', path: '/synchronisation', label: 'Synchronisation', description: 'Current offline operational status and configuration.', tab: 'settings', permission: 'settings', context: 'branch', workspaceNote: 'No dedicated synchronization workspace exists on this branch; mapped to System Settings.' },
] as const;

const byPath = new Map(APP_ROUTES.map(route => [route.path, route]));
const dashboard = APP_ROUTES[0];

export function routeFromPath(pathname: string): AppRouteDefinition {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return byPath.get(normalized) || dashboard;
}

export function routeForTab(tab: AppMenuId): AppRouteDefinition {
  return APP_ROUTES.find(route => route.tab === tab) || dashboard;
}

export function hasDeliveryEntitlement(plan: SubscriptionPlanType | undefined): boolean {
  return plan === 'pro_delivery' || plan === 'enterprise_fleet';
}

export function evaluateRouteAccess(
  staff: StaffMember,
  route: AppRouteDefinition,
  plan: SubscriptionPlanType | undefined,
): RouteAccessDecision {
  if (staff.status !== 'active') {
    return {
      outcome: 'INACTIVE_STAFF',
      allowed: false,
      renderUpgradeCard: false,
      message: 'This staff profile is suspended and cannot access an operational workspace.',
    };
  }
  if (!staff.grantedMenuIds.includes(route.permission)) {
    return {
      outcome: 'MISSING_PERMISSION',
      allowed: false,
      renderUpgradeCard: false,
      message: `Your staff profile does not have permission to open ${route.label}.`,
    };
  }
  if (route.feature === 'delivery' && !hasDeliveryEntitlement(plan)) {
    return {
      outcome: 'UPGRADE_REQUIRED',
      allowed: false,
      renderUpgradeCard: true,
      message: 'Delivery Management requires an active delivery plan or add-on.',
    };
  }
  return { outcome: 'ALLOWED', allowed: true, renderUpgradeCard: false };
}

export function firstAuthorisedRoute(
  staff: StaffMember,
  plan: SubscriptionPlanType | undefined,
): AppRouteDefinition {
  return APP_ROUTES.find(route => evaluateRouteAccess(staff, route, plan).outcome === 'ALLOWED') || dashboard;
}
