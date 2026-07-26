import initSqlJs from 'sql.js';
import sqliteWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { isOfflineInfrastructureEnabled } from './config';
import { createOfflineDatabase, OfflineDatabase } from './database';
import {
  IndexedDbOfflineBinaryStore,
  OfflineBinaryStore,
  OpfsOfflineBinaryStore,
} from './persistence';
import { EncryptedOfflineBinaryStore, OfflineDataProtector } from './encryption';

export interface BrowserOfflineDatabase {
  database: OfflineDatabase;
  persist(): Promise<void>;
  close(): Promise<void>;
}

export async function openBrowserOfflineDatabase(
  enabled = isOfflineInfrastructureEnabled(),
  store?: OfflineBinaryStore,
  protector?: OfflineDataProtector,
): Promise<BrowserOfflineDatabase | null> {
  if (!enabled) return null;
  if (!protector) {
    throw new Error('Encrypted device-bound persistence is required for controlled offline checkout.');
  }
  const sqlite = await initSqlJs({ locateFile: () => sqliteWasmUrl });
  const binaryStore = store || (
    navigator.storage?.getDirectory
      ? new OpfsOfflineBinaryStore()
      : new IndexedDbOfflineBinaryStore()
  );
  const persistence = new EncryptedOfflineBinaryStore(binaryStore, protector);
  const existing = await persistence.load();
  const database = createOfflineDatabase(sqlite, existing);
  return {
    database,
    async persist() {
      await persistence.save(database.backup().bytes);
    },
    async close() {
      await persistence.save(database.backup().bytes);
      database.close();
    },
  };
}
