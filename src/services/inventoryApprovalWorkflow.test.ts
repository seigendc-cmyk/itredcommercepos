import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApprovalRequest,
  CriticalInventoryEntityType,
  WorkflowActor,
} from '../types';
import {
  completeApprovedRequestAtomically,
  createPendingInventoryRequest,
  decideInventoryRequest,
  InventoryWorkflowError,
  isSupplierReceiptAutoApproved,
} from './inventoryApprovalWorkflow';

const now = '2026-07-26T12:00:00.000Z';
const requester: WorkflowActor = {
  id: 'warehouse-1',
  name: 'Warehouse Staff',
  role: 'warehouse_staff',
};
const manager: WorkflowActor = {
  id: 'manager-1',
  name: 'Store Manager',
  role: 'manager',
};

function pendingRequest(
  entityType: CriticalInventoryEntityType = 'WAREHOUSE_TO_BRANCH_TRANSFER',
  actor: WorkflowActor = requester,
): ApprovalRequest {
  return createPendingInventoryRequest({
    id: 'approval-1',
    tenantId: 'vendor-1',
    vendorId: 'vendor-1',
    entityType,
    entityId: 'entity-1',
    type: 'stock_transfer',
    title: 'Inventory request',
    description: 'Test request',
    requesterId: actor.id,
    requesterName: actor.name,
    requesterRole: actor.role,
    requester: actor,
    dataPayload: {
      sourceType: 'warehouse',
      sourceId: 'warehouse-1',
      targetBranchId: 'branch-1',
      items: [{ productId: 'product-1', productName: 'Product', quantity: 2 }],
    },
    segregationOfDuties: true,
    notificationAudienceRoles: ['sysadmin', 'manager'],
  }, now);
}

test('enforces submit and approval roles', () => {
  const cashier: WorkflowActor = { id: 'cashier-1', name: 'Cashier', role: 'cashier' };
  assert.throws(
    () => pendingRequest('WAREHOUSE_TO_BRANCH_TRANSFER', cashier),
    (error: unknown) => error instanceof InventoryWorkflowError && error.code === 'unauthorized',
  );

  const request = pendingRequest();
  assert.equal(
    decideInventoryRequest(request, 'APPROVED', manager, request.version, 'Checked', now).status,
    'APPROVED',
  );
});

test('supplier receipt auto approval requires an explicit active role policy', () => {
  assert.equal(
    isSupplierReceiptAutoApproved(requester, {
      segregationOfDuties: true,
      supplierReceiptAutoApprovalRoles: [],
    }),
    false,
  );
  assert.equal(
    isSupplierReceiptAutoApproved(requester, {
      segregationOfDuties: true,
      supplierReceiptAutoApprovalRoles: ['warehouse_staff'],
    }),
    true,
  );
});

test('prevents self approval when segregation of duties is enabled', () => {
  const managerRequest = pendingRequest('SUPPLIER_STOCK_RECEIPT', manager);
  assert.throws(
    () => decideInventoryRequest(managerRequest, 'APPROVED', manager, managerRequest.version, 'Self approved', now),
    (error: unknown) =>
      error instanceof InventoryWorkflowError && error.code === 'self_approval_forbidden',
  );
});

test('prevents duplicate approval and stale decisions', () => {
  const request = pendingRequest();
  const approved = decideInventoryRequest(request, 'APPROVED', manager, request.version, 'Approved', now);
  assert.throws(
    () => decideInventoryRequest(approved, 'APPROVED', manager, approved.version, 'Again', now),
    (error: unknown) => error instanceof InventoryWorkflowError && error.code === 'duplicate_decision',
  );
  assert.throws(
    () => decideInventoryRequest(request, 'REJECTED', manager, request.version + 1, 'Stale', now),
    (error: unknown) => error instanceof InventoryWorkflowError && error.code === 'stale_decision',
  );
});

test('rejection records the decision without invoking inventory completion', () => {
  const request = pendingRequest();
  const rejected = decideInventoryRequest(request, 'REJECTED', manager, request.version, 'Invalid manifest', now);
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.reason, 'Invalid manifest');
  assert.equal(rejected.approver?.id, manager.id);
});

test('requester may cancel a pending request without inventory completion', () => {
  const request = pendingRequest();
  const cancelled = decideInventoryRequest(request, 'CANCELLED', requester, request.version, 'No longer required', now);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.outcome, 'CANCELLED');
});

test('atomic completion rolls back inventory effects when processing fails', async () => {
  const request = pendingRequest();
  const approved = decideInventoryRequest(request, 'APPROVED', manager, request.version, 'Approved', now);
  const stock = { warehouse: 5, branch: 0 };

  await assert.rejects(
    completeApprovedRequestAtomically(approved, now, async (processing, _complete) => {
      const working = { ...stock };
      working.warehouse -= 2;
      working.branch += 2;
      assert.equal(processing.status, 'PROCESSING');
      throw new Error('Injected write failure');
    }),
    /Injected write failure/,
  );
  assert.deepEqual(stock, { warehouse: 5, branch: 0 });

  const result = await completeApprovedRequestAtomically(approved, now, async (_processing, complete) => {
    const working = { ...stock };
    working.warehouse -= 2;
    working.branch += 2;
    Object.assign(stock, working);
    return complete();
  });
  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(stock, { warehouse: 3, branch: 2 });
});
