export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'ISSUED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CLOSED'
  | 'FAILED';

export type PurchaseOrderPermission = 'purchase_order.create' | 'purchase_order.approve' | 'receiving.approve';

export interface ProcurementMembership {
  tenantId: string;
  vendorId: string;
  userUid: string;
  status: string;
  roleId: string;
  permissions: string[];
  assignedWarehouseIds: string[];
}

export interface CommercialLineInput {
  productId: string;
  orderedQuantity: number;
  unitCost: number;
  discountPercent?: number;
  taxRate?: number;
  taxTreatment?: string;
}

export interface ProductSnapshot {
  id: string;
  vendorId: string;
  tenantId?: string;
  sku: string;
  name: string;
  status?: string;
  productType?: string;
}

export interface PurchaseOrderLine {
  lineId: string;
  productId: string;
  sku: string;
  description: string;
  orderedQuantity: number;
  unitCost: number;
  discountPercent: number;
  lineDiscount: number;
  taxRate: number;
  taxTreatment: string;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  receivedQuantity: number;
  outstandingQuantity: number;
}

export interface PurchaseOrderDocument {
  purchaseOrderId: string;
  id: string;
  tenantId: string;
  vendorId: string;
  supplierId: string;
  supplierName: string;
  destinationWarehouseId: string;
  destinationWarehouseName: string;
  destinationLocationType: 'WAREHOUSE';
  currency: string;
  status: PurchaseOrderStatus;
  version: number;
  orderNumber: string;
  items: PurchaseOrderLine[];
  lines: PurchaseOrderLine[];
  subtotal: number;
  discountTotal: number;
  tax: number;
  total: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  issuedBy?: string;
  issuedAt?: string;
  closedBy?: string;
  closedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  receivedAt?: string;
  statusHistory: Array<{ from: PurchaseOrderStatus | null; to: PurchaseOrderStatus; actorId: string; commandId: string; occurredAt: string; reason?: string }>;
  [key: string]: unknown;
}

export interface ApprovalPolicy {
  segregationOfDuties?: boolean;
  allowSelfApproval?: boolean;
  approvalThresholds?: Array<{ currency: string; maxAmount: number; roleIds: string[] }>;
  allowDiscounts?: boolean;
  maxDiscountPercent?: number;
}

export class PurchaseOrderError extends Error {
  constructor(
    readonly code:
      | 'unauthenticated'
      | 'non_member'
      | 'wrong_tenant'
      | 'missing_permission'
      | 'invalid_destination'
      | 'inactive_warehouse'
      | 'unlicensed_warehouse'
      | 'invalid_supplier'
      | 'invalid_product'
      | 'invalid_commercial_input'
      | 'invalid_transition'
      | 'stale_decision'
      | 'self_approval_forbidden'
      | 'approval_threshold_exceeded'
      | 'commercial_history_immutable'
      | 'over_receipt'
      | 'reason_required',
    message: string,
  ) {
    super(message);
    this.name = 'PurchaseOrderError';
  }
}

const TRANSITIONS: Readonly<Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]>> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['ISSUED', 'CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
  ISSUED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: ['CLOSED'],
  CLOSED: [],
  FAILED: [],
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function finite(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new PurchaseOrderError('invalid_commercial_input', `${label} must be finite.`);
  return number;
}

export function assertProcurementAuthority(
  authUid: string | undefined,
  vendorId: string,
  membership: ProcurementMembership | null,
  permission: PurchaseOrderPermission,
): ProcurementMembership {
  if (!authUid) throw new PurchaseOrderError('unauthenticated', 'Firebase authentication is required.');
  if (!membership) throw new PurchaseOrderError('non_member', 'Active tenant membership is required.');
  if (membership.tenantId !== vendorId || membership.vendorId !== vendorId || membership.userUid !== authUid) {
    throw new PurchaseOrderError('wrong_tenant', 'Tenant membership does not authorize this vendor.');
  }
  if (membership.status !== 'ACTIVE' || !membership.roleId || !Array.isArray(membership.assignedWarehouseIds)) {
    throw new PurchaseOrderError('non_member', 'Active role membership is required.');
  }
  if (!Array.isArray(membership.permissions) || !membership.permissions.includes(permission)) {
    throw new PurchaseOrderError('missing_permission', `Permission ${permission} is required.`);
  }
  return membership;
}

export function assertWarehouseDestination(
  vendorId: string,
  warehouseId: string,
  destinationLocationType: unknown,
  warehouse: Record<string, unknown> | null,
  membership: ProcurementMembership,
): void {
  if (String(destinationLocationType || 'WAREHOUSE').toUpperCase() !== 'WAREHOUSE') {
    throw new PurchaseOrderError('invalid_destination', 'Purchase orders may receive stock into warehouses only.');
  }
  if (!warehouse || String(warehouse.id || '') !== warehouseId || String(warehouse.vendorId || '') !== vendorId || ('tenantId' in warehouse && String(warehouse.tenantId) !== vendorId)) {
    throw new PurchaseOrderError('invalid_destination', 'The destination warehouse is not tenant-owned.');
  }
  const status = String(warehouse.status || '').toLowerCase();
  if (status !== 'active') throw new PurchaseOrderError('inactive_warehouse', 'The destination warehouse must be active.');
  const licence = String(warehouse.licenseStatus || warehouse.licenceStatus || '').toLowerCase();
  if (licence !== 'licensed') throw new PurchaseOrderError('unlicensed_warehouse', 'The destination warehouse must be licensed.');
  if (!membership.permissions.includes('location.all') && !membership.assignedWarehouseIds.includes(warehouseId)) {
    throw new PurchaseOrderError('missing_permission', 'Warehouse assignment is required.');
  }
}

export function assertSupplier(vendorId: string, supplierId: string, supplier: Record<string, unknown> | null): void {
  if (!supplier || String(supplier.id || '') !== supplierId || String(supplier.vendorId || '') !== vendorId || ('tenantId' in supplier && String(supplier.tenantId) !== vendorId)) {
    throw new PurchaseOrderError('invalid_supplier', 'The supplier is not owned by this tenant.');
  }
  if (String(supplier.status || '').toLowerCase() !== 'active') {
    throw new PurchaseOrderError('invalid_supplier', 'The supplier is not active.');
  }
}

export function calculateCommercialLines(
  vendorId: string,
  inputs: CommercialLineInput[],
  products: ProductSnapshot[],
  policy: Pick<ApprovalPolicy, 'allowDiscounts' | 'maxDiscountPercent'> = {},
): { lines: PurchaseOrderLine[]; subtotal: number; discountTotal: number; tax: number; total: number } {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new PurchaseOrderError('invalid_commercial_input', 'At least one purchase-order line is required.');
  const byId = new Map(products.map(product => [product.id, product]));
  const seen = new Set<string>();
  const lines = inputs.map((input, index) => {
    const product = byId.get(String(input.productId || ''));
    if (!product || product.vendorId !== vendorId || (product.tenantId && product.tenantId !== vendorId) || String(product.status || '').toLowerCase() !== 'active' || String(product.productType || 'INVENTORY').toUpperCase() !== 'INVENTORY') {
      throw new PurchaseOrderError('invalid_product', `Line ${index + 1} references an invalid inventory product.`);
    }
    if (seen.has(product.id)) throw new PurchaseOrderError('invalid_product', `Product ${product.id} appears more than once.`);
    seen.add(product.id);
    const orderedQuantity = finite(input.orderedQuantity, 'orderedQuantity');
    const unitCost = finite(input.unitCost, 'unitCost');
    const discountPercent = finite(input.discountPercent ?? 0, 'discountPercent');
    const taxRate = finite(input.taxRate ?? 0, 'taxRate');
    if (orderedQuantity <= 0 || unitCost < 0 || discountPercent < 0 || discountPercent > 100 || taxRate < 0 || taxRate > 100) {
      throw new PurchaseOrderError('invalid_commercial_input', 'Quantities, cost, discount, and tax must be non-negative and within permitted ranges.');
    }
    if (discountPercent > 0 && policy.allowDiscounts === false) throw new PurchaseOrderError('invalid_commercial_input', 'Purchase-order discounts are not permitted by policy.');
    if (policy.maxDiscountPercent !== undefined && (!Number.isFinite(policy.maxDiscountPercent) || discountPercent > policy.maxDiscountPercent)) throw new PurchaseOrderError('invalid_commercial_input', 'Purchase-order discount exceeds the configured policy limit.');
    const lineSubtotal = roundMoney(orderedQuantity * unitCost);
    const lineDiscount = roundMoney(lineSubtotal * discountPercent / 100);
    const lineTax = roundMoney((lineSubtotal - lineDiscount) * taxRate / 100);
    const lineTotal = roundMoney(lineSubtotal - lineDiscount + lineTax);
    return {
      lineId: `line_${index + 1}_${product.id}`,
      productId: product.id,
      sku: String(product.sku || product.id),
      description: String(product.name || product.id),
      orderedQuantity,
      unitCost,
      discountPercent,
      lineDiscount,
      taxRate,
      taxTreatment: String(input.taxTreatment || (taxRate > 0 ? 'STANDARD' : 'EXEMPT')),
      lineSubtotal,
      lineTax,
      lineTotal,
      receivedQuantity: 0,
      outstandingQuantity: orderedQuantity,
    };
  });
  return {
    lines,
    subtotal: roundMoney(lines.reduce((sum, line) => sum + line.lineSubtotal, 0)),
    discountTotal: roundMoney(lines.reduce((sum, line) => sum + line.lineDiscount, 0)),
    tax: roundMoney(lines.reduce((sum, line) => sum + line.lineTax, 0)),
    total: roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0)),
  };
}

export function transitionPurchaseOrder(
  order: PurchaseOrderDocument,
  to: PurchaseOrderStatus,
  actorId: string,
  commandId: string,
  now: string,
  reason?: string,
): PurchaseOrderDocument {
  if (!TRANSITIONS[order.status].includes(to)) {
    throw new PurchaseOrderError('invalid_transition', `Purchase order cannot transition from ${order.status} to ${to}.`);
  }
  return {
    ...order,
    status: to,
    version: order.version + 1,
    updatedAt: now,
    statusHistory: [...order.statusHistory, { from: order.status, to, actorId, commandId, occurredAt: now, ...(reason ? { reason } : {}) }],
  };
}

export function amendDraftPurchaseOrder(
  order: PurchaseOrderDocument,
  commercial: ReturnType<typeof calculateCommercialLines>,
  actorId: string,
  expectedVersion: number,
  now: string,
): PurchaseOrderDocument {
  if (order.version !== expectedVersion) throw new PurchaseOrderError('stale_decision', 'The purchase order changed after it was opened.');
  if (order.status !== 'DRAFT') throw new PurchaseOrderError('commercial_history_immutable', 'Commercial values are immutable after draft submission.');
  return { ...order, ...commercial, items: commercial.lines, lines: commercial.lines, version: order.version + 1, updatedAt: now, lastAmendedBy: actorId };
}

export function assertApprovalAllowed(
  order: PurchaseOrderDocument,
  approver: ProcurementMembership,
  policy: ApprovalPolicy,
  expectedVersion: number,
): void {
  if (order.version !== expectedVersion) throw new PurchaseOrderError('stale_decision', 'The purchase order changed after approval review began.');
  if (order.status !== 'PENDING_APPROVAL') throw new PurchaseOrderError('invalid_transition', 'Only a pending purchase order can be approved.');
  if ((policy.segregationOfDuties ?? true) && !(policy.allowSelfApproval ?? false) && String(order.submittedBy || order.createdBy) === approver.userUid) {
    throw new PurchaseOrderError('self_approval_forbidden', 'Segregation of duties prevents self-approval.');
  }
  const configured = Array.isArray(policy.approvalThresholds) ? policy.approvalThresholds : [];
  if (configured.length > 0) {
    const eligible = configured.some(threshold =>
      threshold.currency === order.currency &&
      threshold.roleIds.includes(approver.roleId) &&
      Number.isFinite(threshold.maxAmount) &&
      order.total <= threshold.maxAmount,
    );
    if (!eligible) throw new PurchaseOrderError('approval_threshold_exceeded', 'The approver is not eligible for this purchase-order amount and currency.');
  }
}

export function applyPurchaseOrderReceipt(
  order: PurchaseOrderDocument,
  receipts: Array<{ lineId?: string; productId?: string; quantity: number }>,
  overReceiptApproved: boolean,
  actorId: string,
  commandId: string,
  now: string,
): PurchaseOrderDocument {
  if (!['ISSUED', 'PARTIALLY_RECEIVED'].includes(order.status)) throw new PurchaseOrderError('invalid_transition', 'Only issued purchase orders can receive supplier stock.');
  if (!Array.isArray(receipts) || receipts.length === 0) throw new PurchaseOrderError('invalid_commercial_input', 'Receipt lines are required.');
  const quantities = new Map<string, number>();
  for (const receipt of receipts) {
    const line = order.lines.find(candidate => (receipt.lineId && candidate.lineId === receipt.lineId) || (receipt.productId && candidate.productId === receipt.productId));
    const quantity = finite(receipt.quantity, 'receipt quantity');
    if (!line || quantity <= 0) throw new PurchaseOrderError('invalid_product', 'The receipt references an invalid purchase-order line.');
    quantities.set(line.lineId, (quantities.get(line.lineId) || 0) + quantity);
  }
  const lines = order.lines.map(line => {
    const receivedQuantity = line.receivedQuantity + (quantities.get(line.lineId) || 0);
    if (receivedQuantity > line.orderedQuantity && !overReceiptApproved) throw new PurchaseOrderError('over_receipt', `Over-receipt is not approved for ${line.description}.`);
    return { ...line, receivedQuantity, outstandingQuantity: Math.max(0, line.orderedQuantity - receivedQuantity) };
  });
  const fullyReceived = lines.every(line => line.outstandingQuantity === 0);
  const next = transitionPurchaseOrder(order, fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED', actorId, commandId, now);
  return { ...next, lines, items: lines, ...(fullyReceived ? { receivedAt: now } : {}) };
}

export function cancelPurchaseOrderDocument(order: PurchaseOrderDocument, actorId: string, commandId: string, reason: string, now: string): PurchaseOrderDocument {
  if (!reason.trim()) throw new PurchaseOrderError('reason_required', 'A cancellation reason is required.');
  if (!['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED'].includes(order.status)) {
    throw new PurchaseOrderError('invalid_transition', `A ${order.status} purchase order cannot be cancelled.`);
  }
  const cancelled = transitionPurchaseOrder(order, 'CANCELLED', actorId, commandId, now, reason.trim());
  return { ...cancelled, cancelledBy: actorId, cancelledAt: now, cancellationReason: reason.trim(), closedOutstandingQuantity: order.lines.reduce((sum, line) => sum + line.outstandingQuantity, 0) };
}
