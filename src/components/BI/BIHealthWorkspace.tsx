import React from 'react';
import { BIEvent } from '../../bi/types';
import { safeBIHealthEvents } from '../../group3/group3Policy';
import { StaffMember } from '../../types';
import { Notice, PageHeader, Surface } from '../Common/ui';

interface BIHealthWorkspaceProps {
  vendorId: string;
  activeStaff: StaffMember;
  events: BIEvent[];
}

export const BIHealthWorkspace: React.FC<BIHealthWorkspaceProps> = ({ vendorId, activeStaff, events }) => {
  const safeEvents = safeBIHealthEvents(events, vendorId);
  const lastWrite = safeEvents[0]?.occurredAt;
  return (
    <div className="space-y-4">
      <PageHeader
        title="BI System Health"
        description="Tenant-scoped telemetry availability, not a recommendation dashboard."
        context={`Vendor scope ${vendorId}`}
      />
      {activeStaff.role !== 'sysadmin' && (
        <Notice tone="error">BI system health is restricted to authorised system administrators.</Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Surface className="p-4"><p className="text-xs text-slate-500">Service state</p><p className="mt-1 font-bold">Available</p></Surface>
        <Surface className="p-4"><p className="text-xs text-slate-500">Tenant events loaded</p><p className="mt-1 font-bold">{safeEvents.length}</p></Surface>
        <Surface className="p-4"><p className="text-xs text-slate-500">Last successful write</p><p className="mt-1 text-sm font-bold">{lastWrite ? new Date(lastWrite).toLocaleString() : 'No event available'}</p></Surface>
        <Surface className="p-4"><p className="text-xs text-slate-500">Schema version</p><p className="mt-1 font-bold">Unversioned legacy schema</p></Surface>
      </div>
      <Notice tone="warning">
        The current BI service does not expose durable pending, failed, offline-queue, retryable-failure or last-sync
        health metrics. Immutable events are not editable here, and no retry action is offered.
      </Notice>
      <Surface className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-[var(--itred-color-charcoal)] text-white">
            <tr><th className="p-3">Occurrence time</th><th className="p-3">Event type</th><th className="p-3">Outcome</th><th className="p-3">Event ID</th></tr>
          </thead>
          <tbody>
            {safeEvents.slice(0, 20).map(event => (
              <tr key={event.id} className="border-t border-[var(--itred-color-border)]">
                <td className="p-3">{new Date(event.occurredAt).toLocaleString()}</td>
                <td className="p-3">{event.eventType}</td><td className="p-3">{event.outcome}</td><td className="p-3 font-mono">{event.id}</td>
              </tr>
            ))}
            {safeEvents.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-500">No tenant BI events are available.</td></tr>}
          </tbody>
        </table>
      </Surface>
    </div>
  );
};
