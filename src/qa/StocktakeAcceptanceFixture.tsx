import React, { useMemo, useState } from 'react';
import { StocktakeWorkspace } from '../components/Inventory/StocktakeWorkspace';
import { createIdempotentApprovalRequestId, createPendingInventoryRequest, decideInventoryRequest, markInventoryRequestCompleted, markInventoryRequestProcessing } from '../services/inventoryApprovalWorkflow';
import { ApprovalRequest, Product, StaffMember, StaffRole, Warehouse } from '../types';
import { BIEventType } from '../bi/types';
import { assertStocktakePermission, StocktakePermission } from '../features/stocktake';

const VENDOR_ID = 'qa-stocktake-browser-tenant';
const warehouse: Warehouse = { id: 'qa-warehouse', vendorId: VENDOR_ID, code: 'QA-WH', name: 'QA Main Warehouse', location: 'Isolated Browser Fixture', isDefault: true, createdAt: '2026-08-02T00:00:00Z' };
const roles: Record<'counter' | 'manager' | 'no_export' | 'no_approval', StaffMember> = {
  counter: { id: 'qa-counter', vendorId: VENDOR_ID, name: 'QA Stock Counter', email: 'counter@qa.invalid', role: 'warehouse_staff', grantedMenuIds: ['products', 'approvals'], status: 'active', createdAt: '2026-08-02T00:00:00Z' },
  manager: { id: 'qa-manager', vendorId: VENDOR_ID, name: 'QA Stocktake Manager', email: 'manager@qa.invalid', role: 'manager', grantedMenuIds: ['products', 'approvals'], status: 'active', createdAt: '2026-08-02T00:00:00Z' },
  no_export: { id: 'qa-no-export', vendorId: VENDOR_ID, name: 'QA No Export User', email: 'no-export@qa.invalid', role: 'cashier', grantedMenuIds: ['products'], status: 'active', createdAt: '2026-08-02T00:00:00Z' },
  no_approval: { id: 'qa-no-approval', vendorId: VENDOR_ID, name: 'QA No Approval User', email: 'no-approval@qa.invalid', role: 'warehouse_staff', grantedMenuIds: ['products'], status: 'active', createdAt: '2026-08-02T00:00:00Z' },
};

const product = (id: string, shelf: string, overrides: Partial<Product> = {}): Product => ({
  id, vendorId: VENDOR_ID, sku: `QA-${id.toUpperCase()}`, name: `QA Product ${id}`, description: `Isolated acceptance product ${id}`,
  category: id === 'gamma' ? 'Hardware' : 'General', size: 'Each', costPrice: 25, sellingPrice: 40, unitOfMeasure: 'pcs',
  location: warehouse.code, shelf, bin: `BIN-${id.toUpperCase()}`, productType: 'INVENTORY', sector: 'GENERAL', taxOption: 'STANDARD_RATED',
  reorderLevel: 2, status: 'active', createdAt: '2026-08-02T00:00:00Z', ...overrides,
});
const fixtureProducts: Product[] = [
  product('alpha', 'Shelf 01'), product('alpha2', 'Shelf 01'), product('beta', 'Shelf 02'), product('gamma', 'Shelf 03'), product('delta', 'Shelf 04'),
  product('archived', 'Shelf 05', { status: 'archived' }), product('service', 'Shelf 06', { productType: 'SERVICE' }),
  product('noninventory', 'Shelf 07', { productType: 'NON_INVENTORY' }),
];
const initialStock = { alpha: 10, alpha2: 6, beta: 8, gamma: 12, delta: 4 };

interface AuditEvidence { status: string; requestId: string; at: string; reason?: string; }
interface MovementEvidence { id: string; requestId: string; productId: string; before: number; delta: number; after: number; }

export default function StocktakeAcceptanceFixture() {
  const [roleKey, setRoleKey] = useState<keyof typeof roles>('counter');
  const [workspace, setWorkspace] = useState<'stocktake' | 'approvals'>('stocktake');
  const [stock, setStock] = useState<Record<string, number>>(initialStock);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [audit, setAudit] = useState<AuditEvidence[]>([]);
  const [movements, setMovements] = useState<MovementEvidence[]>([]);
  const [biEvents, setBiEvents] = useState<Array<{ type: BIEventType; details: Record<string, unknown> }>>([]);
  const [lastSubmission, setLastSubmission] = useState<any>(null);
  const activeStaff = roles[roleKey];

  const logBI = (type: BIEventType, details: Record<string, unknown>) => {
    const identity = `${type}:${String(details.correlationId || '')}:${String(details.exportFormat || '')}:${String(details.outcome || '')}`;
    setBiEvents(previous => previous.some(item => `${item.type}:${String(item.details.correlationId || '')}:${String(item.details.exportFormat || '')}:${String(item.details.outcome || '')}` === identity) ? previous : [...previous, { type, details }]);
  };

  const submit = async (payload: any) => {
    setLastSubmission(payload);
    const idempotencyKey = String(payload.idempotencyKey || payload.dataPayload?.correlationId || '');
    const id = createIdempotentApprovalRequestId(VENDOR_ID, idempotencyKey);
    if (requests.some(request => request.id === id)) return;
    const now = new Date().toISOString();
    const request = createPendingInventoryRequest({
      id, tenantId: VENDOR_ID, vendorId: VENDOR_ID, entityType: 'STOCKTAKE_ADJUSTMENT', entityId: String(payload.dataPayload.correlationId),
      type: 'stock_adjustment', title: payload.title, description: payload.description, requesterId: activeStaff.id, requesterName: activeStaff.name,
      requesterRole: activeStaff.role, requester: { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role }, warehouseId: warehouse.id, warehouseName: warehouse.name,
      dataPayload: { ...payload.dataPayload, idempotencyKey }, segregationOfDuties: true, notificationAudienceRoles: ['manager', 'sysadmin'],
    }, now);
    setRequests(previous => [...previous, request]);
    setAudit(previous => [...previous, { requestId: id, status: 'PENDING_APPROVAL', at: now }]);
  };

  const decide = (request: ApprovalRequest, decision: 'APPROVED' | 'REJECTED') => {
    const now = new Date().toISOString();
    const decided = decideInventoryRequest(request, decision, { id: roles.manager.id, name: roles.manager.name, role: roles.manager.role }, request.version, decision === 'APPROVED' ? 'QA variance verified.' : 'QA recount required.', now);
    setRequests(previous => previous.map(item => item.id === request.id ? decided : item));
    setAudit(previous => [...previous, { requestId: request.id, status: decision, at: now, reason: decided.reason }]);
  };

  const complete = (request: ApprovalRequest) => {
    if (request.status !== 'APPROVED' || movements.some(movement => movement.requestId === request.id)) return;
    const now = new Date().toISOString();
    const processing = markInventoryRequestProcessing(request, now);
    const nextStock = { ...stock };
    const posted = (request.dataPayload.items || []).map((item, index) => {
      const before = nextStock[item.productId] || 0; const delta = Number(item.quantityDelta || 0); const after = before + delta;
      nextStock[item.productId] = after;
      return { id: `${request.id}:${index}`, requestId: request.id, productId: item.productId, before, delta, after };
    });
    const completed = markInventoryRequestCompleted(processing, now);
    setStock(nextStock); setMovements(previous => [...previous, ...posted]);
    setRequests(previous => previous.map(item => item.id === request.id ? completed : item));
    setAudit(previous => [...previous, { requestId: request.id, status: 'PROCESSING', at: now }, { requestId: request.id, status: 'COMPLETED', at: now }]);
    logBI('INVENTORY_WORKFLOW_TRANSITION', { tenantId: VENDOR_ID, actorId: roles.manager.id, requestId: request.id, outcome: 'completed', correlationId: request.dataPayload.correlationId, timestamp: now });
  };

  const evidence = useMemo(() => ({ requests, stock, movements, audit, biEvents }), [audit, biEvents, movements, requests, stock]);
  const permissionProbes = useMemo(() => {
    const permissions: StocktakePermission[] = ['stocktake.view', 'stocktake.perform', 'stocktake.draft.save', 'stocktake.submit', 'stocktake.print', 'stocktake.export', 'stocktake.view_system_quantity', 'stocktake.view_valuation', 'stocktake.review', 'stocktake.variance.approve'];
    return permissions.map(permission => { try { assertStocktakePermission('cashier', permission); return { permission, denied: false }; } catch { return { permission, denied: true }; } });
  }, []);
  return <div data-testid="qa-authenticated-fixture" className="min-h-screen bg-slate-100 pt-[52px] lg:pt-0 lg:pl-56">
    <nav className="fixed top-0 left-0 right-0 h-[52px] z-40 bg-black text-white lg:hidden flex items-center px-4 font-black">iTred QA · Authenticated Stocktake</nav>
    <aside className="hidden lg:block fixed inset-y-0 left-0 w-56 bg-black text-white p-4 z-30"><strong>iTred QA</strong><p className="text-xs mt-2">Isolated tenant<br />{VENDOR_ID}</p></aside>
    <div className="p-3 lg:p-6">
      <section className="bg-white border border-slate-300 p-3 mb-4 flex flex-wrap items-center gap-3" data-testid="qa-session-bar">
        <strong>Authenticated fixture</strong><label className="text-xs font-bold">Role <select aria-label="QA role" value={roleKey} onChange={event => { setRoleKey(event.target.value as keyof typeof roles); setWorkspace('stocktake'); }} className="border p-2 ml-2"><option value="counter">Authorised stock counter</option><option value="manager">Stocktake manager</option><option value="no_export">No stocktake export permission</option><option value="no_approval">No approval permission</option></select></label>
        <span data-testid="qa-active-identity" className="text-xs">{activeStaff.name} · {activeStaff.role}</span>
        <button onClick={() => setWorkspace('stocktake')} className="border px-3 py-2 text-xs font-bold">Stocktake</button><button onClick={() => setWorkspace('approvals')} className="border px-3 py-2 text-xs font-bold">Approvals Queue</button>
      </section>
      {workspace === 'stocktake' ? <StocktakeWorkspace products={fixtureProducts} warehouses={[warehouse]} branches={[]} warehouseStock={stock} branchStock={{}} activeStaff={activeStaff} vendorId={VENDOR_ID} businessName="iTred Isolated QA Company" approvalRequests={requests} onSubmitStocktakeApproval={submit} onNavigateToApprovals={() => setWorkspace('approvals')} onLogBIEvent={logBI} /> : <section data-testid="qa-approvals" className="bg-white border p-5 space-y-4"><h1 className="font-black text-xl">Manager Approvals Queue</h1>{requests.length === 0 && <p>No approval requests.</p>}{requests.map(request => <article key={request.id} data-testid="qa-approval-request" className="border-l-4 border-[#FF6600] p-4"><h2 className="font-black">{request.title}</h2><p className="text-xs">{request.id} · {request.status}</p><p className="text-xs">Idempotency: {String(request.dataPayload.idempotencyKey)}</p><div className="flex gap-2 mt-3"><button disabled={activeStaff.role !== 'manager' || request.status !== 'PENDING_APPROVAL'} onClick={() => decide(request, 'APPROVED')} className="bg-emerald-700 text-white p-2 disabled:opacity-40">Approve</button><button disabled={activeStaff.role !== 'manager' || request.status !== 'PENDING_APPROVAL'} onClick={() => decide(request, 'REJECTED')} className="bg-red-700 text-white p-2 disabled:opacity-40">Reject</button><button disabled={activeStaff.role !== 'manager' || request.status !== 'APPROVED'} onClick={() => complete(request)} className="bg-slate-900 text-white p-2 disabled:opacity-40">Post Approved Adjustment</button></div></article>)}</section>}
      <details className="mt-5 bg-white border p-3"><summary className="font-black">QA evidence state</summary><button data-testid="qa-retry-submission" disabled={!lastSubmission} onClick={() => lastSubmission && submit(lastSubmission)} className="border px-2 py-1 text-xs disabled:opacity-40">Retry last submission</button><pre data-testid="qa-permission-probes" className="text-[10px] overflow-auto">{JSON.stringify(permissionProbes, null, 2)}</pre><pre data-testid="qa-evidence-state" className="text-[10px] overflow-auto">{JSON.stringify(evidence, null, 2)}</pre></details>
      <div data-testid="qa-scroll-fixture" className="h-[1000px]" aria-hidden="true" />
    </div>
  </div>;
}
