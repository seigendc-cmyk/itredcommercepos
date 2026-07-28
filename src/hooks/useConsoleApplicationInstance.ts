import { useEffect, useRef } from 'react';
import { logBIEvent } from '../bi/tracker';
import { BIEventType } from '../bi/types';
import { resolveConsoleIntegrationConfig } from '../config/consoleIntegration';
import {
  ConsoleApplicationInstanceClient,
  ConsoleApplicationInstanceService,
  ConsoleRequestContext,
  IndexedDbConsoleConnectionStateStore,
} from '../services/consoleApplicationInstance';

export interface ConsoleApplicationInstanceSession {
  tenantId?: string;
  vendorId?: string;
  vendorName?: string;
  branchId?: string;
  terminalId?: string;
  staffId?: string;
  roleId?: string;
  permissions?: string[];
}

export function useConsoleApplicationInstance(session: ConsoleApplicationInstanceSession): void {
  const serviceRef = useRef<ConsoleApplicationInstanceService | undefined>(undefined);
  const assignmentRef = useRef({ branchId: session.branchId, terminalId: session.terminalId });
  const permissionKey = session.permissions?.join(',') || '';

  useEffect(() => {
    const config = resolveConsoleIntegrationConfig();
    if (!config.enabled || !session.tenantId || !session.vendorId) return;
    if (!config.valid || !config.baseUrl) {
      void logBIEvent(session.vendorId, 'CONSOLE_REGISTRATION_FAILED', 'Console integration configuration rejected.', {
        code: config.errorCode,
      });
      return;
    }

    const requestContext = (): ConsoleRequestContext => {
      if (!config.developmentHeadersEnabled) return {};
      return {
        tenantId: session.tenantId!,
        vendorId: session.vendorId!,
        staffId: session.staffId,
        roleId: session.roleId,
        permissions: session.permissions,
      };
    };
    const client = new ConsoleApplicationInstanceClient(config.baseUrl, globalThis.fetch.bind(globalThis), requestContext);
    const service = new ConsoleApplicationInstanceService(
      client,
      new IndexedDbConsoleConnectionStateStore(),
      event => {
        void logBIEvent(
          session.vendorId!,
          event.type as BIEventType,
          event.type.replaceAll('_', ' ').toLowerCase(),
          { code: event.code, instanceId: event.instanceId },
          { staffId: session.staffId, staffRole: session.roleId, branchId: session.branchId, terminalId: session.terminalId },
        );
      },
    );
    serviceRef.current = service;
    assignmentRef.current = { branchId: session.branchId, terminalId: session.terminalId };
    void service.start({
      tenantId: session.tenantId,
      vendorId: session.vendorId,
      instanceName: session.vendorName || 'iTred Commerce POS',
      branchId: session.branchId,
      terminalId: session.terminalId,
      appVersion: '0.0.0',
    });
    const online = () => { void service.connectivityRestored(); };
    globalThis.addEventListener('online', online);
    return () => {
      globalThis.removeEventListener('online', online);
      service.stop();
      if (serviceRef.current === service) serviceRef.current = undefined;
    };
  }, [session.tenantId, session.vendorId, session.staffId, session.roleId, permissionKey]);

  useEffect(() => {
    const previous = assignmentRef.current;
    if (previous.branchId === session.branchId && previous.terminalId === session.terminalId) return;
    assignmentRef.current = { branchId: session.branchId, terminalId: session.terminalId };
    void serviceRef.current?.updateAssignment(session.branchId, session.terminalId);
  }, [session.branchId, session.terminalId]);
}
