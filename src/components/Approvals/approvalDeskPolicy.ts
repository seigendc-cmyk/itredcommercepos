import { ApprovalRequest, StaffMember } from '../../types';

export type ApprovalDeskFilter =
  | 'MY_PENDING'
  | 'SUBMITTED_BY_ME'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'ALL';

export function canViewApproval(request: ApprovalRequest, staff: StaffMember): boolean {
  return request.vendorId === staff.vendorId && (
    request.requesterId === staff.id ||
    request.notificationAudienceRoles.includes(staff.role)
  );
}

export function filterApprovalRequests(
  requests: ApprovalRequest[],
  filter: ApprovalDeskFilter,
  staff: StaffMember,
): ApprovalRequest[] {
  return requests.filter(request => {
    if (!canViewApproval(request, staff)) return false;
    if (filter === 'ALL') return true;
    if (filter === 'MY_PENDING') {
      return request.status === 'PENDING_APPROVAL' &&
        request.notificationAudienceRoles.includes(staff.role);
    }
    if (filter === 'SUBMITTED_BY_ME') return request.requesterId === staff.id;
    return request.status === filter;
  });
}

export function validateApprovalDecision(
  request: ApprovalRequest,
  decision: 'APPROVED' | 'REJECTED' | 'CANCELLED',
  reason: string,
  staff: StaffMember,
): string | undefined {
  if (!canViewApproval(request, staff)) return 'You do not have access to this approval request.';
  if (request.status !== 'PENDING_APPROVAL') return 'This request has already been decided.';
  if (decision !== 'CANCELLED' && request.segregationOfDuties && request.requesterId === staff.id) {
    return 'Segregation of duties prevents you from deciding your own request.';
  }
  if ((decision === 'REJECTED' || decision === 'CANCELLED') && !reason.trim()) {
    return 'A reason is required for rejection or cancellation.';
  }
  return undefined;
}
