import React, { useEffect, useState } from 'react';
import { isControlledOfflineCheckoutEnabled, isOfflineInfrastructureEnabled } from '../../offline/config';
import { OfflineOperationalState, resolveOfflineOperationalState } from '../../offline/offlineCheckout';
import { StaffMember, Terminal } from '../../types';
import { OPERATIONAL_STATE_PRESENTATION } from '../../group3/group3Policy';
import { Notice, PageHeader, Surface } from '../Common/ui';

interface SynchronisationWorkspaceProps {
  activeStaff: StaffMember;
  terminal: Terminal | null;
}

export const SynchronisationWorkspace: React.FC<SynchronisationWorkspaceProps> = ({
  activeStaff,
  terminal,
}) => {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const infrastructureEnabled = isOfflineInfrastructureEnabled();
  const controlledCheckoutEnabled = isControlledOfflineCheckoutEnabled();
  const state: OfflineOperationalState = resolveOfflineOperationalState({
    online,
    terminalSuspended: terminal?.status === 'suspended',
    configurationOutdated: !online && !controlledCheckoutEnabled,
  });
  const presentation = OPERATIONAL_STATE_PRESENTATION[state];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Synchronisation"
        description="Inspect the enrolled terminal's offline capability and server-acceptance boundary."
        context={terminal ? `${terminal.name} · ${terminal.code}` : 'No active terminal'}
      />
      {state === 'CONFIGURATION OUTDATED' && (
        <Notice tone="error">Configuration is not authorised for controlled offline checkout. Reconnect before processing sales.</Notice>
      )}
      {state === 'TERMINAL SUSPENDED' && (
        <Notice tone="error">This terminal is suspended. Operational and synchronisation actions are blocked.</Notice>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Surface className="p-4">
          <h2 className="text-sm font-bold">Summary</h2>
          <p className="mt-2 text-lg font-bold">{presentation.label}</p>
          <p className="mt-1 text-sm text-[var(--itred-color-text-muted)]">
            Offline infrastructure: {infrastructureEnabled ? 'Enabled' : 'Disabled'}
          </p>
          <p className="text-sm text-[var(--itred-color-text-muted)]">
            Controlled checkout: {controlledCheckoutEnabled ? 'Enabled' : 'Disabled'}
          </p>
        </Surface>
        <Surface className="p-4 lg:col-span-2">
          <h2 className="text-sm font-bold">Queue availability</h2>
          <Notice tone="warning" className="mt-3">
            The encrypted local database is not exposed through an application session on this branch.
            Live Pending, Syncing, Synced, Failed, Conflict and Requires Review rows cannot be safely displayed.
          </Notice>
          <p className="mt-3 text-sm text-[var(--itred-color-text-muted)]">
            Server synchronisation acceptance and retry are not implemented. No record has been marked synced,
            deleted, retried or acknowledged by this page.
          </p>
        </Surface>
      </div>
      <Surface className="p-4">
        <h2 className="text-sm font-bold">Offline configuration</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-slate-500">Device registration</dt><dd>Unavailable to UI</dd></div>
          <div><dt className="text-slate-500">Terminal registration</dt><dd>{terminal ? terminal.status : 'No terminal selected'}</dd></div>
          <div><dt className="text-slate-500">Encryption readiness</dt><dd>Not exposed</dd></div>
          <div><dt className="text-slate-500">Schema version</dt><dd>Not exposed</dd></div>
          <div><dt className="text-slate-500">Backup status</dt><dd>Not exposed</dd></div>
          <div><dt className="text-slate-500">Fiscalisation offline policy</dt><dd>Pending separate acknowledgement</dd></div>
        </dl>
        {activeStaff.role !== 'sysadmin' && (
          <Notice className="mt-4">Device security and offline configuration are read-only for your role.</Notice>
        )}
      </Surface>
    </div>
  );
};
