import React, { useEffect, useState } from 'react';
import { isControlledOfflineCheckoutEnabled } from '../../offline/config';
import { resolveOfflineOperationalState } from '../../offline/offlineCheckout';

interface OfflineOperationalStateBadgeProps {
  terminalSuspended?: boolean;
  configurationOutdated?: boolean;
  syncing?: boolean;
  syncError?: boolean;
  fiscalisationPending?: boolean;
}

export const OfflineOperationalStateBadge: React.FC<OfflineOperationalStateBadgeProps> = ({
  terminalSuspended,
  configurationOutdated,
  syncing,
  syncError,
  fiscalisationPending,
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
  const state = resolveOfflineOperationalState({
    online,
    terminalSuspended,
    configurationOutdated: configurationOutdated || (!online && !controlledOfflineEnabled),
    syncing,
    syncError,
    fiscalisationPending,
  });
  const palette = state === 'ONLINE'
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : state === 'OFFLINE'
      ? 'bg-orange-100 text-orange-900 border-orange-200'
      : 'bg-red-100 text-red-800 border-red-200';

  return (
    <div className={`fixed right-3 top-3 z-40 rounded-full border px-3 py-1.5 text-[10px] font-black tracking-wide shadow-sm ${palette}`}
      role="status" aria-live="polite">
      {state}
    </div>
  );
};
