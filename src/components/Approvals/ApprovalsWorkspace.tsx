import React, { useState } from 'react';
import { CheckCircle2, CheckSquare, Clock, ShieldAlert, User, XCircle } from 'lucide-react';
import { ApprovalRequest, StaffMember } from '../../types';

interface ApprovalsWorkspaceProps {
  vendorId: string;
  approvalRequests: ApprovalRequest[];
  activeStaff: StaffMember;
  onReviewRequest: (
    requestId: string,
    status: 'APPROVED' | 'REJECTED' | 'CANCELLED',
    expectedVersion: number,
    comment?: string,
  ) => Promise<void>;
}

type ApprovalFilter = 'PENDING_APPROVAL' | 'COMPLETED' | 'REJECTED' | 'all';

export function ApprovalsWorkspace({
  approvalRequests,
  activeStaff,
  onReviewRequest,
}: ApprovalsWorkspaceProps) {
  const [filter, setFilter] = useState<ApprovalFilter>('PENDING_APPROVAL');
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const visibleRequests = approvalRequests.filter(request => {
    const visible =
      request.notificationAudienceRoles.includes(activeStaff.role) ||
      request.requesterId === activeStaff.id;
    return visible && (filter === 'all' || request.status === filter);
  });
  const pendingCount = approvalRequests.filter(
    request =>
      request.status === 'PENDING_APPROVAL' &&
      request.notificationAudienceRoles.includes(activeStaff.role),
  ).length;

  const handleReview = async (
    request: ApprovalRequest,
    decision: 'APPROVED' | 'REJECTED' | 'CANCELLED',
  ) => {
    setIsSubmitting(request.id);
    try {
      await onReviewRequest(
        request.id,
        decision,
        request.version,
        reviewComment[request.id] || '',
      );
      setReviewComment(previous => ({ ...previous, [request.id]: '' }));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'The approval decision failed.');
    } finally {
      setIsSubmitting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-[#FF6B00]" />
            <h1 className="text-lg font-bold text-[#333333]">Transaction Notifications & Approvals Flow</h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Authorised inventory requests are reviewed here before any atomic stock movement.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded">
          {([
            ['PENDING_APPROVAL', `Pending (${pendingCount})`],
            ['COMPLETED', 'Completed'],
            ['REJECTED', 'Rejected'],
            ['all', 'All History'],
          ] as [ApprovalFilter, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1 rounded text-xs font-bold ${
                filter === value ? 'bg-[#333333] text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {pendingCount === 0 && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-slate-500" />
          No pending inventory notifications are assigned to {activeStaff.name} ({activeStaff.role}).
        </div>
      )}

      <div className="space-y-4">
        {visibleRequests.map(request => {
          const pending = request.status === 'PENDING_APPROVAL';
          const completed = request.status === 'COMPLETED';
          const canApprove =
            request.notificationAudienceRoles.includes(activeStaff.role) &&
            (!request.segregationOfDuties || request.requesterId !== activeStaff.id);
          const canCancel =
            request.requesterId === activeStaff.id ||
            request.notificationAudienceRoles.includes(activeStaff.role);

          return (
            <div key={request.id} className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded flex items-center justify-center ${
                    pending ? 'bg-orange-50 text-[#FF6B00]' : completed ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {pending ? <Clock className="w-5 h-5" /> : completed ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#333333]">{request.title}</h3>
                    <p className="text-xs text-gray-500">{request.description}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold">
                      {request.status}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-gray-500 md:text-right">
                  <p className="flex items-center md:justify-end gap-1">
                    <User className="w-3.5 h-3.5" />
                    Requester: <strong>{request.requesterName}</strong> ({request.requesterRole})
                  </p>
                  <p>{new Date(request.requestedAt).toLocaleString()} · version {request.version}</p>
                </div>
              </div>

              {request.dataPayload.items && (
                <div className="bg-gray-50 p-3 rounded border border-gray-100 text-xs space-y-1">
                  {request.dataPayload.items.map((item, index) => {
                    const quantity = item.quantityDelta ?? item.quantity ?? 0;
                    return (
                      <div key={`${item.productId}_${index}`} className="flex justify-between">
                        <span>{item.productName}</span>
                        <span className={quantity < 0 ? 'font-bold text-red-600' : 'font-bold text-green-600'}>
                          {quantity > 0 ? '+' : ''}{quantity} units
                          {item.reason ? ` (${item.reason})` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {pending && (canApprove || canCancel) && (
                <div className="pt-2 flex flex-col md:flex-row gap-3">
                  <input
                    value={reviewComment[request.id] || ''}
                    onChange={event => setReviewComment({
                      ...reviewComment,
                      [request.id]: event.target.value,
                    })}
                    placeholder="Decision reason"
                    className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded"
                  />
                  <div className="flex gap-2">
                    {canCancel && (
                      <button
                        disabled={isSubmitting === request.id}
                        onClick={() => handleReview(request, 'CANCELLED')}
                        className="px-4 py-1.5 bg-slate-600 text-white font-bold text-xs rounded disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                    {canApprove && (
                      <>
                        <button
                          disabled={isSubmitting === request.id}
                          onClick={() => handleReview(request, 'REJECTED')}
                          className="px-4 py-1.5 bg-red-600 text-white font-bold text-xs rounded disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          disabled={isSubmitting === request.id}
                          onClick={() => handleReview(request, 'APPROVED')}
                          className="px-4 py-1.5 bg-[#FF6B00] text-white font-bold text-xs rounded disabled:opacity-50"
                        >
                          Authorise & Process
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {!pending && request.decisionAt && (
                <div className="pt-2 border-t text-xs text-gray-500 flex justify-between">
                  <span>Decision by <strong>{request.approver?.name || request.reviewedByName}</strong> at {new Date(request.decisionAt).toLocaleString()}</span>
                  <span>{request.reason}</span>
                </div>
              )}
            </div>
          );
        })}

        {visibleRequests.length === 0 && (
          <div className="py-12 bg-white rounded-lg border text-center text-xs text-gray-500">
            No approval requests found in this view.
          </div>
        )}
      </div>
    </div>
  );
}
