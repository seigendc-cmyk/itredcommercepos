import { createOfflineId } from '../offline/ids';

export const POS_APPLICATION_ID = 'itred-commerce-pos' as const;
export const POS_APPLICATION_TYPE = 'POS' as const;
export const POS_APPLICATION_INSTANCE_SCHEMA_VERSION = 1 as const;
export const CONSOLE_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

export type ApplicationInstanceStatus = 'REGISTERED' | 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'RETIRED';
export type PlatformStatus = 'ACTIVE' | 'SUSPENDED' | 'REQUIRES_REVIEW';

export interface ApplicationInstance {
  id: string;
  tenantId: string;
  vendorId: string;
  applicationId: typeof POS_APPLICATION_ID;
  applicationType: typeof POS_APPLICATION_TYPE;
  instanceName: string;
  deviceId: string;
  branchId?: string;
  terminalId?: string;
  schemaVersion: number;
  appVersion: string;
  platformStatus: PlatformStatus;
  status: ApplicationInstanceStatus;
  entitlementVersion?: string;
  configurationVersion?: string;
  lastHeartbeatAt?: string;
  lastSuccessfulSyncAt?: string;
  registeredAt: string;
  updatedAt: string;
  retiredAt?: string;
}

export interface ApplicationInstanceRegistrationRequest {
  applicationId: typeof POS_APPLICATION_ID;
  instanceName: string;
  deviceId: string;
  branchId?: string;
  terminalId?: string;
  schemaVersion: typeof POS_APPLICATION_INSTANCE_SCHEMA_VERSION;
  appVersion: string;
}

export interface ApplicationInstanceHeartbeatRequest {
  appVersion: string;
  schemaVersion: typeof POS_APPLICATION_INSTANCE_SCHEMA_VERSION;
  status: 'ONLINE' | 'DEGRADED';
  configurationVersion?: string;
  entitlementVersion?: string;
  lastSuccessfulSyncAt?: string;
}

export type ApplicationInstanceRegistrationResponse = ApplicationInstance;

export interface CachedConsoleConnectionState {
  tenantId: string;
  vendorId: string;
  deviceId: string;
  consoleInstanceId?: string;
  registrationStatus: 'PENDING' | 'REGISTERED' | 'FAILED' | 'RETIRED' | 'SCHEMA_UNSUPPORTED';
  lastRegistrationAttemptAt?: string;
  lastSuccessfulHeartbeatAt?: string;
  lastErrorCode?: string;
  schemaVersion: typeof POS_APPLICATION_INSTANCE_SCHEMA_VERSION;
  cachedPlatformStatus?: PlatformStatus;
  pendingOperations: Array<'REGISTER' | 'HEARTBEAT'>;
}

export interface ConsoleRequestContext {
  tenantId?: string;
  vendorId?: string;
  staffId?: string;
  roleId?: string;
  permissions?: string[];
}

export type ConsoleRequestContextProvider = () => ConsoleRequestContext;
export type ConsoleTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ConsoleClientError extends Error {
  constructor(readonly code: string, readonly status?: number) {
    super(`Console request failed (${code}).`);
    this.name = 'ConsoleClientError';
  }
}

function validateInstance(value: unknown): ApplicationInstance {
  const item = value as Partial<ApplicationInstance>;
  if (!item || typeof item !== 'object' || typeof item.id !== 'string') {
    throw new ConsoleClientError('console_response_invalid');
  }
  if (item.schemaVersion !== POS_APPLICATION_INSTANCE_SCHEMA_VERSION) {
    throw new ConsoleClientError('console_schema_unsupported');
  }
  return item as ApplicationInstance;
}

export class ConsoleApplicationInstanceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly transport: ConsoleTransport,
    private readonly contextProvider: ConsoleRequestContextProvider,
    private readonly timeoutMs = 5000,
  ) {}

  private async request(path: string, body: unknown): Promise<ApplicationInstance> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new ConsoleClientError('console_timeout'));
      }, this.timeoutMs);
    });
    const context = this.contextProvider();
    try {
      const response = await Promise.race([
        this.transport(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(context.tenantId ? { 'x-tenant-id': context.tenantId } : {}),
            ...(context.vendorId ? { 'x-vendor-id': context.vendorId } : {}),
            ...(context.staffId ? { 'x-staff-id': context.staffId } : {}),
            ...(context.roleId ? { 'x-role-id': context.roleId } : {}),
            ...(context.permissions?.length ? { 'x-permissions': context.permissions.join(',') } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
        timeout,
      ]);
      if (!response.ok) {
        let code = `console_http_${response.status}`;
        try {
          const error = await response.json() as { error?: unknown };
          if (typeof error.error === 'string' && /^[a-z0-9_-]+$/i.test(error.error)) code = error.error;
        } catch {
          // The response body is intentionally not exposed.
        }
        throw new ConsoleClientError(code, response.status);
      }
      return validateInstance(await response.json());
    } catch (error) {
      if (error instanceof ConsoleClientError) throw error;
      throw new ConsoleClientError('console_network_error');
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  register(request: ApplicationInstanceRegistrationRequest): Promise<ApplicationInstanceRegistrationResponse> {
    return this.request('/v1/application-instances/register', request);
  }

  heartbeat(instanceId: string, request: ApplicationInstanceHeartbeatRequest): Promise<ApplicationInstance> {
    return this.request(`/v1/application-instances/${encodeURIComponent(instanceId)}/heartbeat`, request);
  }
}

export interface ConsoleConnectionStateStore {
  get(vendorId: string): Promise<CachedConsoleConnectionState | undefined>;
  set(state: CachedConsoleConnectionState): Promise<void>;
  getOrCreateDeviceId(): Promise<string>;
}

export class IndexedDbConsoleConnectionStateStore implements ConsoleConnectionStateStore {
  constructor(private readonly databaseName = 'itred-console-connection') {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('connectionStates')) {
          request.result.createObjectStore('connectionStates');
        }
        if (!request.result.objectStoreNames.contains('identity')) {
          request.result.createObjectStore('identity');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async approvedDeviceId(): Promise<string | undefined> {
    return new Promise((resolve) => {
      const request = indexedDB.open('itred-device-keys', 1);
      request.onupgradeneeded = () => request.transaction?.abort();
      request.onerror = () => resolve(undefined);
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('keys')) {
          database.close();
          resolve(undefined);
          return;
        }
        const keys = database.transaction('keys').objectStore('keys').getAllKeys();
        keys.onerror = () => { database.close(); resolve(undefined); };
        keys.onsuccess = () => {
          const values = keys.result.filter((key): key is string => typeof key === 'string');
          database.close();
          resolve(values.length === 1 ? values[0] : undefined);
        };
      };
    });
  }

  async get(vendorId: string): Promise<CachedConsoleConnectionState | undefined> {
    const database = await this.open();
    return new Promise<CachedConsoleConnectionState | undefined>((resolve, reject) => {
      const request = database.transaction('connectionStates').objectStore('connectionStates').get(vendorId);
      request.onsuccess = () => resolve(request.result as CachedConsoleConnectionState | undefined);
      request.onerror = () => reject(request.error);
    }).finally(() => database.close());
  }

  async set(state: CachedConsoleConnectionState): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('connectionStates', 'readwrite');
      transaction.objectStore('connectionStates').put(state, state.vendorId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    }).finally(() => database.close());
  }

  async getOrCreateDeviceId(): Promise<string> {
    const approved = await this.approvedDeviceId();
    if (approved) return approved;
    const database = await this.open();
    const existing = await new Promise<string | undefined>((resolve, reject) => {
      const request = database.transaction('identity').objectStore('identity').get('deviceId');
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : undefined);
      request.onerror = () => reject(request.error);
    });
    if (existing) {
      database.close();
      return existing;
    }
    const deviceId = createOfflineId('pos_device');
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('identity', 'readwrite');
      transaction.objectStore('identity').put(deviceId, 'deviceId');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    }).finally(() => database.close());
    return deviceId;
  }
}

export type ConsoleDiagnosticType =
  | 'CONSOLE_INSTANCE_REGISTERED'
  | 'CONSOLE_REGISTRATION_FAILED'
  | 'CONSOLE_HEARTBEAT_SENT'
  | 'CONSOLE_HEARTBEAT_FAILED'
  | 'CONSOLE_SCHEMA_UNSUPPORTED'
  | 'CONSOLE_INSTANCE_RETIRED';

export interface ConsoleDiagnostic {
  type: ConsoleDiagnosticType;
  code?: string;
  instanceId?: string;
}

export interface ConsoleApplicationContext {
  tenantId: string;
  vendorId: string;
  instanceName: string;
  branchId?: string;
  terminalId?: string;
  appVersion: string;
}

export interface ConsoleScheduler {
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}

const defaultScheduler: ConsoleScheduler = {
  setInterval: (callback, intervalMs) => globalThis.setInterval(callback, intervalMs),
  clearInterval: handle => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};

function errorCode(error: unknown): string {
  return error instanceof ConsoleClientError ? error.code : 'console_operation_failed';
}

function terminalError(code: string): 'RETIRED' | 'SCHEMA_UNSUPPORTED' | undefined {
  if (code.toLowerCase().includes('retired')) return 'RETIRED';
  if (code.toLowerCase().includes('schema')) return 'SCHEMA_UNSUPPORTED';
  return undefined;
}

export class ConsoleApplicationInstanceService {
  private context?: ConsoleApplicationContext;
  private interval?: unknown;
  private stopped = true;
  private connectInFlight?: Promise<void>;
  private heartbeatInFlight?: Promise<void>;

  constructor(
    private readonly client: ConsoleApplicationInstanceClient,
    private readonly store: ConsoleConnectionStateStore,
    private readonly diagnostic: (event: ConsoleDiagnostic) => void,
    private readonly scheduler: ConsoleScheduler = defaultScheduler,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  start(context: ConsoleApplicationContext): Promise<void> {
    this.context = context;
    this.stopped = false;
    this.interval = this.scheduler.setInterval(() => { void this.connect(); }, CONSOLE_HEARTBEAT_INTERVAL_MS);
    return this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.interval !== undefined) this.scheduler.clearInterval(this.interval);
    this.interval = undefined;
  }

  updateAssignment(branchId?: string, terminalId?: string): Promise<void> {
    if (!this.context) return Promise.resolve();
    const changed = this.context.branchId !== branchId || this.context.terminalId !== terminalId;
    this.context = { ...this.context, branchId, terminalId };
    return changed ? this.connect() : Promise.resolve();
  }

  connectivityRestored(): Promise<void> {
    return this.connect();
  }

  private connect(): Promise<void> {
    if (this.connectInFlight) return this.connectInFlight;
    this.connectInFlight = this.performConnect()
      .catch(() => {
        this.diagnostic({ type: 'CONSOLE_REGISTRATION_FAILED', code: 'console_state_unavailable' });
      })
      .finally(() => {
        this.connectInFlight = undefined;
      });
    return this.connectInFlight;
  }

  private async performConnect(): Promise<void> {
    if (this.stopped || !this.context) return;
    const context = this.context;
    const deviceId = await this.store.getOrCreateDeviceId();
    let state = await this.store.get(context.vendorId);
    if (this.stopped) return;
    if (state && (state.vendorId !== context.vendorId || state.tenantId !== context.tenantId)) state = undefined;
    state ||= {
      tenantId: context.tenantId,
      vendorId: context.vendorId,
      deviceId,
      registrationStatus: 'PENDING',
      schemaVersion: POS_APPLICATION_INSTANCE_SCHEMA_VERSION,
      pendingOperations: ['REGISTER'],
    };
    if (state.registrationStatus === 'RETIRED' || state.registrationStatus === 'SCHEMA_UNSUPPORTED') return;

    if (!state.consoleInstanceId) {
      state = { ...state, lastRegistrationAttemptAt: this.now(), pendingOperations: ['REGISTER'] };
      await this.store.set(state);
      try {
        const instance = await this.client.register({
          applicationId: POS_APPLICATION_ID,
          instanceName: context.instanceName,
          deviceId,
          branchId: context.branchId,
          terminalId: context.terminalId,
          schemaVersion: POS_APPLICATION_INSTANCE_SCHEMA_VERSION,
          appVersion: context.appVersion,
        });
        if (instance.vendorId !== context.vendorId || instance.tenantId !== context.tenantId) {
          throw new ConsoleClientError('console_scope_mismatch');
        }
        state = {
          ...state,
          consoleInstanceId: instance.id,
          registrationStatus: instance.status === 'RETIRED' ? 'RETIRED' : 'REGISTERED',
          cachedPlatformStatus: instance.platformStatus,
          lastErrorCode: undefined,
          pendingOperations: instance.status === 'RETIRED' ? [] : ['HEARTBEAT'],
        };
        await this.store.set(state);
        this.diagnostic({ type: instance.status === 'RETIRED' ? 'CONSOLE_INSTANCE_RETIRED' : 'CONSOLE_INSTANCE_REGISTERED', instanceId: instance.id });
        if (instance.status === 'RETIRED') return;
      } catch (error) {
        const code = errorCode(error);
        const terminal = terminalError(code);
        await this.store.set({
          ...state,
          registrationStatus: terminal || 'FAILED',
          lastErrorCode: code,
          pendingOperations: terminal ? [] : ['REGISTER'],
        });
        this.diagnostic({ type: terminal === 'SCHEMA_UNSUPPORTED' ? 'CONSOLE_SCHEMA_UNSUPPORTED' : terminal === 'RETIRED' ? 'CONSOLE_INSTANCE_RETIRED' : 'CONSOLE_REGISTRATION_FAILED', code });
        return;
      }
    }
    return this.sendHeartbeat(state);
  }

  private sendHeartbeat(state: CachedConsoleConnectionState): Promise<void> {
    if (this.heartbeatInFlight) return this.heartbeatInFlight;
    this.heartbeatInFlight = (async () => {
      if (this.stopped || !this.context || !state.consoleInstanceId) return;
      try {
        const instance = await this.client.heartbeat(state.consoleInstanceId, {
          appVersion: this.context.appVersion,
          schemaVersion: POS_APPLICATION_INSTANCE_SCHEMA_VERSION,
          status: 'ONLINE',
        });
        const retired = instance.status === 'RETIRED';
        await this.store.set({
          ...state,
          registrationStatus: retired ? 'RETIRED' : 'REGISTERED',
          cachedPlatformStatus: instance.platformStatus,
          lastSuccessfulHeartbeatAt: retired ? state.lastSuccessfulHeartbeatAt : this.now(),
          lastErrorCode: retired ? 'console_instance_retired' : undefined,
          pendingOperations: [],
        });
        this.diagnostic({ type: retired ? 'CONSOLE_INSTANCE_RETIRED' : 'CONSOLE_HEARTBEAT_SENT', instanceId: instance.id });
      } catch (error) {
        const code = errorCode(error);
        const terminal = terminalError(code);
        await this.store.set({
          ...state,
          registrationStatus: terminal || state.registrationStatus,
          lastErrorCode: code,
          pendingOperations: terminal ? [] : ['HEARTBEAT'],
        });
        this.diagnostic({ type: terminal === 'SCHEMA_UNSUPPORTED' ? 'CONSOLE_SCHEMA_UNSUPPORTED' : terminal === 'RETIRED' ? 'CONSOLE_INSTANCE_RETIRED' : 'CONSOLE_HEARTBEAT_FAILED', code, instanceId: state.consoleInstanceId });
      }
    })().finally(() => { this.heartbeatInFlight = undefined; });
    return this.heartbeatInFlight;
  }
}
