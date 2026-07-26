export interface OfflineBinaryStore {
  load(): Promise<Uint8Array | undefined>;
  save(bytes: Uint8Array): Promise<void>;
  clear(): Promise<void>;
}

export class OpfsOfflineBinaryStore implements OfflineBinaryStore {
  constructor(private readonly fileName = 'itred-commerce-offline.sqlite3') {}

  private async fileHandle(create: boolean): Promise<FileSystemFileHandle> {
    if (!navigator.storage?.getDirectory) {
      throw new Error('Origin Private File System is unavailable.');
    }
    const root = await navigator.storage.getDirectory();
    return root.getFileHandle(this.fileName, { create });
  }

  async load(): Promise<Uint8Array | undefined> {
    try {
      const file = await (await this.fileHandle(false)).getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return undefined;
      throw error;
    }
  }

  async save(bytes: Uint8Array): Promise<void> {
    const writable = await (await this.fileHandle(true)).createWritable();
    await writable.write(bytes as unknown as ArrayBuffer);
    await writable.close();
  }

  async clear(): Promise<void> {
    if (!navigator.storage?.getDirectory) return;
    const root = await navigator.storage.getDirectory();
    try {
      await root.removeEntry(this.fileName);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
    }
  }
}

export class IndexedDbOfflineBinaryStore implements OfflineBinaryStore {
  constructor(
    private readonly databaseName = 'itred-offline-sqlite-container',
    private readonly key = 'primary',
  ) {}

  private open(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('databases')) {
          request.result.createObjectStore('databases');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async load(): Promise<Uint8Array | undefined> {
    const database = await this.open();
    return new Promise<Uint8Array | undefined>((resolve, reject) => {
      const request = database.transaction('databases').objectStore('databases').get(this.key);
      request.onsuccess = () => resolve(
        request.result instanceof ArrayBuffer ? new Uint8Array(request.result) : undefined,
      );
      request.onerror = () => reject(request.error);
    }).finally(() => database.close());
  }

  async save(bytes: Uint8Array): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('databases', 'readwrite');
      transaction.objectStore('databases').put(bytes.slice().buffer, this.key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    }).finally(() => database.close());
  }

  async clear(): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('databases', 'readwrite');
      transaction.objectStore('databases').delete(this.key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    }).finally(() => database.close());
  }
}
