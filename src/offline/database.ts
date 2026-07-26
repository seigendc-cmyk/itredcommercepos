import type { Database, SqlJsStatic } from 'sql.js';
import { applyOfflineMigrations, getOfflineSchemaVersion } from './migrations';
import { OfflineDatabaseBackup } from './types';

export class OfflineDatabase {
  constructor(private readonly database: Database) {
    this.database.exec('PRAGMA foreign_keys = ON');
  }

  migrate(): number {
    return applyOfflineMigrations(this.database);
  }

  get schemaVersion(): number {
    return getOfflineSchemaVersion(this.database);
  }

  run(sql: string, parameters: (string | number | null)[] = []): void {
    this.database.run(sql, parameters);
  }

  getRowsModified(): number {
    return this.database.getRowsModified();
  }

  rows<T extends Record<string, unknown>>(
    sql: string,
    parameters: (string | number | null)[] = [],
  ): T[] {
    const statement = this.database.prepare(sql);
    try {
      statement.bind(parameters);
      const rows: T[] = [];
      while (statement.step()) {
        rows.push(statement.getAsObject() as T);
      }
      return rows;
    } finally {
      statement.free();
    }
  }

  transaction<T>(operation: () => T): T {
    this.database.run('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.run('COMMIT');
      return result;
    } catch (error) {
      this.database.run('ROLLBACK');
      throw error;
    }
  }

  backup(): OfflineDatabaseBackup {
    return {
      format: 'itred-sqlite-v1',
      schemaVersion: this.schemaVersion,
      createdAt: new Date().toISOString(),
      bytes: this.database.export(),
    };
  }

  close(): void {
    this.database.close();
  }
}

export function createOfflineDatabase(
  sqlite: SqlJsStatic,
  bytes?: Uint8Array,
): OfflineDatabase {
  const database = bytes ? new sqlite.Database(bytes) : new sqlite.Database();
  const offlineDatabase = new OfflineDatabase(database);
  offlineDatabase.migrate();
  return offlineDatabase;
}

export function restoreOfflineDatabase(
  sqlite: SqlJsStatic,
  backup: OfflineDatabaseBackup,
): OfflineDatabase {
  if (backup.format !== 'itred-sqlite-v1' || backup.bytes.length === 0) {
    throw new Error('Unsupported or empty offline database backup.');
  }
  const database = createOfflineDatabase(sqlite, backup.bytes);
  if (database.schemaVersion < backup.schemaVersion) {
    database.close();
    throw new Error('The restored database schema is older than its backup manifest.');
  }
  return database;
}
