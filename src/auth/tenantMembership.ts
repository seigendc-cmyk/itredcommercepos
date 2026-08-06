export const TENANT_OWNER_PERMISSIONS = [
  'tenant.manage',
  'location.all',
  'location.manage',
  'product.manage',
  'supplier.create',
  'purchase_order.create',
  'purchase_order.approve',
  'receiving.create',
  'receiving.approve',
  'transfer.create',
  'transfer.dispatch',
  'transfer.receive',
  'stocktake.count',
  'stocktake.approve',
  'inventory.adjust',
  'approval.create',
  'approval.decide',
  'sale.complete',
  'payment.create',
  'shift.open',
  'shift.close',
  'bi.view',
  'bi.event.create',
  'audit.view',
  'audit.event.create',
  'staff.view',
  'staff.manage',
  'report.view',
  'settings.manage',
  'billing.manage',
] as const;

export interface TenantMembership {
  tenantId: string;
  vendorId: string;
  userUid: string;
  roleId: string;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
  permissionVersion: number;
  permissions: string[];
  assignedWarehouseIds: string[];
  assignedBranchIds: string[];
  assignedTerminalIds: string[];
  effectiveAt: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function createVendorOwnerMembership(
  vendorId: string,
  userUid: string,
  now: string,
): TenantMembership {
  if (!vendorId.trim() || vendorId !== userUid) {
    throw new Error('Vendor owner membership requires the authenticated Firebase UID tenant partition.');
  }
  return {
    tenantId: vendorId,
    vendorId,
    userUid,
    roleId: 'sysadmin',
    status: 'ACTIVE',
    permissionVersion: 1,
    permissions: [...TENANT_OWNER_PERMISSIONS],
    assignedWarehouseIds: [],
    assignedBranchIds: [],
    assignedTerminalIds: [],
    effectiveAt: now,
    createdAt: now,
    updatedAt: now,
  };
}
