export const OFFLINE_SYNC_STATUSES = [
  'PENDING',
  'SYNCING',
  'SYNCED',
  'FAILED',
  'CONFLICT',
  'REQUIRES_REVIEW',
] as const;

export type OfflineSyncStatus = typeof OFFLINE_SYNC_STATUSES[number];

export interface OfflineScope {
  tenantId: string;
  vendorId: string;
  branchId: string;
  terminalId: string;
}

export interface OfflineProductRecord extends OfflineScope {
  localId: string;
  remoteId?: string;
  sku: string;
  name: string;
  brand?: string;
  manufacturerCode?: string;
  barcode?: string;
  unitOfMeasure: string;
  syncStatus: OfflineSyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueRecord extends OfflineScope {
  localId: string;
  entityType: string;
  entityLocalId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payloadJson: string;
  idempotencyKey: string;
  syncStatus: OfflineSyncStatus;
  attemptCount: number;
  nextAttemptAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineDatabaseBackup {
  format: 'itred-sqlite-v1';
  schemaVersion: number;
  createdAt: string;
  bytes: Uint8Array;
}
