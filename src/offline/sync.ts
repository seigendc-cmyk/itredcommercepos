import { isOfflineInfrastructureEnabled } from './config';
import { OfflineSyncQueueRepository } from './repositories';
import { SyncQueueRecord } from './types';

export class OfflineSyncCoordinator {
  constructor(
    private readonly queue: OfflineSyncQueueRepository,
    private readonly enabled: boolean = isOfflineInfrastructureEnabled(),
  ) {}

  inspectPending(): { records: SyncQueueRecord[]; disabled: boolean; acceptanceImplemented: false } {
    if (!this.enabled) return { records: [], disabled: true, acceptanceImplemented: false };
    return {
      records: this.queue.list(['PENDING', 'FAILED', 'REQUIRES_REVIEW']),
      disabled: false,
      acceptanceImplemented: false,
    };
  }

  drain(): never {
    throw new Error('Server synchronization acceptance is outside the approved implementation scope.');
  }
}
