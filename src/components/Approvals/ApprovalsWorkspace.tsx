import React, { useState } from 'react';
import { CheckCircle2, Clock, ShieldAlert, User, XCircle } from 'lucide-react';
import { ApprovalRequest, StaffMember } from '../../types';
import { Button, Notice, PageHeader, Surface } from '../Common/ui';
import {
  ApprovalDeskFilter,
  filterApprovalRequests,
  validateApprovalDecision,
} from './approvalDeskPolicy';

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

export function ApprovalsWorkspace({
  approvalRequests,
  activeStaff,
  onReviewRequest,
}: ApprovalsWorkspaceProps) {
  const [filter, setFilter] = useState<ApprovalDeskFilter>('MY_PENDING');
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const visibleRequests = filterApprovalRequests(approvalRequests, filter, activeStaff);
  const pendingCount = approvalRequests.filter(
    request =>
      request.vendorId === activeStaff.vendorId &&
      request.status === 'PENDING_APPROVAL' &&
      request.notificationAudienceRoles.includes(activeStaff.role),
  ).length;

  const handleReview = async (
    request: ApprovalRequest,
    decision: 'APPROVED' | 'REJECTED' | 'CANCELLED',
  ) => {
    const comment = reviewComment[request.id] || '';
    const validationError = validateApprovalDecision(request, decision, comment, activeStaff);
    if (validationError) {
      setFeedback({ tone: 'error', message: validationError });
      return;
    }
    setIsSubmitting(request.id);
    setFeedback(null);
    try {
      await onReviewRequest(
        request.id,
        decision,
        request.version,
        comment,
      );
      setReviewComment(previous => ({ ...previous, [request.id]: '' }));
      setFeedback({ tone: 'success', message: 'The approval decision was recorded.' });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The approval decision failed.',
      });
    } finally {
      setIsSubmitting(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Desk"
        description="Review controlled inventory requests before any atomic stock movement."
        context={`${activeStaff.name} · ${activeStaff.role}`}
        notificationCount={pendingCount}
      />
      {feedback && <Notice tone={feedback.tone}>{feedback.message}</Notice>}
      <Surface className="p-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Approval filters">
          {([
            ['MY_PENDING', `My pending (${pendingCount})`],
            ['SUBMITTED_BY_ME', 'Submitted by me'],
            ['APPROVED', 'Approved'],
            ['COMPLETED', 'Completed'],
            ['REJECTED', 'Rejected'],
            ['CANCELLED', 'Cancelled'],
            ['ALL', 'All history'],
          ] as [ApprovalDeskFilter, string][]).map(([value, label]) => (
            <Button
              key={value}
              onClick={() => setFilter(value)}
              variant={filter === value ? 'secondary' : 'quiet'}
              size="sm"
              aria-pressed={filter === value}
            >
              {label}
            </Button>
          ))}
        </div>
      </Surface>

      {pendingCount === 0 && (
        <Notice className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-slate-500" />
          No pending inventory notifications are assigned to {activeStaff.name} ({activeStaff.role}).
        </Notice>
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
            <Surface key={request.id} className="space-y-4 p-4 sm:p-5">
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
                      <Button
                        disabled={isSubmitting === request.id}
                        onClick={() => handleReview(request, 'CANCELLED')}
                        variant="quiet" size="sm"
                      >
                        Cancel
                      </Button>
                    )}
                    {canApprove && (
                      <>
                        <Button
                          disabled={isSubmitting === request.id}
                          onClick={() => handleReview(request, 'REJECTED')}
                          variant="danger" size="sm"
                        >
                          Reject
                        </Button>
                        <Button
                          disabled={isSubmitting === request.id}
                          onClick={() => handleReview(request, 'APPROVED')}
                          loading={isSubmitting === request.id} size="sm"
                        >
                          Authorise & Process
                        </Button>
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
            </Surface>
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
