import {
  BillingPlan,
  Branch,
  ResourceAddonEntitlement,
  ResourceLifecycleStatus,
  ResourceLicenseStatus,
  ResourceType,
  Terminal,
  VendorSubscription,
  Warehouse,
} from '../types';

export type EntitledResource = Warehouse | Branch | Terminal;

export interface ResourceAllowanceSummary {
  created: number;
  licensed: number;
  active: number;
  suspended: number;
  archived: number;
  activeBillingUnits: number;
  allowanceUsed: number;
}

export interface ResourceEntitlementDecision {
  allowed: boolean;
  resourceType: ResourceType;
  baseAllowance: number;
  addonAllowance: number;
  totalAllowance: number;
  counts: ResourceAllowanceSummary;
  planId: string;
  message: string;
}

export type ResourceEntitlementEventType =
  | 'ENTITLEMENT_CHECKED'
  | 'RESOURCE_ACTIVATION_APPROVED'
  | 'RESOURCE_ACTIVATION_BLOCKED'
  | 'RESOURCE_SUSPENDED'
  | 'RESOURCE_ARCHIVED';

export interface ResourceEntitlementEvent {
  type: ResourceEntitlementEventType;
  vendorId: string;
  resourceType: ResourceType;
  resourceId?: string;
  planId?: string;
  details: Record<string, unknown>;
}

export interface EntitlementCheckInput {
  vendorId: string;
  resourceType: ResourceType;
  plan: BillingPlan;
  subscription: VendorSubscription;
  resources: EntitledResource[];
  now?: Date;
}

export class ResourceEntitlementError extends Error {
  readonly code = 'resource_entitlement_required';
  readonly decision: ResourceEntitlementDecision;

  constructor(decision: ResourceEntitlementDecision) {
    super(decision.message);
    this.name = 'ResourceEntitlementError';
    this.decision = decision;
  }
}

const LEGACY_PLAN_LIMITS: Record<string, Record<ResourceType, number>> = {
  starter_free: { warehouse: 1, branch: 1, terminal: 2 },
  pro_commerce: { warehouse: 1, branch: 3, terminal: 999 },
  pro_delivery: { warehouse: 1, branch: 3, terminal: 999 },
  enterprise_fleet: { warehouse: 999, branch: 20, terminal: 999 },
};

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) >= 0 ? Math.floor(Number(value)) : fallback;
}

export function getResourceLifecycleStatus(resource: EntitledResource): ResourceLifecycleStatus {
  return resource.status === 'inactive' ? 'suspended' : resource.status || 'active';
}

export function getResourceLicenseStatus(resource: EntitledResource): ResourceLicenseStatus {
  return resource.licenseStatus || 'licensed';
}

export function summarizeResources(resources: EntitledResource[]): ResourceAllowanceSummary {
  const summary: ResourceAllowanceSummary = {
    created: resources.length,
    licensed: 0,
    active: 0,
    suspended: 0,
    archived: 0,
    activeBillingUnits: 0,
    allowanceUsed: 0,
  };

  for (const resource of resources) {
    const lifecycle = getResourceLifecycleStatus(resource);
    const licensed = getResourceLicenseStatus(resource) === 'licensed';

    if (licensed) summary.licensed += 1;
    summary[lifecycle] += 1;
    if (licensed && lifecycle === 'active') summary.activeBillingUnits += 1;
    if (licensed && lifecycle !== 'archived') summary.allowanceUsed += 1;
  }

  return summary;
}

export function getBaseResourceAllowance(plan: BillingPlan, resourceType: ResourceType): number {
  const legacy = LEGACY_PLAN_LIMITS[plan.id] || LEGACY_PLAN_LIMITS.starter_free;
  if (resourceType === 'warehouse') {
    return positiveInteger(plan.maxWarehouses, legacy.warehouse);
  }
  if (resourceType === 'terminal') {
    return positiveInteger(plan.maxTerminals, legacy.terminal);
  }
  return positiveInteger(plan.maxBranches, legacy.branch);
}

export function getActiveAddonAllowance(
  addons: ResourceAddonEntitlement[] | undefined,
  resourceType: ResourceType,
  now = new Date(),
): number {
  return (addons || []).reduce((total, addon) => {
    if (
      addon.resourceType !== resourceType ||
      addon.status !== 'active' ||
      addon.quantity <= 0 ||
      (addon.expiryDate && new Date(addon.expiryDate).getTime() <= now.getTime())
    ) {
      return total;
    }
    return total + Math.floor(addon.quantity);
  }, 0);
}

export function evaluateResourceActivation(input: EntitlementCheckInput): ResourceEntitlementDecision {
  const counts = summarizeResources(input.resources);
  const baseAllowance = getBaseResourceAllowance(input.plan, input.resourceType);
  const addonAllowance = getActiveAddonAllowance(
    input.subscription.resourceAddons,
    input.resourceType,
    input.now,
  );
  const totalAllowance = baseAllowance + addonAllowance;
  const subscriptionActive =
    (input.subscription.status === 'active' || input.subscription.status === 'expiring_soon') &&
    new Date(input.subscription.expiryDate).getTime() > (input.now || new Date()).getTime();
  const allowed = subscriptionActive && counts.allowanceUsed < totalAllowance;
  const label = input.resourceType === 'terminal' ? 'POS terminal' : input.resourceType;
  const message = allowed
    ? `${label} activation is covered by the active ${input.plan.name} entitlement.`
    : !subscriptionActive
      ? `An active subscription is required to activate another ${label}.`
      : `Your ${input.plan.name} plan includes ${totalAllowance} licensed ${label}${totalAllowance === 1 ? '' : 's'}. Upgrade the plan or activate a paid ${label} add-on to create another.`;

  return {
    allowed,
    resourceType: input.resourceType,
    baseAllowance,
    addonAllowance,
    totalAllowance,
    counts,
    planId: input.plan.id,
    message,
  };
}

export function canResourceProcessTransactions(resource: EntitledResource): boolean {
  return getResourceLicenseStatus(resource) === 'licensed' && getResourceLifecycleStatus(resource) === 'active';
}

export function assertTerminalBelongsToActiveBranch(
  branchId: string,
  branches: Branch[],
): Branch {
  const branch = branches.find(candidate => candidate.id === branchId);
  if (!branch) {
    throw new Error('A POS terminal must be assigned to an existing branch.');
  }
  if (!canResourceProcessTransactions(branch)) {
    throw new Error('A POS terminal cannot be assigned to a suspended or archived branch.');
  }
  return branch;
}

export class ResourceEntitlementService {
  constructor(
    private readonly recordEvent: (event: ResourceEntitlementEvent) => Promise<void>,
  ) {}

  async checkActivation(input: EntitlementCheckInput): Promise<ResourceEntitlementDecision> {
    const decision = evaluateResourceActivation(input);
    await this.recordEvent({
      type: 'ENTITLEMENT_CHECKED',
      vendorId: input.vendorId,
      resourceType: input.resourceType,
      planId: input.plan.id,
      details: { ...decision },
    });

    if (!decision.allowed) {
      await this.recordEvent({
        type: 'RESOURCE_ACTIVATION_BLOCKED',
        vendorId: input.vendorId,
        resourceType: input.resourceType,
        planId: input.plan.id,
        details: { ...decision },
      });
      throw new ResourceEntitlementError(decision);
    }

    return decision;
  }

  async recordActivationApproved(
    vendorId: string,
    resourceType: ResourceType,
    resourceId: string,
    planId: string,
  ): Promise<void> {
    await this.recordEvent({
      type: 'RESOURCE_ACTIVATION_APPROVED',
      vendorId,
      resourceType,
      resourceId,
      planId,
      details: { licenseStatus: 'licensed', status: 'active' },
    });
  }

  async recordLifecycleChange(
    vendorId: string,
    resourceType: ResourceType,
    resourceId: string,
    status: Extract<ResourceLifecycleStatus, 'suspended' | 'archived'>,
  ): Promise<void> {
    await this.recordEvent({
      type: status === 'suspended' ? 'RESOURCE_SUSPENDED' : 'RESOURCE_ARCHIVED',
      vendorId,
      resourceType,
      resourceId,
      details: { status },
    });
  }
}
