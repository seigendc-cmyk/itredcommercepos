import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BillingPlan,
  Branch,
  ResourceAddonEntitlement,
  VendorSubscription,
} from '../types';
import {
  assertTerminalBelongsToActiveBranch,
  canResourceProcessTransactions,
  evaluateResourceActivation,
  ResourceEntitlementError,
  ResourceEntitlementEvent,
  ResourceEntitlementService,
  summarizeResources,
} from './resourceEntitlements';

const now = new Date('2026-07-26T12:00:00.000Z');

const starterPlan: BillingPlan = {
  id: 'starter_free',
  name: 'Starter POS',
  priceMonthly: 0,
  billingPeriodMonths: 1,
  currency: '$',
  description: 'Starter',
  features: [],
  maxWarehouses: 1,
  maxBranches: 1,
  maxTerminals: 1,
  maxStaff: 3,
  status: 'active',
  createdAt: now.toISOString(),
};

function subscription(addons: ResourceAddonEntitlement[] = []): VendorSubscription {
  return {
    id: 'sub_vendor-1',
    vendorId: 'vendor-1',
    planId: starterPlan.id,
    planName: starterPlan.name,
    priceMonthly: 0,
    billingPeriodMonths: 1,
    startDate: '2026-01-01T00:00:00.000Z',
    expiryDate: '2027-01-01T00:00:00.000Z',
    autoRenew: true,
    status: 'active',
    resourceAddons: addons,
  };
}

function branch(
  id: string,
  status: Branch['status'] = 'active',
  licenseStatus: Branch['licenseStatus'] = 'licensed',
): Branch {
  return {
    id,
    vendorId: 'vendor-1',
    name: id,
    code: id,
    address: 'Address',
    phone: 'Phone',
    isDefault: id === 'branch-1',
    licenseStatus,
    status,
    createdAt: now.toISOString(),
  };
}

test('tracks created, licensed, active, suspended and archived resources separately', () => {
  const counts = summarizeResources([
    branch('branch-1'),
    branch('branch-2', 'suspended'),
    branch('branch-3', 'archived'),
    branch('branch-4', 'active', 'unlicensed'),
  ]);

  assert.deepEqual(counts, {
    created: 4,
    licensed: 3,
    active: 2,
    suspended: 1,
    archived: 1,
    activeBillingUnits: 1,
    allowanceUsed: 2,
  });
});

test('enforces the base allowance and only active, unexpired paid add-ons extend it', () => {
  const activeAddon: ResourceAddonEntitlement = {
    id: 'addon-1',
    resourceType: 'branch',
    quantity: 1,
    status: 'active',
    startDate: '2026-01-01T00:00:00.000Z',
    expiryDate: '2026-12-31T00:00:00.000Z',
  };
  const suspendedAddon: ResourceAddonEntitlement = {
    ...activeAddon,
    id: 'addon-2',
    quantity: 5,
    status: 'suspended',
  };

  const secondBranch = evaluateResourceActivation({
    vendorId: 'vendor-1',
    resourceType: 'branch',
    plan: starterPlan,
    subscription: subscription([activeAddon, suspendedAddon]),
    resources: [branch('branch-1')],
    now,
  });
  assert.equal(secondBranch.allowed, true);
  assert.equal(secondBranch.totalAllowance, 2);

  const thirdBranch = evaluateResourceActivation({
    vendorId: 'vendor-1',
    resourceType: 'branch',
    plan: starterPlan,
    subscription: subscription([activeAddon, suspendedAddon]),
    resources: [branch('branch-1'), branch('branch-2')],
    now,
  });
  assert.equal(thirdBranch.allowed, false);
});

test('suspended resources retain their licence but cannot process transactions', () => {
  const suspended = branch('branch-1', 'suspended');
  const counts = summarizeResources([suspended]);

  assert.equal(counts.licensed, 1);
  assert.equal(counts.suspended, 1);
  assert.equal(counts.allowanceUsed, 1);
  assert.equal(canResourceProcessTransactions(suspended), false);
});

test('archived resources remain in created history but are excluded from allowance and billing units', () => {
  const counts = summarizeResources([branch('branch-1', 'archived')]);

  assert.equal(counts.created, 1);
  assert.equal(counts.archived, 1);
  assert.equal(counts.allowanceUsed, 0);
  assert.equal(counts.activeBillingUnits, 0);
});

test('a terminal must reference an existing active branch and cannot use a warehouse id', () => {
  const branches = [branch('branch-1'), branch('branch-2', 'suspended')];

  assert.equal(assertTerminalBelongsToActiveBranch('branch-1', branches).id, 'branch-1');
  assert.throws(
    () => assertTerminalBelongsToActiveBranch('warehouse-1', branches),
    /existing branch/,
  );
  assert.throws(
    () => assertTerminalBelongsToActiveBranch('branch-2', branches),
    /suspended or archived branch/,
  );
});

test('records entitlement checks, blocks and approved lifecycle events through one service', async () => {
  const events: ResourceEntitlementEvent[] = [];
  const service = new ResourceEntitlementService(async event => {
    events.push(event);
  });

  await assert.rejects(
    service.checkActivation({
      vendorId: 'vendor-1',
      resourceType: 'branch',
      plan: starterPlan,
      subscription: subscription(),
      resources: [branch('branch-1')],
      now,
    }),
    ResourceEntitlementError,
  );
  await service.recordActivationApproved('vendor-1', 'branch', 'branch-2', starterPlan.id);
  await service.recordLifecycleChange('vendor-1', 'branch', 'branch-2', 'suspended');
  await service.recordLifecycleChange('vendor-1', 'branch', 'branch-2', 'archived');

  assert.deepEqual(events.map(event => event.type), [
    'ENTITLEMENT_CHECKED',
    'RESOURCE_ACTIVATION_BLOCKED',
    'RESOURCE_ACTIVATION_APPROVED',
    'RESOURCE_SUSPENDED',
    'RESOURCE_ARCHIVED',
  ]);
});
