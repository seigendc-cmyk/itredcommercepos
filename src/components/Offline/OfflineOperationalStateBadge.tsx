import React, { useEffect, useState } from 'react';
import { isControlledOfflineCheckoutEnabled } from '../../offline/config';
import { resolveOfflineOperationalState } from '../../offline/offlineCheckout';
import { OPERATIONAL_STATE_PRESENTATION } from '../../group3/group3Policy';
import { Button, Notice, Surface } from '../Common/ui';

interface OfflineOperationalStateBadgeProps {
  terminalSuspended?: boolean;
  configurationOutdated?: boolean;
  syncing?: boolean;
  syncError?: boolean;
  fiscalisationPending?: boolean;
  terminalName?: string;
  lastSuccessfulSync?: string;
  pendingCount?: number;
  failedCount?: number;
  fiscalisationPendingCount?: number;
  configurationVersion?: string;
}

export const OfflineOperationalStateBadge: React.FC<OfflineOperationalStateBadgeProps> = ({
  terminalSuspended,
  configurationOutdated,
  syncing,
  syncError,
  fiscalisationPending,
  terminalName,
  lastSuccessfulSync,
  pendingCount,
  failedCount,
  fiscalisationPendingCount,
  configurationVersion,
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
  const controlledOfflineEnabled = isControlledOfflineCheckoutEnabled();
  const [open, setOpen] = useState(false);
  const state = resolveOfflineOperationalState({
    online,
    terminalSuspended,
    configurationOutdated: configurationOutdated || (!online && !controlledOfflineEnabled),
    syncing,
    syncError,
    fiscalisationPending,
  });
  const presentation = OPERATIONAL_STATE_PRESENTATION[state];
  const palette = presentation.tone === 'success'
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : presentation.tone === 'warning'
      ? 'bg-orange-100 text-orange-900 border-orange-200'
      : presentation.tone === 'info'
        ? 'bg-blue-100 text-blue-900 border-blue-200'
        : 'bg-red-100 text-red-800 border-red-200';

  return (
    <div className="fixed right-3 top-3 z-40">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls="operational-state-details"
        className={`min-h-10 rounded-[var(--itred-radius-md)] border px-3 py-1.5 text-xs font-bold shadow-sm ${palette}`}
      >
        {presentation.label}
      </button>
      {open && (
        <Surface id="operational-state-details" className="mt-2 w-[min(22rem,calc(100vw-1.5rem))] p-4">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="font-bold">Operational status</h2><p className="text-sm">{presentation.label}</p></div>
            <Button size="sm" variant="quiet" onClick={() => setOpen(false)}>Close</Button>
          </div>
          {presentation.blocksActions && (
            <Notice tone="error" className="mt-3">Operational actions are blocked until this state is resolved.</Notice>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div><dt className="text-slate-500">Last successful sync</dt><dd>{lastSuccessfulSync || 'Not exposed'}</dd></div>
            <div><dt className="text-slate-500">Pending</dt><dd>{pendingCount ?? 'Not exposed'}</dd></div>
            <div><dt className="text-slate-500">Failed</dt><dd>{failedCount ?? 'Not exposed'}</dd></div>
            <div><dt className="text-slate-500">Fiscal pending</dt><dd>{fiscalisationPendingCount ?? 'Not exposed'}</dd></div>
            <div><dt className="text-slate-500">Terminal/device</dt><dd>{terminalName || 'No active terminal'}</dd></div>
            <div><dt className="text-slate-500">Configuration</dt><dd>{configurationVersion || 'Not exposed'}</dd></div>
          </dl>
        </Surface>
      )}
      <span className="sr-only" role="status" aria-live="polite">{presentation.label}</span>
    </div>
  );
};
