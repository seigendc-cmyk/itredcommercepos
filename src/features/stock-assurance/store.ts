import { StaffRole } from '../../types';
import { StockActionIncident, StockIncidentInput, TargetedCountSession, assertStockActionPermission, createOrUpdateStockIncident } from './domain';

const incidentsKey = (vendorId: string) => `itred_stock_incidents_${vendorId}`;
const sessionsKey = (vendorId: string) => `itred_targeted_counts_${vendorId}`;
export function loadStockIncidents(vendorId: string, actorId: string, role: StaffRole): StockActionIncident[] {
  assertStockActionPermission(role, 'stock.notifications.receive');
  const list: StockActionIncident[] = JSON.parse(localStorage.getItem(incidentsKey(vendorId)) || '[]');
  return role === 'warehouse_staff' ? list.filter(incident => !incident.assignedUserId || incident.assignedUserId === actorId) : list;
}
export function saveStockIncidents(vendorId: string, incidents: StockActionIncident[]): void { localStorage.setItem(incidentsKey(vendorId), JSON.stringify(incidents)); }
export function recordStockIncident(vendorId: string, input: StockIncidentInput, role: StaffRole): { incident: StockActionIncident; created: boolean } {
  assertStockActionPermission(role, 'stock.notifications.receive');
  const current: StockActionIncident[] = JSON.parse(localStorage.getItem(incidentsKey(vendorId)) || '[]');
  const result = createOrUpdateStockIncident(current, input);
  saveStockIncidents(vendorId, result.incidents);
  return { incident: result.incident, created: result.created };
}
export function loadTargetedCountSessions(vendorId: string): TargetedCountSession[] { return JSON.parse(localStorage.getItem(sessionsKey(vendorId)) || '[]'); }
export function saveTargetedCountSession(vendorId: string, session: TargetedCountSession): void { const current = loadTargetedCountSessions(vendorId); localStorage.setItem(sessionsKey(vendorId), JSON.stringify([session, ...current.filter(item => item.id !== session.id)])); }
