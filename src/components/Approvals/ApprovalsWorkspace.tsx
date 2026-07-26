import React, { useState } from 'react';
import { ApprovalRequest, StaffMember, Branch } from '../../types';
import { 
  CheckSquare, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  ArrowRight, 
  ShieldAlert, 
  User, 
  FileText,
  Building,
  Sparkles
} from 'lucide-react';

interface ApprovalsWorkspaceProps {
  vendorId: string;
  approvalRequests: ApprovalRequest[];
  activeStaff: StaffMember;
  onReviewRequest: (
    requestId: string,
    status: 'approved' | 'rejected',
    comment?: string
  ) => Promise<void>;
}

export function ApprovalsWorkspace({
  vendorId,
  approvalRequests,
  activeStaff,
  onReviewRequest,
}: ApprovalsWorkspaceProps) {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);

  const canApprove = activeStaff.role === 'sysadmin' || activeStaff.role === 'manager';

  const filteredRequests = approvalRequests.filter(r => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const pendingCount = approvalRequests.filter(r => r.status === 'pending').length;

  const handleReview = async (requestId: string, status: 'approved' | 'rejected') => {
    setIsSubmitting(requestId);
    try {
      await onReviewRequest(requestId, status, reviewComment[requestId] || '');
      setReviewComment(prev => ({ ...prev, [requestId]: '' }));
    } catch (e) {
      console.error(e);
      alert('Error reviewing approval request.');
    } finally {
      setIsSubmitting(null);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-[#FF6B00]" />
            <h1 className="text-lg font-bold text-[#333333]">Transaction Notifications & Approvals Flow</h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Strict governance review process for critical business transactions (stock damage, large transfers, manual price changes).
          </p>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded">
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
              filter === 'pending' ? 'bg-[#333333] text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
              filter === 'approved' ? 'bg-[#333333] text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Approved
          </button>
          <button
            onClick={() => setFilter('rejected')}
            className={`px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
              filter === 'rejected' ? 'bg-[#333333] text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Rejected
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
              filter === 'all' ? 'bg-[#333333] text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All History
          </button>
        </div>
      </div>

      {!canApprove && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>You are currently viewing as <strong>{activeStaff.name} ({activeStaff.role})</strong>. Approval and rejection rights are restricted to Store Managers and Sysadmins.</span>
        </div>
      )}

      {/* Requests List */}
      <div className="space-y-4">
        {filteredRequests.map(req => {
          const isPending = req.status === 'pending';
          const isApproved = req.status === 'approved';
          const isRejected = req.status === 'rejected';

          return (
            <div
              key={req.id}
              className={`bg-white rounded-lg border p-5 shadow-sm space-y-4 transition-all ${
                isPending 
                  ? 'border-orange-200 ring-1 ring-orange-500/10' 
                  : isApproved 
                  ? 'border-green-200 bg-green-50/10' 
                  : 'border-red-200 bg-red-50/10'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded flex items-center justify-center shrink-0 ${
                    isPending ? 'bg-orange-50 text-[#FF6B00]' : isApproved ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {isPending ? <Clock className="w-5 h-5" /> : isApproved ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm text-[#333333]">{req.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isPending ? 'bg-amber-100 text-amber-800' : isApproved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {req.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{req.description}</p>
                  </div>
                </div>

                <div className="text-xs text-gray-400 font-medium md:text-right shrink-0">
                  <p className="flex items-center md:justify-end gap-1"><User className="w-3.5 h-3.5" /> Requester: <span className="font-bold text-gray-700">{req.requesterName}</span> ({req.requesterRole})</p>
                  <p className="text-[11px] mt-0.5">{new Date(req.createdAt).toLocaleString()}</p>
                </div>
              </div>

              {/* Data Payload Details */}
              {req.dataPayload && (
                <div className="bg-gray-50 p-3 rounded border border-gray-100 text-xs space-y-2">
                  <div className="flex items-center justify-between font-bold text-gray-700">
                    <span className="uppercase text-[10px] tracking-wider text-gray-400">Transaction Payload Details</span>
                    {req.branchName && <span>Location: {req.branchName}</span>}
                  </div>

                  {req.dataPayload.items && Array.isArray(req.dataPayload.items) && (
                    <div className="space-y-1 divide-y divide-gray-200/60">
                      {req.dataPayload.items.map((item: any, idx: number) => (
                        <div key={idx} className="pt-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-[#333333]">{item.productName || item.productId}</span>
                          <span className={`font-bold ${item.quantityDelta < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {item.quantityDelta > 0 ? `+${item.quantityDelta}` : item.quantityDelta} units
                            {item.reason && <span className="text-gray-400 font-normal"> ({item.reason})</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Review Section */}
              {isPending && canApprove && (
                <div className="pt-2 flex flex-col md:flex-row items-stretch md:items-center gap-3">
                  <input
                    type="text"
                    value={reviewComment[req.id] || ''}
                    onChange={e => setReviewComment({ ...reviewComment, [req.id]: e.target.value })}
                    placeholder="Enter review notes or approval comment..."
                    className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-[#FF6B00] focus:outline-none"
                  />

                  <div className="flex items-center gap-2">
                    <button
                      disabled={isSubmitting === req.id}
                      onClick={() => handleReview(req.id, 'rejected')}
                      className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>

                    <button
                      disabled={isSubmitting === req.id}
                      onClick={() => handleReview(req.id, 'approved')}
                      className="px-4 py-1.5 bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold text-xs rounded shadow transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Authorize & Approve</span>
                    </button>
                  </div>
                </div>
              )}

              {!isPending && (
                <div className="pt-2 border-t border-gray-100 text-xs text-gray-500 flex items-center justify-between">
                  <span>Reviewed by: <strong>{req.reviewedByName || 'Manager'}</strong> ({new Date(req.reviewedAt || req.createdAt).toLocaleString()})</span>
                  <span className="italic text-gray-600">"{req.reviewComment}"</span>
                </div>
              )}

            </div>
          );
        })}

        {filteredRequests.length === 0 && (
          <div className="py-12 bg-white rounded-lg border border-gray-100 text-center text-gray-400 space-y-2">
            <CheckSquare className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="text-xs font-semibold text-gray-500">No approval requests found in this view.</p>
          </div>
        )}
      </div>

    </div>
  );
}
