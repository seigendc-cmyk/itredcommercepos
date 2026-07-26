import { OfflineDatabase } from './database';
import { DeviceKeyEnvelope } from './encryption';
import { createOfflineId } from './ids';
import { OfflineScope } from './types';

export interface ApprovedDeviceEnrollment extends OfflineScope {
  deviceId: string;
  terminalCode: string;
  configuration: Record<string, unknown>;
  configurationValidUntil: string;
  entitlementValidUntil: string;
  envelope: DeviceKeyEnvelope;
  validUntil?: string;
}

function recordEnrollmentFailure(
  database: OfflineDatabase,
  enrollment: ApprovedDeviceEnrollment,
  reasonCode: string,
): void {
  const now = new Date().toISOString();
  database.run(`
    INSERT INTO bi_events(
      local_id, tenant_id, vendor_id, branch_id, terminal_id,
      event_type, payload_json, risk_score, sync_status, created_at, updated_at,
      occurred_at, device_id, outcome, reason_code, offline_status
    ) VALUES (?, ?, ?, ?, ?, 'DEVICE_ENROLMENT_FAILED', ?, 90, 'PENDING', ?, ?, ?, ?, 'BLOCKED', ?, 'ONLINE')
  `, [
    createOfflineId('bi'),
    enrollment.tenantId, enrollment.vendorId, enrollment.branchId, enrollment.terminalId,
    JSON.stringify({ deviceId: enrollment.deviceId, reasonCode }),
    now, now, now, enrollment.deviceId, reasonCode,
  ]);
}

export function provisionApprovedDeviceEnrollment(
  database: OfflineDatabase,
  enrollment: ApprovedDeviceEnrollment,
  onlineAuthorised: boolean,
): string {
  if (!onlineAuthorised) {
    recordEnrollmentFailure(database, enrollment, 'online_authorisation_required');
    throw new Error('Device enrolment must be provisioned during an authorised online session.');
  }
  if (
    enrollment.envelope.deviceId !== enrollment.deviceId ||
    !enrollment.envelope.wrappedOperationalKey
  ) {
    recordEnrollmentFailure(database, enrollment, 'invalid_device_key_envelope');
    throw new Error('Device encryption envelope does not match the enrolled device.');
  }
  const now = new Date().toISOString();
  const localId = createOfflineId('device');
  database.transaction(() => {
    database.run(`
      INSERT INTO terminal_configuration(
        local_id, tenant_id, vendor_id, branch_id, terminal_id,
        terminal_code, configuration_json, sync_status, created_at, updated_at,
        device_id, terminal_status, branch_status, licence_status,
        branch_licence_status, subscription_status,
        configuration_valid_until, entitlement_valid_until
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, 'ACTIVE', 'ACTIVE', 'LICENSED', 'LICENSED', 'ACTIVE', ?, ?)
      ON CONFLICT(tenant_id, vendor_id, branch_id, terminal_id) DO UPDATE SET
        terminal_code = excluded.terminal_code,
        configuration_json = excluded.configuration_json,
        device_id = excluded.device_id,
        terminal_status = 'ACTIVE',
        branch_status = 'ACTIVE',
        licence_status = 'LICENSED',
        branch_licence_status = 'LICENSED',
        subscription_status = 'ACTIVE',
        configuration_valid_until = excluded.configuration_valid_until,
        entitlement_valid_until = excluded.entitlement_valid_until,
        updated_at = excluded.updated_at
    `, [
      createOfflineId('terminal_config'),
      enrollment.tenantId, enrollment.vendorId, enrollment.branchId, enrollment.terminalId,
      enrollment.terminalCode, JSON.stringify(enrollment.configuration), now, now,
      enrollment.deviceId, enrollment.configurationValidUntil, enrollment.entitlementValidUntil,
    ]);
    database.run(`
      INSERT INTO device_enrolments(
        local_id, device_id, tenant_id, vendor_id, branch_id, terminal_id,
        enrolment_status, public_key_identity, wrapped_operational_key,
        key_version, enrolled_at, valid_until, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
      ON CONFLICT(tenant_id, vendor_id, branch_id, terminal_id, device_id) DO UPDATE SET
        enrolment_status = 'ACTIVE',
        public_key_identity = excluded.public_key_identity,
        wrapped_operational_key = excluded.wrapped_operational_key,
        key_version = excluded.key_version,
        enrolled_at = excluded.enrolled_at,
        valid_until = excluded.valid_until,
        revoked_at = NULL,
        updated_at = excluded.updated_at
    `, [
      localId, enrollment.deviceId,
      enrollment.tenantId, enrollment.vendorId, enrollment.branchId, enrollment.terminalId,
      enrollment.envelope.publicKeyIdentity,
      enrollment.envelope.wrappedOperationalKey,
      enrollment.envelope.keyVersion,
      enrollment.envelope.enrolledAt,
      enrollment.validUntil || null,
      now, now,
    ]);
  });
  return localId;
}

export function suspendEnrolledDevice(
  database: OfflineDatabase,
  scope: OfflineScope,
  deviceId: string,
  status: 'REVOKED' | 'SUSPENDED',
): void {
  database.run(`
    UPDATE device_enrolments
    SET enrolment_status = ?, revoked_at = ?, updated_at = ?
    WHERE tenant_id = ? AND vendor_id = ? AND branch_id = ? AND terminal_id = ? AND device_id = ?
  `, [
    status, new Date().toISOString(), new Date().toISOString(),
    scope.tenantId, scope.vendorId, scope.branchId, scope.terminalId, deviceId,
  ]);
}
