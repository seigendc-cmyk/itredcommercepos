import assert from 'node:assert/strict';
import test from 'node:test';
import { ApprovalRequest, StaffMember } from '../../types';
import { filterApprovalRequests, validateApprovalDecision } from './approvalDeskPolicy';

const staff: StaffMember = {
  id: 'manager-1', vendorId: 'vendor-1', name: 'Manager', email: 'm@example.test',
  role: 'manager', grantedMenuIds: ['approvals'], status: 'active', createdAt: '2026-01-01',
};
const request = {
  id: 'a1', tenantId: 'vendor-1', vendorId: 'vendor-1',
  entityType: 'WAREHOUSE_TO_BRANCH_TRANSFER', entityId: 't1', type: 'stock_transfer',
  title: 'Transfer', description: 'Review transfer', requesterId: 'staff-1',
  requesterName: 'Staff', requesterRole: 'warehouse_staff',
  requester: { id: 'staff-1', name: 'Staff', role: 'warehouse_staff' },
  dataPayload: {}, status: 'PENDING_APPROVAL', version: 1, segregationOfDuties: true,
  notificationAudienceRoles: ['manager'], requestedAt: '2026-01-01',
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
} satisfies ApprovalRequest;

test('approval filters enforce vendor visibility and assigned role access', () => {
  const otherVendor = { ...request, id: 'a2', vendorId: 'vendor-2', tenantId: 'vendor-2' };
  assert.deepEqual(filterApprovalRequests([request, otherVendor], 'MY_PENDING', staff).map(item => item.id), ['a1']);
  assert.deepEqual(filterApprovalRequests([request], 'SUBMITTED_BY_ME', staff), []);
});

test('rejection requires an explicit reason and service rejection is not represented as success', () => {
  assert.equal(validateApprovalDecision(request, 'REJECTED', '', staff), 'A reason is required for rejection or cancellation.');
  assert.equal(validateApprovalDecision(request, 'REJECTED', 'Incorrect quantities', staff), undefined);
});
