import assert from 'node:assert/strict';
import test from 'node:test';
import { StaffMember } from '../types';
import {
  APP_ROUTES,
  evaluateRouteAccess,
  firstAuthorisedRoute,
  routeForTab,
  routeFromPath,
} from './appRoutes';

const staff = (overrides: Partial<StaffMember> = {}): StaffMember => ({
  id: 'staff-1',
  vendorId: 'vendor-1',
  name: 'Cashier',
  email: 'cashier@example.com',
  role: 'cashier',
  grantedMenuIds: ['desk', 'pos'],
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

test('resolves canonical paths and falls back safely to dashboard', () => {
  assert.equal(routeFromPath('/stock-transfers').id, 'stock-transfers');
  assert.equal(routeFromPath('/stock-transfers/').id, 'stock-transfers');
  assert.equal(routeFromPath('/unknown').id, 'dashboard');
});

test('maps browser capability paths to existing combined workspaces', () => {
  assert.equal(routeFromPath('/terminals').tab, 'branches');
  assert.equal(routeFromPath('/supplier-receipts').tab, 'warehouse');
  assert.equal(routeFromPath('/roles-permissions').tab, 'staff');
  assert.equal(routeForTab('billing').path, '/billing');
});

test('denies direct routes for inactive staff', () => {
  const route = APP_ROUTES.find(item => item.id === 'pos')!;
  assert.equal(evaluateRouteAccess(staff({ status: 'suspended' }), route, 'starter_free').outcome, 'INACTIVE_STAFF');
});

test('denies direct routes without the required menu permission', () => {
  const route = APP_ROUTES.find(item => item.id === 'settings')!;
  assert.equal(evaluateRouteAccess(staff(), route, 'starter_free').outcome, 'MISSING_PERMISSION');
});

test('denies direct synchronisation and BI health routes without required authority', () => {
  assert.equal(
    evaluateRouteAccess(staff(), routeFromPath('/synchronisation'), 'starter_free').outcome,
    'MISSING_PERMISSION',
  );
  assert.equal(
    evaluateRouteAccess(
      staff({ role: 'manager', grantedMenuIds: ['bi_audit'] }),
      routeFromPath('/bi-health'),
      'starter_free',
    ).outcome,
    'MISSING_PERMISSION',
  );
  assert.equal(
    evaluateRouteAccess(
      staff({ role: 'cashier', grantedMenuIds: ['settings'] }),
      routeFromPath('/tax-configuration'),
      'starter_free',
    ).outcome,
    'MISSING_PERMISSION',
  );
});

test('delivery denial requests an upgrade card without granting access', () => {
  const route = APP_ROUTES.find(item => item.id === 'delivery')!;
  const decision = evaluateRouteAccess(
    staff({ grantedMenuIds: ['desk', 'delivery'] }),
    route,
    'starter_free',
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.outcome, 'UPGRADE_REQUIRED');
  assert.equal(decision.renderUpgradeCard, true);
});

test('selects an authorised fallback workspace', () => {
  assert.equal(firstAuthorisedRoute(staff({ grantedMenuIds: ['pos'] }), 'starter_free').id, 'pos');
});
