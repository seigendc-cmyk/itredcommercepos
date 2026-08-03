import assert from 'node:assert/strict';
import test from 'node:test';
import { acknowledgeStockIncident, approveAndAssignStockIncident, assignStockIncident, closeStockIncident, createOrUpdateStockIncident, reconcileTargetedCount, rejectStockIncident, startTargetedCount, StockIncidentInput } from '.';

const input = (evidenceId: string, severity: 'MEDIUM' | 'HIGH' = 'MEDIUM'): StockIncidentInput => ({
  tenantId: 'vendor', vendorId: 'vendor', stockLocationId: 'warehouse', stockLocationName: 'Main Warehouse', productId: 'product', productName: 'Widget',
  countScopeId: 'cycle:day:product', workingDayNumber: 3, shelfCode: 'S1', binCode: 'B2', category: 'COUNT_OVERDUE', severity,
  reasonCodes: ['COUNT_OVERDUE'], suggestedAction: 'Verify the overdue scheduled count.', createdBy: 'system', dueDate: '2026-01-01', correlationId: 'correlation',
  evidence: { id: evidenceId, occurredAt: '2026-01-02T00:00:00Z', reasonCode: 'COUNT_OVERDUE', summary: 'Scheduled count is overdue.' }, now: '2026-01-02T00:00:00Z',
});

test('recommendations deduplicate open incidents, append evidence and escalate severity', () => {
  const first = createOrUpdateStockIncident([], input('one'));
  const second = createOrUpdateStockIncident(first.incidents, input('two', 'HIGH'));
  assert.equal(first.created, true); assert.equal(second.created, false); assert.equal(second.incidents.length, 1);
  assert.equal(second.incident.evidence.length, 2); assert.equal(second.incident.severity, 'HIGH'); assert.equal(second.incident.overdue, true);
});

test('stock action permissions are enforced and closure requires an outcome', () => {
  const incident = createOrUpdateStockIncident([], input('one')).incident;
  assert.throws(() => assignStockIncident(incident, 'warehouse_staff', { id: 'u', name: 'User' }, undefined, input('x').now), /Permission denied/);
  assert.throws(() => assignStockIncident(incident, 'manager', { id: 'u', name: 'User' }, undefined, input('x').now), /approval/);
  const approved = approveAndAssignStockIncident(incident, 'manager', { id: 'u', name: 'User' }, undefined, input('x').now);
  assert.equal(approved.status, 'ASSIGNED'); assert.equal(approved.assignedUserId, 'u'); assert.ok(approved.reviewedAt);
  assert.equal(rejectStockIncident(incident, 'manager', 'Not required', input('x').now).status, 'REJECTED');
  assert.equal(acknowledgeStockIncident(incident, 'warehouse_staff', input('x').now).status, 'ACKNOWLEDGED');
  assert.throws(() => closeStockIncident(incident, 'warehouse_staff', 'Done', input('x').now), /Permission denied/);
  assert.throws(() => closeStockIncident(incident, 'manager', '', input('x').now), /outcome/);
  assert.equal(closeStockIncident(incident, 'manager', 'Verified', input('x').now).status, 'CLOSED');
});

test('targeted counts include live inward and outward movements without mutating stock', () => {
  const recommendation = createOrUpdateStockIncident([], input('one')).incident;
  assert.throws(() => startTargetedCount(recommendation, { id: 'counter', role: 'warehouse_staff' }, { openingQuantity: 10, openingRevision: 'r1', now: '2026-01-02T10:00:00Z' }), /approval/);
  const incident = approveAndAssignStockIncident(recommendation, 'manager', { id: 'counter', name: 'Counter' }, undefined, input('x').now);
  const { session } = startTargetedCount(incident, { id: 'counter', role: 'warehouse_staff' }, { openingQuantity: 10, openingRevision: 'r1', now: '2026-01-02T10:00:00Z' });
  const inventory = { product: 10 };
  const result = reconcileTargetedCount(session, 9, [
    { id: 'in', productId: 'product', stockLocationId: 'warehouse', quantityDelta: 4, occurredAt: '2026-01-02T10:01:00Z' },
    { id: 'out', productId: 'product', stockLocationId: 'warehouse', quantityDelta: -3, occurredAt: '2026-01-02T10:02:00Z' },
    { id: 'old', productId: 'product', stockLocationId: 'warehouse', quantityDelta: 100, occurredAt: '2026-01-01T10:00:00Z' },
  ], 'warehouse_staff', '2026-01-02T10:03:00Z');
  assert.equal(result.adjustedExpectedQuantity, 11); assert.equal(result.variance, -2); assert.equal(result.status, 'AWAITING_REVIEW');
  assert.deepEqual(inventory, { product: 10 });
});
