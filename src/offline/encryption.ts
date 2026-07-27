import { OfflineBinaryStore } from './persistence';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export interface EncryptedPayload {
  algorithm: 'AES-256-GCM';
  keyVersion: number;
  iv: string;
  ciphertext: string;
}

export interface DeviceKeyEnvelope {
  deviceId: string;
  keyVersion: number;
  wrappedOperationalKey: string;
  publicKeyIdentity: string;
  enrolledAt: string;
}

export interface DeviceWrappingKeyStore {
  get(deviceId: string): Promise<CryptoKey | undefined>;
  set(deviceId: string, key: CryptoKey): Promise<void>;
  remove(deviceId: string): Promise<void>;
}

export class IndexedDbDeviceWrappingKeyStore implements DeviceWrappingKeyStore {
  constructor(private readonly databaseName = 'itred-device-keys') {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('keys')) {
          request.result.createObjectStore('keys');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(deviceId: string): Promise<CryptoKey | undefined> {
    const database = await this.open();
    return new Promise<CryptoKey | undefined>((resolve, reject) => {
      const request = database.transaction('keys').objectStore('keys').get(deviceId);
      request.onsuccess = () => resolve(request.result instanceof CryptoKey ? request.result : undefined);
      request.onerror = () => reject(request.error);
    }).finally(() => database.close());
  }

  async set(deviceId: string, key: CryptoKey): Promise<void> {
    if (key.extractable) throw new Error('Device wrapping keys must be non-extractable.');
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('keys', 'readwrite');
      transaction.objectStore('keys').put(key, deviceId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    }).finally(() => database.close());
  }

  async remove(deviceId: string): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('keys', 'readwrite');
      transaction.objectStore('keys').delete(deviceId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    }).finally(() => database.close());
  }
}

export class OfflineDataProtector {
  private constructor(
    private readonly operationalKey: CryptoKey,
    readonly envelope: DeviceKeyEnvelope,
  ) {}

  static async enroll(
    deviceId: string,
    keyStore: DeviceWrappingKeyStore,
    keyVersion = 1,
  ): Promise<OfflineDataProtector> {
    const wrappingKey = await crypto.subtle.generateKey(
      { name: 'AES-KW', length: 256 },
      false,
      ['wrapKey', 'unwrapKey'],
    );
    await keyStore.set(deviceId, wrappingKey);
    const operationalKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const wrapped = await crypto.subtle.wrapKey(
      'raw',
      operationalKey,
      wrappingKey,
      'AES-KW',
    );
    return new OfflineDataProtector(operationalKey, {
      deviceId,
      keyVersion,
      wrappedOperationalKey: toBase64(new Uint8Array(wrapped)),
      publicKeyIdentity: `browser-nonextractable-aes-kw:${deviceId}`,
      enrolledAt: new Date().toISOString(),
    });
  }

  static async recover(
    envelope: DeviceKeyEnvelope,
    keyStore: DeviceWrappingKeyStore,
  ): Promise<OfflineDataProtector> {
    const wrappingKey = await keyStore.get(envelope.deviceId);
    if (!wrappingKey || wrappingKey.extractable) {
      throw new Error('Device-bound wrapping key is unavailable or invalid.');
    }
    const operationalKey = await crypto.subtle.unwrapKey(
      'raw',
      fromBase64(envelope.wrappedOperationalKey),
      wrappingKey,
      'AES-KW',
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    return new OfflineDataProtector(operationalKey, envelope);
  }

  async encrypt(bytes: Uint8Array): Promise<EncryptedPayload> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.operationalKey,
      bytes,
    );
    return {
      algorithm: 'AES-256-GCM',
      keyVersion: this.envelope.keyVersion,
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ciphertext)),
    };
  }

  async decrypt(payload: EncryptedPayload): Promise<Uint8Array> {
    if (
      payload.algorithm !== 'AES-256-GCM' ||
      payload.keyVersion !== this.envelope.keyVersion
    ) {
      throw new Error('Encrypted offline data uses an unsupported key version.');
    }
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(payload.iv) },
      this.operationalKey,
      fromBase64(payload.ciphertext),
    );
    return new Uint8Array(plaintext);
  }

  async encryptJson(value: unknown): Promise<string> {
    return JSON.stringify(await this.encrypt(encoder.encode(JSON.stringify(value))));
  }

  async hash(value: string): Promise<string> {
    return toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
  }
}

export class EncryptedOfflineBinaryStore implements OfflineBinaryStore {
  constructor(
    private readonly underlying: OfflineBinaryStore,
    private readonly protector: OfflineDataProtector,
  ) {}

  async load(): Promise<Uint8Array | undefined> {
    const encrypted = await this.underlying.load();
    if (!encrypted) return undefined;
    let payload: EncryptedPayload;
    try {
      payload = JSON.parse(decoder.decode(encrypted)) as EncryptedPayload;
    } catch {
      throw new Error('Offline database persistence is not encrypted or is corrupted.');
    }
    return this.protector.decrypt(payload);
  }

  async save(bytes: Uint8Array): Promise<void> {
    const encrypted = await this.protector.encrypt(bytes);
    await this.underlying.save(encoder.encode(JSON.stringify(encrypted)));
  }

  clear(): Promise<void> {
    return this.underlying.clear();
  }
}
