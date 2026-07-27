import {
  ApprovalRequest,
  CriticalInventoryEntityType,
  InventoryApprovalPolicy,
  InventoryWorkflowStatus,
  StaffRole,
  WorkflowActor,
} from '../types';

export type ApprovalDecision = 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface InventoryWorkflowPolicy {
  submitRoles: StaffRole[];
  approveRoles: StaffRole[];
  cancelRoles: StaffRole[];
}

export const DEFAULT_INVENTORY_APPROVAL_POLICY: InventoryApprovalPolicy = {
  segregationOfDuties: true,
  supplierReceiptAutoApprovalRoles: [],
};

export const INVENTORY_WORKFLOW_POLICIES: Record<CriticalInventoryEntityType, InventoryWorkflowPolicy> = {
  WAREHOUSE_TO_BRANCH_TRANSFER: {
    submitRoles: ['sysadmin', 'manager', 'warehouse_staff'],
    approveRoles: ['sysadmin', 'manager'],
    cancelRoles: ['sysadmin', 'manager', 'warehouse_staff'],
  },
  BRANCH_TO_BRANCH_TRANSFER: {
    submitRoles: ['sysadmin', 'manager', 'warehouse_staff'],
    approveRoles: ['sysadmin', 'manager'],
    cancelRoles: ['sysadmin', 'manager', 'warehouse_staff'],
  },
  SUPPLIER_STOCK_RECEIPT: {
    submitRoles: ['sysadmin', 'manager', 'warehouse_staff'],
    approveRoles: ['sysadmin', 'manager'],
    cancelRoles: ['sysadmin', 'manager', 'warehouse_staff'],
  },
  PURCHASE_ORDER_CANCELLATION: {
    submitRoles: ['sysadmin', 'manager', 'warehouse_staff'],
    approveRoles: ['sysadmin', 'manager'],
    cancelRoles: ['sysadmin', 'manager'],
  },
  OPENING_BALANCE_ADJUSTMENT: {
    submitRoles: ['sysadmin', 'manager', 'warehouse_staff'],
    approveRoles: ['sysadmin', 'manager'],
    cancelRoles: ['sysadmin', 'manager', 'warehouse_staff'],
  },
  STOCKTAKE_ADJUSTMENT: {
    submitRoles: ['sysadmin', 'manager', 'warehouse_staff'],
    approveRoles: ['sysadmin', 'manager'],
    cancelRoles: ['sysadmin', 'manager', 'warehouse_staff'],
  },
};

export class InventoryWorkflowError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'self_approval_forbidden'
      | 'stale_decision'
      | 'duplicate_decision'
      | 'invalid_transition',
    message: string,
  ) {
    super(message);
    this.name = 'InventoryWorkflowError';
  }
}

function requireRole(actor: WorkflowActor, allowed: StaffRole[], action: string): void {
  if (!allowed.includes(actor.role)) {
    throw new InventoryWorkflowError(
      'unauthorized',
      `${actor.role.replace('_', ' ')} is not authorised to ${action}.`,
    );
  }
}

export function assertCanSubmitInventoryRequest(
  entityType: CriticalInventoryEntityType,
  actor: WorkflowActor,
): void {
  requireRole(actor, INVENTORY_WORKFLOW_POLICIES[entityType].submitRoles, `submit ${entityType.toLowerCase()}`);
}

export function isSupplierReceiptAutoApproved(
  actor: WorkflowActor,
  policy: InventoryApprovalPolicy,
): boolean {
  return policy.supplierReceiptAutoApprovalRoles.includes(actor.role);
}

export function createPendingInventoryRequest(
  input: Omit<ApprovalRequest, 'status' | 'version' | 'requestedAt' | 'createdAt' | 'updatedAt'>,
  now: string,
): ApprovalRequest {
  assertCanSubmitInventoryRequest(input.entityType, input.requester);
  return {
    ...input,
    status: 'PENDING_APPROVAL',
    version: 1,
    requestedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function decideInventoryRequest(
  request: ApprovalRequest,
  decision: ApprovalDecision,
  actor: WorkflowActor,
  expectedVersion: number,
  reason: string,
  now: string,
): ApprovalRequest {
  if (request.version !== expectedVersion) {
    throw new InventoryWorkflowError('stale_decision', 'This approval changed after it was opened. Refresh and review it again.');
  }
  if (request.status !== 'PENDING_APPROVAL') {
    throw new InventoryWorkflowError('duplicate_decision', `This request is already ${request.status.toLowerCase()}.`);
  }

  const policy = INVENTORY_WORKFLOW_POLICIES[request.entityType];
  if (decision === 'CANCELLED') {
    requireRole(actor, policy.cancelRoles, `cancel ${request.entityType.toLowerCase()}`);
    if (actor.id !== request.requesterId && !policy.approveRoles.includes(actor.role)) {
      throw new InventoryWorkflowError('unauthorized', 'Only the requester or an authorised approver may cancel this request.');
    }
  } else {
    requireRole(actor, policy.approveRoles, `${decision === 'APPROVED' ? 'approve' : 'reject'} ${request.entityType.toLowerCase()}`);
    if (request.segregationOfDuties && actor.id === request.requesterId) {
      throw new InventoryWorkflowError('self_approval_forbidden', 'Segregation of duties prevents requesters from deciding their own transaction.');
    }
  }

  const status: InventoryWorkflowStatus = decision;
  return {
    ...request,
    status,
    version: request.version + 1,
    approver: actor,
    reviewedBy: actor.id,
    reviewedByName: actor.name,
    reviewedAt: now,
    reviewComment: reason,
    decisionAt: now,
    outcome: status,
    reason,
    updatedAt: now,
  };
}

export function markInventoryRequestProcessing(
  request: ApprovalRequest,
  now: string,
): ApprovalRequest {
  if (request.status !== 'APPROVED') {
    throw new InventoryWorkflowError('invalid_transition', 'Only an approved request can begin processing.');
  }
  return { ...request, status: 'PROCESSING', version: request.version + 1, updatedAt: now };
}

export function markInventoryRequestCompleted(
  request: ApprovalRequest,
  now: string,
): ApprovalRequest {
  if (request.status !== 'PROCESSING') {
    throw new InventoryWorkflowError('invalid_transition', 'Only a processing request can complete.');
  }
  return {
    ...request,
    status: 'COMPLETED',
    outcome: 'COMPLETED',
    version: request.version + 1,
    updatedAt: now,
  };
}

export async function completeApprovedRequestAtomically<T>(
  request: ApprovalRequest,
  now: string,
  runAtomic: (
    processing: ApprovalRequest,
    complete: () => ApprovalRequest,
  ) => Promise<T>,
): Promise<T> {
  const processing = markInventoryRequestProcessing(request, now);
  return runAtomic(processing, () => markInventoryRequestCompleted(processing, now));
}
