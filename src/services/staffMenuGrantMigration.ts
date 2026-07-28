import { AppMenuId, StaffMember, StaffRole } from '../types';

export const MENU_GRANT_SCHEMA_VERSION = 1;

export const ALL_APP_MENU_IDS: readonly AppMenuId[] = [
  'desk',
  'pos',
  'delivery',
  'warehouse',
  'transfers',
  'branches',
  'products',
  'financial',
  'customers',
  'reports',
  'approvals',
  'staff',
  'bi_audit',
  'settings',
  'billing',
];

export const APPROVED_ROLE_MENU_POLICIES: Record<StaffRole, readonly AppMenuId[]> = {
  sysadmin: ALL_APP_MENU_IDS,
  manager: ['desk', 'pos', 'delivery', 'warehouse', 'transfers', 'branches', 'products', 'financial', 'customers', 'reports', 'approvals', 'settings', 'billing'],
  cashier: ['desk', 'pos', 'customers', 'reports'],
  warehouse_staff: ['desk', 'warehouse', 'transfers', 'products', 'approvals'],
};

const MIGRATION_ADDITIONS: Partial<Record<StaffRole, readonly AppMenuId[]>> = {
  sysadmin: ['customers', 'delivery', 'financial', 'billing'],
  manager: APPROVED_ROLE_MENU_POLICIES.manager,
};

const BUILT_IN_ROLES = new Set<StaffRole>([
  'sysadmin',
  'manager',
  'cashier',
  'warehouse_staff',
]);
const VALID_MENU_IDS = new Set<AppMenuId>(ALL_APP_MENU_IDS);

export type StaffMenuGrantMigrationStatus =
  | 'already_current'
  | 'updated'
  | 'skipped_custom_role'
  | 'invalid'
  | 'failed';

export interface StaffMenuGrantMigrationResult {
  staffId: string;
  status: StaffMenuGrantMigrationStatus;
  record: StaffMember;
  addedMenuIds: AppMenuId[];
  reason?: string;
}

export interface StaffMenuGrantMigrationReport {
  vendorId: string;
  schemaVersion: number;
  records: StaffMember[];
  results: StaffMenuGrantMigrationResult[];
}

export function migrateStaffMenuGrantRecord(
  vendorId: string,
  staff: StaffMember,
): StaffMenuGrantMigrationResult {
  if (!staff || typeof staff.id !== 'string' || !staff.id.trim()) {
    return invalidResult(staff, 'invalid_staff_id');
  }
  if (staff.vendorId !== vendorId) {
    return invalidResult(staff, 'vendor_mismatch');
  }
  if (!Array.isArray(staff.grantedMenuIds)) {
    return invalidResult(staff, 'invalid_menu_grants');
  }
  if (staff.grantedMenuIds.some(menuId => !VALID_MENU_IDS.has(menuId))) {
    return invalidResult(staff, 'invalid_menu_id');
  }

  const runtimeRole = staff.role as string;
  if (!BUILT_IN_ROLES.has(runtimeRole as StaffRole)) {
    return {
      staffId: staff.id,
      status: 'skipped_custom_role',
      record: staff,
      addedMenuIds: [],
      reason: 'no_explicit_role_policy',
    };
  }

  const role = runtimeRole as StaffRole;
  const additions = MIGRATION_ADDITIONS[role] ?? [];
  const nextMenuIds = [...new Set(staff.grantedMenuIds)];
  const addedMenuIds: AppMenuId[] = [];
  for (const menuId of additions) {
    if (!nextMenuIds.includes(menuId)) {
      nextMenuIds.push(menuId);
      addedMenuIds.push(menuId);
    }
  }

  const hasDuplicates = nextMenuIds.length !== staff.grantedMenuIds.length;
  if (
    addedMenuIds.length === 0 &&
    !hasDuplicates &&
    staff.menuGrantSchemaVersion === MENU_GRANT_SCHEMA_VERSION
  ) {
    return {
      staffId: staff.id,
      status: 'already_current',
      record: staff,
      addedMenuIds,
    };
  }

  return {
    staffId: staff.id,
    status: 'updated',
    record: {
      ...staff,
      grantedMenuIds: nextMenuIds,
      menuGrantSchemaVersion: MENU_GRANT_SCHEMA_VERSION,
    },
    addedMenuIds,
  };
}

export async function migrateStaffMenuGrantRecords(
  vendorId: string,
  records: StaffMember[],
  persist?: (record: StaffMember) => Promise<void>,
): Promise<StaffMenuGrantMigrationReport> {
  const results: StaffMenuGrantMigrationResult[] = [];
  const migratedRecords: StaffMember[] = [];

  for (const staff of records) {
    const result = migrateStaffMenuGrantRecord(vendorId, staff);
    if (result.status === 'updated' && persist) {
      try {
        await persist(result.record);
      } catch {
        results.push({
          staffId: staff?.id || 'unknown',
          status: 'failed',
          record: staff,
          addedMenuIds: [],
          reason: 'persistence_failed',
        });
        migratedRecords.push(staff);
        continue;
      }
    }
    results.push(result);
    migratedRecords.push(result.record);
  }

  return {
    vendorId,
    schemaVersion: MENU_GRANT_SCHEMA_VERSION,
    records: migratedRecords,
    results,
  };
}

export function refreshActiveStaffAfterMenuMigration(
  activeStaff: StaffMember | null,
  migratedRecords: StaffMember[],
): StaffMember | null {
  if (!activeStaff) return null;
  return migratedRecords.find(staff => staff.id === activeStaff.id) ?? activeStaff;
}

function invalidResult(staff: StaffMember, reason: string): StaffMenuGrantMigrationResult {
  return {
    staffId: staff?.id || 'unknown',
    status: 'invalid',
    record: staff,
    addedMenuIds: [],
    reason,
  };
}
