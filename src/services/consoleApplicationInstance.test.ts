import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConsoleIntegrationConfig } from '../config/consoleIntegration';
import {
  ApplicationInstance,
  CachedConsoleConnectionState,
  CONSOLE_HEARTBEAT_INTERVAL_MS,
  ConsoleApplicationInstanceClient,
  ConsoleApplicationInstanceService,
  ConsoleConnectionStateStore,
  ConsoleDiagnostic,
  ConsoleScheduler,
  POS_APPLICATION_ID,
  POS_APPLICATION_INSTANCE_SCHEMA_VERSION,
} from './consoleApplicationInstance';

class MemoryStore implements ConsoleConnectionStateStore {
  states = new Map<string, CachedConsoleConnectionState>();
  constructor(private deviceId = 'device-approved') {}
  async get(vendorId: string) { return this.states.get(vendorId); }
  async set(state: CachedConsoleConnectionState) { this.states.set(state.vendorId, structuredClone(state)); }
  async getOrCreateDeviceId() { return this.deviceId; }
}

class TestScheduler implements ConsoleScheduler {
  callback?: () => void;
  cleared = false;
  interval?: number;
  setInterval(callback: () => void, intervalMs: number) {
    this.callback = callback;
    this.interval = intervalMs;
    return 1;
  }
  clearInterval() { this.cleared = true; this.callback = undefined; }
}

function instance(overrides: Partial<ApplicationInstance> = {}): ApplicationInstance {
  return {
    id: 'console-instance-1',
    tenantId: 'vendor-a',
    vendorId: 'vendor-a',
    applicationId: POS_APPLICATION_ID,
    applicationType: 'POS',
    instanceName: 'Test POS',
    deviceId: 'device-approved',
    schemaVersion: POS_APPLICATION_INSTANCE_SCHEMA_VERSION,
    appVersion: '0.0.0',
    platformStatus: 'ACTIVE',
    status: 'ONLINE',
    registeredAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setup<T extends ConsoleConnectionStateStore = MemoryStore>(
  transport: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  store: T = new MemoryStore() as unknown as T,
) {
  const diagnostics: ConsoleDiagnostic[] = [];
  const scheduler = new TestScheduler();
  const client = new ConsoleApplicationInstanceClient(
    'https://console.invalid',
    transport,
    () => ({ tenantId: 'vendor-a', vendorId: 'vendor-a' }),
    30,
  );
  const service = new ConsoleApplicationInstanceService(client, store, event => diagnostics.push(event), scheduler);
  return { service, store, diagnostics, scheduler };
}

const context = {
  tenantId: 'vendor-a',
  vendorId: 'vendor-a',
  instanceName: 'Test POS',
  appVersion: '0.0.0',
};

test('disabled integration and missing URL are resolved without network construction', () => {
  assert.equal(resolveConsoleIntegrationConfig({}, true).enabled, false);
  assert.deepEqual(
    resolveConsoleIntegrationConfig({ VITE_ENABLE_CONSOLE_INTEGRATION: 'true' }, true).errorCode,
    'console_url_missing',
  );
  assert.equal(
    resolveConsoleIntegrationConfig({
      VITE_ENABLE_CONSOLE_INTEGRATION: 'true',
      VITE_CONSOLE_API_BASE_URL: 'https://example.invalid',
      VITE_ENABLE_CONSOLE_DEVELOPMENT_HEADERS: 'true',
    }, false).errorCode,
    'insecure_header_auth_refused',
  );
});

test('registration caches the Console ID and immediately heartbeats', async () => {
  const calls: string[] = [];
  const { service, store, scheduler } = setup(async input => {
    calls.push(String(input));
    return response(instance({ status: calls.length === 1 ? 'REGISTERED' : 'ONLINE' }), calls.length === 1 ? 201 : 200);
  });
  await service.start(context);
  assert.equal(calls.length, 2);
  assert.equal(store.states.get('vendor-a')?.consoleInstanceId, 'console-instance-1');
  assert.equal(store.states.get('vendor-a')?.registrationStatus, 'REGISTERED');
  assert.equal(scheduler.interval, CONSOLE_HEARTBEAT_INTERVAL_MS);
});

test('duplicate startup and assignment metadata reuse cached registration', async () => {
  const store = new MemoryStore();
  await store.set({
    tenantId: 'vendor-a', vendorId: 'vendor-a', deviceId: 'device-approved',
    consoleInstanceId: 'existing', registrationStatus: 'REGISTERED',
    schemaVersion: 1, pendingOperations: [],
  });
  const calls: Array<{ url: string; body: any }> = [];
  const { service } = setup(async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return response(instance({ id: 'existing' }));
  }, store);
  await service.start(context);
  await service.updateAssignment('branch-1', 'terminal-1');
  assert.equal(calls.every(call => call.url.includes('/heartbeat')), true);
  assert.equal(calls[1].body.branchId, undefined);
  assert.equal(calls[1].body.terminalId, undefined);
});

test('registration timeout is controlled and queued', async () => {
  const { service, store, diagnostics } = setup(() => new Promise(() => {}));
  await service.start(context);
  assert.equal(store.states.get('vendor-a')?.lastErrorCode, 'console_timeout');
  assert.deepEqual(store.states.get('vendor-a')?.pendingOperations, ['REGISTER']);
  assert.equal(diagnostics[0].type, 'CONSOLE_REGISTRATION_FAILED');
});

test('concurrent heartbeat attempts collapse to one request and stop clears schedule', async () => {
  const store = new MemoryStore();
  await store.set({
    tenantId: 'vendor-a', vendorId: 'vendor-a', deviceId: 'device-approved',
    consoleInstanceId: 'existing', registrationStatus: 'REGISTERED',
    schemaVersion: 1, pendingOperations: [],
  });
  let resolveRequest!: (value: Response) => void;
  let calls = 0;
  const { service, scheduler } = setup(() => {
    calls += 1;
    return new Promise(resolve => { resolveRequest = resolve; });
  }, store);
  const startup = service.start(context);
  const restored = service.connectivityRestored();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  resolveRequest(response(instance({ id: 'existing' })));
  await Promise.all([startup, restored]);
  service.stop();
  assert.equal(scheduler.cleared, true);
});

test('vendor-scoped cache cannot be reused by another vendor', async () => {
  const store = new MemoryStore();
  await store.set({
    tenantId: 'vendor-a', vendorId: 'vendor-a', deviceId: 'device-approved',
    consoleInstanceId: 'vendor-a-instance', registrationStatus: 'REGISTERED',
    schemaVersion: 1, pendingOperations: [],
  });
  const paths: string[] = [];
  const { service } = setup(async input => {
    paths.push(String(input));
    return response(instance({ id: 'vendor-b-instance', tenantId: 'vendor-b', vendorId: 'vendor-b' }), 201);
  }, store);
  await service.start({ ...context, tenantId: 'vendor-b', vendorId: 'vendor-b' });
  assert.equal(paths[0].endsWith('/register'), true);
  assert.equal(store.states.get('vendor-a')?.consoleInstanceId, 'vendor-a-instance');
});

test('unsupported schema and retired instances become terminal diagnostics', async () => {
  const schema = setup(async () => response(instance({ schemaVersion: 2 }), 201));
  await schema.service.start(context);
  assert.equal(schema.store.states.get('vendor-a')?.registrationStatus, 'SCHEMA_UNSUPPORTED');
  assert.equal(schema.diagnostics[0].type, 'CONSOLE_SCHEMA_UNSUPPORTED');

  const retired = setup(async () => response(instance({ status: 'RETIRED' }), 201));
  await retired.service.start(context);
  assert.equal(retired.store.states.get('vendor-a')?.registrationStatus, 'RETIRED');
  assert.equal(retired.diagnostics[0].type, 'CONSOLE_INSTANCE_RETIRED');
});

test('server bodies and secret headers never enter diagnostics', async () => {
  const secret = 'super-secret-token';
  const { service, diagnostics } = setup(async () => response({ error: 'denied', message: secret }, 403));
  await service.start(context);
  assert.equal(JSON.stringify(diagnostics).includes(secret), false);
  assert.equal(diagnostics[0].code, 'denied');
});

test('storage failure is diagnostic-only and does not reject startup', async () => {
  const store: ConsoleConnectionStateStore = {
    get: async () => { throw new Error('private storage detail'); },
    set: async () => {},
    getOrCreateDeviceId: async () => 'device-approved',
  };
  const { service, diagnostics } = setup(async () => {
    assert.fail('network must not run after state storage failure');
  }, store);
  await assert.doesNotReject(service.start(context));
  assert.deepEqual(diagnostics, [{
    type: 'CONSOLE_REGISTRATION_FAILED',
    code: 'console_state_unavailable',
  }]);
});
