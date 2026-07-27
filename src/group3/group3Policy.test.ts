import assert from 'node:assert/strict';
import test from 'node:test';
import { BIEvent } from '../bi/types';
import { SyncQueueRecord } from '../offline/types';
import { OfflineSyncCoordinator } from '../offline/sync';
import { OfflineSyncQueueRepository } from '../offline/repositories';
import { StaffMember } from '../types';
import {
  canRetrySync,
  fiscalSaleDisplay,
  groupSyncQueue,
  OPERATIONAL_STATE_PRESENTATION,
  safeBIHealthEvents,
  validateEffectiveDates,
  validateHsCode,
} from './group3Policy';

const staff = (role: StaffMember['role'], menus: StaffMember['grantedMenuIds']): StaffMember => ({
  id: 's1', vendorId: 'v1', name: 'Staff', email: 'staff@example.test',
  role, grantedMenuIds: menus, status: 'active', createdAt: '2026-01-01',
});

test('maps every approved operational state to accessible text and blocking behaviour', () => {
  assert.equal(OPERATIONAL_STATE_PRESENTATION['CONFIGURATION OUTDATED'].label, 'Configuration outdated');
  assert.equal(OPERATIONAL_STATE_PRESENTATION['TERMINAL SUSPENDED'].blocksActions, true);
  assert.equal(OPERATIONAL_STATE_PRESENTATION.ONLINE.blocksActions, false);
});

test('groups queue records without changing occurrence or sync state', () => {
  const record = {
    localId: 'q1', tenantId: 'v1', vendorId: 'v1', branchId: 'b1', terminalId: 't1',
    entityType: 'sale', entityLocalId: 'sale1', operation: 'CREATE', payloadJson: '{}',
    idempotencyKey: 'i1', syncStatus: 'FAILED', attemptCount: 2,
    createdAt: '2026-01-01', updatedAt: '2026-01-02',
  } satisfies SyncQueueRecord;
  const grouped = groupSyncQueue([record]);
  assert.equal(grouped.FAILED[0].createdAt, '2026-01-01');
  assert.equal(grouped.SYNCED.length, 0);
});

test('retry remains unavailable without elevated settings permission', () => {
  assert.equal(canRetrySync(staff('cashier', ['settings']), 'FAILED'), false);
  assert.equal(canRetrySync(staff('sysadmin', ['settings']), 'FAILED'), true);
  assert.equal(canRetrySync(staff('sysadmin', ['settings']), 'CONFLICT'), false);
});

test('unsupported server synchronisation rejects instead of reporting false success', () => {
  const coordinator = new OfflineSyncCoordinator({} as OfflineSyncQueueRepository, true);
  assert.throws(
    () => coordinator.drain(),
    /Server synchronization acceptance is outside the approved implementation scope/,
  );
});

test('validates effective dates and international HS base codes', () => {
  assert.equal(validateEffectiveDates('2026-07-02', '2026-07-01'), 'Effective-to date cannot be before effective-from date.');
  assert.equal(validateEffectiveDates('2026-07-01', '2026-07-02'), undefined);
  assert.equal(validateHsCode('123456'), undefined);
  assert.equal(validateHsCode('123456-ZW01'), undefined);
  assert.match(validateHsCode('12345') || '', /six-digit/);
});

test('fiscal rejection preserves the commercial sale display', () => {
  const display = fiscalSaleDisplay({ commercialStatus: 'COMPLETED', fiscalStatus: 'REJECTED' });
  assert.equal(display.commercialStatus, 'COMPLETED');
  assert.equal(display.commercialSalePreserved, true);
});

test('BI health is tenant isolated and exposes no raw detail payload', () => {
  const event = (vendorId: string): BIEvent => ({
    id: `e-${vendorId}`, vendorId, eventType: 'AUTH_LOGIN', actionSummary: 'Login',
    details: { accessToken: 'never-render' }, riskScore: 5, isAnomaly: false, timestamp: '2026-01-01',
  });
  const safe = safeBIHealthEvents([event('v1'), event('v2')], 'v1');
  assert.deepEqual(safe, [{
    id: 'e-v1', eventType: 'AUTH_LOGIN', outcome: 'RECORDED', occurredAt: '2026-01-01',
  }]);
  assert.equal(JSON.stringify(safe).includes('never-render'), false);
});
