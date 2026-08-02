import { StaffRole } from '../../types';

export type StockIncidentStatus = 'NEW' | 'ACKNOWLEDGED' | 'ASSIGNED' | 'IN_PROGRESS' | 'AWAITING_REVIEW' | 'APPROVED' | 'REJECTED' | 'CLOSED';
export type StockIncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type StockIncidentCategory = 'COUNT_OVERDUE' | 'MISSING_COUNT' | 'REPEATED_DISCREPANCY' | 'UNEXPECTED_MOVEMENT' | 'UNRESOLVED_STOCKTAKE_REJECTION' | 'APPROVED_RECOUNT' | 'PRODUCT_LOCATION_MISMATCH' | 'DUPLICATE_PRODUCT_SUSPICION';
export interface StockIncidentEvidence { id: string; occurredAt: string; reasonCode: string; summary: string; sourceEntityId?: string; }
export interface StockActionIncident {
  id: string; tenantId: string; vendorId: string; stockLocationId: string; stockLocationName: string; productId?: string; productName?: string;
  countScopeId: string; workingDayNumber?: number; shelfCode?: string; binCode?: string; category: StockIncidentCategory; severity: StockIncidentSeverity;
  reasonCodes: string[]; evidence: StockIncidentEvidence[]; suggestedAction: string; assignedUserId?: string; assignedUserName?: string;
  createdBy: string; createdAt: string; dueDate?: string; acknowledgedAt?: string; startedAt?: string; submittedAt?: string; reviewedAt?: string; closedAt?: string;
  status: StockIncidentStatus; overdue: boolean; outcome?: string; correlationId: string; countSessionId?: string; updatedAt: string;
}
export interface TargetedCountSession {
  id: string; tenantId: string; vendorId: string; incidentId: string; stockLocationId: string; productId: string; productName: string; shelfCode?: string; binCode?: string;
  assignedCounterId: string; openingSystemQuantity: number; openingInventoryRevision: string; openingTimestamp: string; physicalQuantity?: number;
  adjustedExpectedQuantity?: number; variance?: number; status: 'IN_PROGRESS' | 'AWAITING_REVIEW' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CLOSED'; correlationId: string;
}
export interface TargetedCountMovement { id: string; productId: string; stockLocationId: string; quantityDelta: number; occurredAt: string; inventoryRevision?: string; }
export type StockIncidentInput = Omit<StockActionIncident, 'id' | 'evidence' | 'status' | 'overdue' | 'createdAt' | 'updatedAt'> & { evidence: StockIncidentEvidence; now: string };
export type StockActionPermission = 'stock.notifications.receive' | 'stock.count.perform' | 'stock.count.assign' | 'stock.count.review' | 'stock.variance.approve' | 'stock.incident.close';

const PERMISSIONS: Record<StaffRole, readonly StockActionPermission[]> = {
  sysadmin: ['stock.notifications.receive', 'stock.count.perform', 'stock.count.assign', 'stock.count.review', 'stock.variance.approve', 'stock.incident.close'],
  manager: ['stock.notifications.receive', 'stock.count.perform', 'stock.count.assign', 'stock.count.review', 'stock.variance.approve', 'stock.incident.close'],
  warehouse_staff: ['stock.notifications.receive', 'stock.count.perform'],
  cashier: [],
};
export function hasStockActionPermission(role: StaffRole, permission: StockActionPermission): boolean { return PERMISSIONS[role].includes(permission); }
export function assertStockActionPermission(role: StaffRole, permission: StockActionPermission): void { if (!hasStockActionPermission(role, permission)) throw new Error(`Permission denied: ${permission}.`); }

const OPEN_STATUSES = new Set<StockIncidentStatus>(['NEW', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_REVIEW', 'APPROVED', 'REJECTED']);
const severityRank: Record<StockIncidentSeverity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export function createOrUpdateStockIncident(existing: StockActionIncident[], input: StockIncidentInput): { incidents: StockActionIncident[]; incident: StockActionIncident; created: boolean } {
  const match = existing.find(incident => incident.tenantId === input.tenantId && incident.stockLocationId === input.stockLocationId && incident.countScopeId === input.countScopeId && incident.category === input.category && OPEN_STATUSES.has(incident.status));
  if (match) {
    const evidence = match.evidence.some(item => item.id === input.evidence.id) ? match.evidence : [...match.evidence, input.evidence];
    const updated: StockActionIncident = { ...match, severity: severityRank[input.severity] > severityRank[match.severity] ? input.severity : match.severity, reasonCodes: Array.from(new Set([...match.reasonCodes, ...input.reasonCodes])), evidence, overdue: Boolean(match.dueDate && match.dueDate < input.now), updatedAt: input.now };
    return { incidents: existing.map(item => item.id === match.id ? updated : item), incident: updated, created: false };
  }
  const { now, evidence, ...fields } = input;
  const incident: StockActionIncident = { ...fields, id: `incident_${crypto.randomUUID()}`, evidence: [evidence], status: 'NEW', overdue: Boolean(input.dueDate && input.dueDate < now), createdAt: now, updatedAt: now };
  return { incidents: [incident, ...existing], incident, created: true };
}

export function assignStockIncident(incident: StockActionIncident, actorRole: StaffRole, assignee: { id: string; name: string }, dueDate: string | undefined, now: string): StockActionIncident {
  assertStockActionPermission(actorRole, 'stock.count.assign');
  if (!OPEN_STATUSES.has(incident.status)) throw new Error('Closed incidents cannot be assigned.');
  return { ...incident, assignedUserId: assignee.id, assignedUserName: assignee.name, dueDate, status: 'ASSIGNED', updatedAt: now };
}
export function acknowledgeStockIncident(incident: StockActionIncident, actorRole: StaffRole, now: string): StockActionIncident { assertStockActionPermission(actorRole, 'stock.notifications.receive'); return { ...incident, status: 'ACKNOWLEDGED', acknowledgedAt: now, updatedAt: now }; }
export function closeStockIncident(incident: StockActionIncident, actorRole: StaffRole, outcome: string, now: string): StockActionIncident { assertStockActionPermission(actorRole, 'stock.incident.close'); if (!outcome.trim()) throw new Error('Incident outcome is required.'); return { ...incident, status: 'CLOSED', outcome, closedAt: now, updatedAt: now }; }

export function startTargetedCount(incident: StockActionIncident, actor: { id: string; role: StaffRole }, input: { openingQuantity: number; openingRevision: string; now: string }): { incident: StockActionIncident; session: TargetedCountSession } {
  assertStockActionPermission(actor.role, 'stock.count.perform');
  if (!incident.productId || !incident.productName) throw new Error('A targeted product is required.');
  const sessionId = incident.countSessionId || `count_${crypto.randomUUID()}`;
  const session: TargetedCountSession = { id: sessionId, tenantId: incident.tenantId, vendorId: incident.vendorId, incidentId: incident.id, stockLocationId: incident.stockLocationId, productId: incident.productId, productName: incident.productName, shelfCode: incident.shelfCode, binCode: incident.binCode, assignedCounterId: actor.id, openingSystemQuantity: input.openingQuantity, openingInventoryRevision: input.openingRevision, openingTimestamp: input.now, status: 'IN_PROGRESS', correlationId: incident.correlationId };
  return { incident: { ...incident, status: 'IN_PROGRESS', startedAt: input.now, countSessionId: sessionId, updatedAt: input.now }, session };
}

export function reconcileTargetedCount(session: TargetedCountSession, physicalQuantity: number, movements: TargetedCountMovement[], actorRole: StaffRole, now: string): TargetedCountSession {
  assertStockActionPermission(actorRole, 'stock.count.perform');
  if (!Number.isFinite(physicalQuantity) || physicalQuantity < 0) throw new Error('Physical quantity must be zero or greater.');
  const movementDelta = movements.filter(movement => movement.productId === session.productId && movement.stockLocationId === session.stockLocationId && movement.occurredAt > session.openingTimestamp).reduce((sum, movement) => sum + movement.quantityDelta, 0);
  const adjustedExpectedQuantity = session.openingSystemQuantity + movementDelta;
  return { ...session, physicalQuantity, adjustedExpectedQuantity, variance: physicalQuantity - adjustedExpectedQuantity, status: 'AWAITING_REVIEW' };
}
