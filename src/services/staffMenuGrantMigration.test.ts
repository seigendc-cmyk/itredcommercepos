import assert from 'node:assert/strict';
import test from 'node:test';
import { AppMenuId, StaffMember } from '../types';
import { getVisibleSidebarMenuIds } from '../components/Sidebar';
import { getStaffMenuCountLabel } from '../components/Staff/StaffManagement';
import {
  ALL_APP_MENU_IDS,
  APPROVED_ROLE_MENU_POLICIES,
  MENU_GRANT_SCHEMA_VERSION,
  createCanonicalSysadminFallback,
  migrateStaffMenuGrantRecord,
  migrateStaffMenuGrantRecords,
  refreshActiveStaffAfterMenuMigration,
  resolveStaffNavigationAfterMigration,
} from './staffMenuGrantMigration';

const vendorId = 'vendor_a';
const staleSysadminMenus: AppMenuId[] = [
  'desk',
  'pos',
  'warehouse',
  'transfers',
  'branches',
  'products',
  'reports',
  'approvals',
  'staff',
  'bi_audit',
  'settings',
];

function staff(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: 'staff_1',
    vendorId,
    name: 'Staff Member',
    email: 'staff@example.test',
    role: 'sysadmin',
    grantedMenuIds: staleSysadminMenus,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('old sysadmin receives the four mandatory administrator menus', () => {
  const result = migrateStaffMenuGrantRecord(vendorId, staff());
  assert.equal(result.status, 'updated');
  assert.deepEqual(result.addedMenuIds, ['customers', 'delivery', 'financial', 'billing']);
  assert.equal(result.record.menuGrantSchemaVersion, MENU_GRANT_SCHEMA_VERSION);
  assert.ok(staleSysadminMenus.every(menu => result.record.grantedMenuIds.includes(menu)));
});

test('current sysadmin remains unchanged', () => {
  const current = staff({
    grantedMenuIds: [...ALL_APP_MENU_IDS],
    menuGrantSchemaVersion: MENU_GRANT_SCHEMA_VERSION,
  });
  const result = migrateStaffMenuGrantRecord(vendorId, current);
  assert.equal(result.status, 'already_current');
  assert.strictEqual(result.record, current);
});

test('manager receives only additions from the current manager policy', () => {
  const result = migrateStaffMenuGrantRecord(vendorId, staff({
    role: 'manager',
    grantedMenuIds: ['desk'],
  }));
  assert.deepEqual(result.record.grantedMenuIds, APPROVED_ROLE_MENU_POLICIES.manager);
  assert.ok(!result.record.grantedMenuIds.includes('staff'));
  assert.ok(!result.record.grantedMenuIds.includes('bi_audit'));
});

test('cashier remains restricted', () => {
  const result = migrateStaffMenuGrantRecord(vendorId, staff({
    role: 'cashier',
    grantedMenuIds: ['desk', 'pos'],
  }));
  assert.deepEqual(result.record.grantedMenuIds, ['desk', 'pos']);
});

test('warehouse staff remains restricted', () => {
  const result = migrateStaffMenuGrantRecord(vendorId, staff({
    role: 'warehouse_staff',
    grantedMenuIds: [...APPROVED_ROLE_MENU_POLICIES.warehouse_staff],
  }));
  assert.deepEqual(result.record.grantedMenuIds, APPROVED_ROLE_MENU_POLICIES.warehouse_staff);
  assert.ok(!result.record.grantedMenuIds.includes('financial'));
});

test('custom role is skipped without an explicit policy', () => {
  const custom = staff({ role: 'credit_controller' as StaffMember['role'] });
  const result = migrateStaffMenuGrantRecord(vendorId, custom);
  assert.equal(result.status, 'skipped_custom_role');
  assert.strictEqual(result.record, custom);
});

test('another vendor staff record is never modified', () => {
  const foreign = staff({ vendorId: 'vendor_b' });
  const result = migrateStaffMenuGrantRecord(vendorId, foreign);
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'vendor_mismatch');
  assert.strictEqual(result.record, foreign);
});

test('migration is idempotent and does not duplicate menus', () => {
  const first = migrateStaffMenuGrantRecord(vendorId, staff({
    grantedMenuIds: [...staleSysadminMenus, 'customers'],
  }));
  const second = migrateStaffMenuGrantRecord(vendorId, first.record);
  assert.equal(second.status, 'already_current');
  assert.equal(new Set(second.record.grantedMenuIds).size, second.record.grantedMenuIds.length);
});

test('persistence failure preserves the original record', async () => {
  const original = staff();
  const report = await migrateStaffMenuGrantRecords(vendorId, [original], async () => {
    throw new Error('Injected persistence failure');
  });
  assert.equal(report.results[0].status, 'failed');
  assert.strictEqual(report.records[0], original);
});

test('active staff refreshes to the migrated record', async () => {
  const original = staff();
  const report = await migrateStaffMenuGrantRecords(vendorId, [original], async () => {});
  const refreshed = refreshActiveStaffAfterMenuMigration(original, report.records);
  assert.strictEqual(refreshed, report.records[0]);
  assert.ok(refreshed?.grantedMenuIds.includes('billing'));
});

test('active tab is preserved when the migrated staff still has access', () => {
  const original = staff();
  const migrated = migrateStaffMenuGrantRecord(vendorId, original).record;
  const state = resolveStaffNavigationAfterMigration(
    original,
    [migrated],
    'financial',
  );
  assert.equal(state.activeStaff, migrated);
  assert.equal(state.activeTab, 'financial');
});

test('active tab falls back to desk when the migrated staff lacks access', () => {
  const cashier = staff({
    role: 'cashier',
    grantedMenuIds: ['desk', 'pos'],
    menuGrantSchemaVersion: MENU_GRANT_SCHEMA_VERSION,
  });
  const state = resolveStaffNavigationAfterMigration(
    cashier,
    [cashier],
    'financial',
  );
  assert.equal(state.activeTab, 'desk');
});

test('fallback sysadmin uses the canonical role policy', () => {
  const fallback = createCanonicalSysadminFallback(
    vendorId,
    'admin@example.test',
    '2026-01-01T00:00:00.000Z',
  );
  assert.deepEqual(fallback.grantedMenuIds, APPROVED_ROLE_MENU_POLICIES.sysadmin);
  assert.equal(fallback.menuGrantSchemaVersion, MENU_GRANT_SCHEMA_VERSION);
  assert.ok(fallback.grantedMenuIds.includes('settings'));
});

test('migrated sysadmin exposes the complete Sidebar menu count', () => {
  const migrated = migrateStaffMenuGrantRecord(vendorId, staff()).record;
  assert.equal(getVisibleSidebarMenuIds(migrated.grantedMenuIds).length, ALL_APP_MENU_IDS.length);
});

test('Staff Management reports the migrated sysadmin grant count', () => {
  const migrated = migrateStaffMenuGrantRecord(vendorId, staff()).record;
  assert.equal(getStaffMenuCountLabel(migrated), '15/15 Menus');
});

test('invalid menu IDs are reported without modifying the record', () => {
  const invalid = staff({ grantedMenuIds: ['desk', 'not_a_menu' as AppMenuId] });
  const result = migrateStaffMenuGrantRecord(vendorId, invalid);
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'invalid_menu_id');
  assert.strictEqual(result.record, invalid);
});
