import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, ChevronRight, X } from 'lucide-react';
import { BIEventType } from '../../bi/types';
import { acknowledgeStockIncident, approveAndAssignStockIncident, closeStockIncident, hasStockActionPermission, loadStockIncidents, rejectStockIncident, saveStockIncidents, saveTargetedCountSession, startTargetedCount, StockActionIncident } from '../../features/stock-assurance';
import { Branch, Product, StaffMember, Warehouse } from '../../types';

interface Props { vendorId: string; staff: StaffMember; staffList: StaffMember[]; products: Product[]; warehouses: Warehouse[]; branches: Branch[]; warehouseStock: Record<string, number>; branchStock: Record<string, number>; onNavigate: (tab: string) => void; onLogBIEvent?: (eventType: BIEventType, details: Record<string, unknown>) => Promise<unknown> | void; }
interface CardProps { key?: React.Key; incident: StockActionIncident; compact?: boolean; }

export const StockActionDesk: React.FC<Props> = ({ vendorId, staff, staffList, products, warehouses, warehouseStock, branchStock, onNavigate, onLogBIEvent }) => {
  const [incidents, setIncidents] = useState<StockActionIncident[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<StockActionIncident | null>(null);
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const isManagement = ['manager', 'sysadmin'].includes(staff.role);
  const eligibleCounters = useMemo(() => staffList.filter(member => member.status === 'active' && hasStockActionPermission(member.role, 'stock.count.perform')), [staffList]);

  useEffect(() => {
    if (!hasStockActionPermission(staff.role, 'stock.notifications.receive')) return;
    try {
      const loaded = loadStockIncidents(vendorId, staff.id, staff.role);
      setIncidents(loaded);
      if (!isManagement) setToast(loaded.find(item => item.assignedUserId === staff.id && item.status === 'ASSIGNED') || null);
    } catch { setIncidents([]); }
  }, [isManagement, staff.id, staff.role, vendorId]);

  if (!hasStockActionPermission(staff.role, 'stock.notifications.receive')) return null;
  const active = incidents.filter(item => !['CLOSED', 'REJECTED'].includes(item.status));
  if (!active.length && !drawerOpen) return null;

  const persist = (updated: StockActionIncident) => {
    const all: StockActionIncident[] = JSON.parse(localStorage.getItem(`itred_stock_incidents_${vendorId}`) || '[]');
    saveStockIncidents(vendorId, all.map(item => item.id === updated.id ? updated : item));
    setIncidents(previous => previous.map(item => item.id === updated.id ? updated : item));
  };
  const log = (type: BIEventType, incident: StockActionIncident, outcome: string, extra: Record<string, unknown> = {}) => void onLogBIEvent?.(type, { vendorId, actorId: staff.id, productId: incident.productId, stockLocationId: incident.stockLocationId, shelfCode: incident.shelfCode, incidentId: incident.id, reasonCodes: incident.reasonCodes, severity: incident.severity, outcome, correlationId: incident.correlationId, timestamp: new Date().toISOString(), ...extra });
  const approve = (incident: StockActionIncident) => {
    const assignee = eligibleCounters.find(member => member.id === assignees[incident.id]) || eligibleCounters[0];
    if (!assignee) return alert('No active staff member has permission to perform stocktakes.');
    const updated = approveAndAssignStockIncident(incident, staff.role, { id: assignee.id, name: assignee.name }, incident.dueDate, new Date().toISOString());
    persist(updated);
    log('STOCK_RECOMMENDATION_APPROVED', updated, 'approved', { assignedUserId: assignee.id });
    log('STOCK_ACTION_ASSIGNED', updated, 'assigned', { assignedUserId: assignee.id });
    log('STOCKTAKE_STAFF_NOTIFIED', updated, 'notification_queued', { assignedUserId: assignee.id });
  };
  const acknowledge = (incident: StockActionIncident) => { const updated = acknowledgeStockIncident(incident, staff.role, new Date().toISOString()); persist(updated); setToast(null); log('STOCK_ACTION_ACKNOWLEDGED', updated, 'acknowledged'); };
  const start = (incident: StockActionIncident) => {
    const product = products.find(item => item.id === incident.productId); if (!product) return;
    const quantity = (warehouses.some(item => item.id === incident.stockLocationId) ? warehouseStock : branchStock)[product.id] || 0;
    const now = new Date().toISOString();
    const started = startTargetedCount(incident, { id: staff.id, role: staff.role }, { openingQuantity: quantity, openingRevision: now, now });
    persist(started.incident); saveTargetedCountSession(vendorId, started.session);
    localStorage.setItem(`itred_stocktake_deep_link_${vendorId}`, JSON.stringify({ incidentId: incident.id, countSessionId: started.session.id, stockLocationId: incident.stockLocationId, productId: incident.productId, productName: incident.productName, workingDayNumber: incident.workingDayNumber, shelfCode: incident.shelfCode }));
    setToast(null); log('STOCK_ACTION_STARTED', started.incident, 'started'); log('TARGETED_COUNT_STARTED', started.incident, 'started'); onNavigate('products');
  };

  const Card = ({ incident, compact = false }: CardProps) => <article className="border-l-4 border-[#FF6600] bg-slate-50 p-4">
    <div className="flex justify-between gap-2"><div><h3 className="font-black">Stock Count Recommended</h3><p className="text-sm">Count {incident.productName || 'assigned products'} on {incident.shelfCode || 'the assigned shelf'} at {incident.stockLocationName}.</p>{incident.assignedUserName && <p className="text-xs mt-1"><strong>Assigned to:</strong> {incident.assignedUserName}</p>}</div><span className="text-[10px] font-black">{incident.severity} · {incident.status}</span></div>
    {!compact && <><p className="text-xs text-slate-600 mt-2"><strong>Reason:</strong> {incident.suggestedAction}</p>{expanded === incident.id && <ul className="mt-2 text-xs list-disc pl-5">{incident.evidence.map(evidence => <li key={evidence.id}>{evidence.summary}</li>)}</ul>}</>}
    <div className="flex flex-wrap gap-2 mt-3 text-[10px] font-black">
      {isManagement && incident.status === 'NEW' && <><select aria-label={`Assign ${incident.productName}`} value={assignees[incident.id] || eligibleCounters[0]?.id || ''} onChange={event => setAssignees(previous => ({ ...previous, [incident.id]: event.target.value }))} className="border px-2 py-1 bg-white">{eligibleCounters.map(member => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select><button onClick={() => approve(incident)} className="bg-emerald-600 text-white px-2 py-1"><Check className="inline w-3" /> APPROVE & ASSIGN</button><button onClick={() => { const updated = rejectStockIncident(incident, staff.role, 'Rejected by management review.', new Date().toISOString()); persist(updated); log('STOCK_RECOMMENDATION_REJECTED', updated, 'rejected'); }} className="bg-red-600 text-white px-2 py-1">REJECT</button></>}
      {!isManagement && ['ASSIGNED', 'ACKNOWLEDGED'].includes(incident.status) && <><button onClick={() => start(incident)} className="bg-[#FF6B00] text-white px-2 py-1">START COUNT</button>{incident.status === 'ASSIGNED' && <button onClick={() => acknowledge(incident)} className="border px-2 py-1">ACKNOWLEDGE</button>}</>}
      {!compact && <button onClick={() => setExpanded(expanded === incident.id ? null : incident.id)} className="border px-2 py-1">VIEW REASON</button>}
      {isManagement && incident.status !== 'NEW' && hasStockActionPermission(staff.role, 'stock.incident.close') && <button onClick={() => { const updated = closeStockIncident(incident, staff.role, 'Closed by authorised management review.', new Date().toISOString()); persist(updated); log('STOCK_INCIDENT_CLOSED', updated, 'closed'); }} className="border px-2 py-1">CLOSE</button>}
    </div>
  </article>;

  return <>
    <section className="border border-slate-300 bg-white p-4 mb-6"><div className="flex justify-between"><div><h2 className="font-black text-sm">{isManagement ? 'Management Desk · BI Stocktake Approvals' : 'Assigned Stocktake Notifications'}</h2><p className="text-xs text-slate-500">BI recommendations require management approval and staff assignment before counting.</p></div><button onClick={() => setDrawerOpen(true)} className="relative border p-2" aria-label="Open stocktake notification drawer"><Bell className="w-5" />{active.length > 0 && <span className="absolute -top-2 -right-2 bg-[#FF6600] text-white rounded-full min-w-5 h-5 text-[10px] grid place-items-center">{active.length}</span>}</button></div><div className="grid lg:grid-cols-2 gap-3 mt-4">{active.map(incident => <Card key={incident.id} incident={incident} />)}</div></section>
    {drawerOpen && <div className="fixed inset-0 z-[80] bg-black/40" onClick={() => setDrawerOpen(false)}><aside role="dialog" aria-label="Stocktake notification drawer" className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl p-4 overflow-y-auto" onClick={event => event.stopPropagation()}><div className="flex justify-between items-center mb-4"><h2 className="font-black flex gap-2"><Bell className="text-[#FF6600]" />Stocktake Notifications</h2><button onClick={() => setDrawerOpen(false)}><X /></button></div><div className="space-y-3">{active.map(incident => <Card key={incident.id} incident={incident} compact />)}{!active.length && <p className="p-8 text-center text-slate-500">No active stocktake notifications.</p>}</div></aside></div>}
    {toast && <div role="alert" className="fixed bottom-5 right-5 z-[90] max-w-sm bg-white border-l-4 border-[#FF6600] shadow-2xl p-4"><button onClick={() => setToast(null)} className="absolute top-2 right-2"><X className="w-4" /></button><p className="text-xs font-black text-[#FF6600]">NEW APPROVED STOCKTAKE</p><h3 className="font-black mt-1">{toast.productName}</h3><p className="text-sm">Assigned at {toast.stockLocationName} · Shelf {toast.shelfCode || 'unassigned'}.</p><div className="flex gap-2 mt-3"><button onClick={() => acknowledge(toast)} className="border px-3 py-1 text-xs font-black">Acknowledge</button><button onClick={() => start(toast)} className="bg-[#FF6600] text-white px-3 py-1 text-xs font-black flex gap-1">Start Count <ChevronRight className="w-3" /></button></div></div>}
  </>;
};
