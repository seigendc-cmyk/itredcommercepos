import { BIEvent } from '../bi/types';
import { OfflineOperationalState } from '../offline/offlineCheckout';
import { OfflineSyncStatus, SyncQueueRecord } from '../offline/types';
import { StaffMember } from '../types';

export const OPERATIONAL_STATE_PRESENTATION: Record<
  OfflineOperationalState,
  { label: string; tone: 'success' | 'info' | 'warning' | 'error'; blocksActions: boolean }
> = {
  ONLINE: { label: 'Online', tone: 'success', blocksActions: false },
  OFFLINE: { label: 'Offline', tone: 'warning', blocksActions: false },
  SYNCING: { label: 'Synchronising', tone: 'info', blocksActions: false },
  'SYNC ERROR': { label: 'Sync error', tone: 'error', blocksActions: false },
  'FISCALISATION PENDING': { label: 'Fiscalisation pending', tone: 'warning', blocksActions: false },
  'CONFIGURATION OUTDATED': { label: 'Configuration outdated', tone: 'error', blocksActions: true },
  'TERMINAL SUSPENDED': { label: 'Terminal suspended', tone: 'error', blocksActions: true },
};

export type QueueGroups = Record<OfflineSyncStatus, SyncQueueRecord[]>;

export function groupSyncQueue(records: SyncQueueRecord[]): QueueGroups {
  const groups: QueueGroups = {
    PENDING: [], SYNCING: [], SYNCED: [], FAILED: [], CONFLICT: [], REQUIRES_REVIEW: [],
  };
  records.forEach(record => groups[record.syncStatus].push(record));
  return groups;
}

export function canRetrySync(staff: StaffMember, status: OfflineSyncStatus): boolean {
  return staff.role === 'sysadmin' &&
    staff.grantedMenuIds.includes('settings') &&
    (status === 'FAILED' || status === 'PENDING');
}

export function validateEffectiveDates(effectiveFrom: string, effectiveTo?: string): string | undefined {
  if (!effectiveFrom) return 'Effective-from date is required.';
  const start = Date.parse(effectiveFrom);
  const end = effectiveTo ? Date.parse(effectiveTo) : undefined;
  if (Number.isNaN(start) || (end !== undefined && Number.isNaN(end))) return 'Enter valid effective dates.';
  if (end !== undefined && end < start) return 'Effective-to date cannot be before effective-from date.';
  return undefined;
}

export function validateHsCode(value: string): string | undefined {
  const normalized = value.replace(/\s/g, '');
  if (!/^\d{6}([.-]?[A-Za-z0-9]{1,10})?$/.test(normalized)) {
    return 'Enter a six-digit international HS code with an optional supported country extension.';
  }
  return undefined;
}

export function fiscalSaleDisplay(input: {
  commercialStatus: string;
  fiscalStatus: string;
  rejectionReason?: string;
}) {
  return {
    commercialStatus: input.commercialStatus,
    fiscalStatus: input.fiscalStatus,
    rejectionReason: input.rejectionReason,
    commercialSalePreserved: input.fiscalStatus === 'REJECTED',
  };
}

const SENSITIVE_KEYS = /(password|pin|token|secret|key|card|payload)/i;

export function safeBIHealthEvents(events: BIEvent[], vendorId: string): Array<{
  id: string;
  eventType: string;
  outcome: string;
  occurredAt: string;
}> {
  return events
    .filter(event => event.vendorId === vendorId)
    .map(event => ({
      id: event.id,
      eventType: event.eventType,
      outcome: event.isAnomaly ? 'REQUIRES_REVIEW' : 'RECORDED',
      occurredAt: event.timestamp,
    }))
    .filter(event => !Object.keys(event).some(key => SENSITIVE_KEYS.test(key)));
}
