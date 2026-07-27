import { Product, StaffRole, StockTransfer, WorkflowActor } from '../types';

export type TransferSlipFormat = 'a4' | '80-column';
export type TransferSlipAction = 'previewed' | 'printed' | 'exported';

export interface TransferSlipLine {
  productId: string;
  sku: string;
  productName: string;
  quantitySent: number;
  quantityReceived: number;
  variance: number;
  unitOfMeasure: string;
  trackingDetails: string;
}

export interface TransferSlipModel {
  transferId: string;
  vendorName: string;
  transferNumber: string;
  status: string;
  operational: boolean;
  watermark?: string;
  source: string;
  destination: string;
  requestDate: string;
  approvalDate: string;
  dispatchDate: string;
  expectedReceiptDate: string;
  requester: string;
  approver: string;
  dispatcher: string;
  receivingOfficer: string;
  lines: TransferSlipLine[];
  totalLines: number;
  notes: string;
  barcodeReference: string;
}

const OPERATIONAL_STATUSES = new Set([
  'APPROVED',
  'IN_TRANSIT',
  'PARTIALLY_RECEIVED',
  'COMPLETED',
]);

const PENDING_STATUSES = new Set(['PENDING', 'SUBMITTED', 'PENDING_APPROVAL', 'PROCESSING']);

export class TransferSlipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferSlipError';
  }
}

export function normalizeTransferStatus(status: string): string {
  return status.trim().toUpperCase().replaceAll('-', '_').replaceAll(' ', '_');
}

export function isOperationalTransferStatus(status: string): boolean {
  return OPERATIONAL_STATUSES.has(normalizeTransferStatus(status));
}

export function getTransferWatermark(status: string): string | undefined {
  const normalized = normalizeTransferStatus(status);
  if (PENDING_STATUSES.has(normalized)) return 'PENDING';
  if (normalized === 'DRAFT' || normalized === 'CANCELLED' || normalized === 'REJECTED') {
    return normalized;
  }
  return undefined;
}

export function canRolePreviewTransferSlip(role: StaffRole): boolean {
  return role === 'sysadmin' || role === 'manager' || role === 'warehouse_staff';
}

function actorName(actor?: WorkflowActor): string {
  return actor?.name || 'Not recorded';
}

function dateValue(value?: string): string {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function buildTransferSlipModel(
  transfer: StockTransfer | null | undefined,
  vendorName: string,
  products: Product[] = [],
): TransferSlipModel {
  if (!transfer?.id) {
    throw new TransferSlipError('The transfer does not exist and a slip cannot be generated.');
  }

  const status = normalizeTransferStatus(transfer.status);
  const productById = new Map(products.map(product => [product.id, product]));
  const lines = transfer.items.map(item => {
    const product = productById.get(item.productId);
    const quantitySent = item.quantityDispatched ?? item.quantity;
    const quantityReceived =
      item.quantityReceived ?? (status === 'COMPLETED' ? quantitySent : 0);
    const trackingDetails = [
      item.batchNumber ? `Batch: ${item.batchNumber}` : '',
      item.serialNumber ? `Serial: ${item.serialNumber}` : '',
      item.expiryDate ? `Expiry: ${dateValue(item.expiryDate)}` : '',
    ].filter(Boolean).join(' • ');

    return {
      productId: item.productId,
      sku: item.sku || product?.sku || 'Not recorded',
      productName: item.productName,
      quantitySent,
      quantityReceived,
      variance: quantityReceived - quantitySent,
      unitOfMeasure: item.unitOfMeasure || product?.unit || 'unit',
      trackingDetails: trackingDetails || '—',
    };
  });

  return {
    transferId: transfer.id,
    vendorName,
    transferNumber: transfer.transferNo,
    status,
    operational: isOperationalTransferStatus(status),
    watermark: getTransferWatermark(status),
    source: transfer.sourceBranchName || transfer.sourceWarehouseName,
    destination: transfer.targetBranchName,
    requestDate: dateValue(transfer.requestedAt || transfer.createdAt || transfer.date),
    approvalDate: dateValue(transfer.approvedAt),
    dispatchDate: dateValue(transfer.dispatchedAt),
    expectedReceiptDate: dateValue(transfer.expectedReceiptAt),
    requester: actorName(transfer.requester),
    approver: actorName(transfer.approver),
    dispatcher: actorName(transfer.dispatcher),
    receivingOfficer: actorName(transfer.receivingOfficer),
    lines,
    totalLines: lines.length,
    notes: transfer.notes || 'No notes',
    barcodeReference: transfer.barcodeReference || transfer.transferNo,
  };
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderTransferSlipHtml(
  model: TransferSlipModel,
  format: TransferSlipFormat,
): string {
  const rows = model.lines.map(line => `
    <tr>
      <td>${escapeHtml(line.sku)}</td>
      <td>${escapeHtml(line.productName)}</td>
      <td>${escapeHtml(line.quantitySent)}</td>
      <td>${escapeHtml(line.quantityReceived)}</td>
      <td>${escapeHtml(line.variance)}</td>
      <td>${escapeHtml(line.unitOfMeasure)}</td>
      <td>${escapeHtml(line.trackingDetails)}</td>
    </tr>`).join('');
  const watermark = model.watermark
    ? `<div class="watermark">${escapeHtml(model.watermark)}</div>`
    : '';

  return `
    <article class="transfer-slip transfer-slip--${format}">
      ${watermark}
      <header><h1>${escapeHtml(model.vendorName)}</h1><p>Stock Transfer Slip</p></header>
      <section>
        <p><strong>Transfer:</strong> ${escapeHtml(model.transferNumber)}</p>
        <p><strong>Status:</strong> ${escapeHtml(model.status)}</p>
        <p><strong>Source:</strong> ${escapeHtml(model.source)}</p>
        <p><strong>Destination:</strong> ${escapeHtml(model.destination)}</p>
        <p><strong>Requested:</strong> ${escapeHtml(model.requestDate)}</p>
        <p><strong>Approved:</strong> ${escapeHtml(model.approvalDate)}</p>
        <p><strong>Dispatched:</strong> ${escapeHtml(model.dispatchDate)}</p>
        <p><strong>Expected receipt:</strong> ${escapeHtml(model.expectedReceiptDate)}</p>
        <p><strong>Requester:</strong> ${escapeHtml(model.requester)}</p>
        <p><strong>Approver:</strong> ${escapeHtml(model.approver)}</p>
        <p><strong>Dispatcher:</strong> ${escapeHtml(model.dispatcher)}</p>
        <p><strong>Receiving officer:</strong> ${escapeHtml(model.receivingOfficer)}</p>
      </section>
      <table>
        <thead><tr><th>SKU</th><th>Product</th><th>Sent</th><th>Received</th><th>Variance</th><th>UOM</th><th>Batch / serial / expiry</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p><strong>Total lines:</strong> ${model.totalLines}</p>
      <p><strong>Notes:</strong> ${escapeHtml(model.notes)}</p>
      <p class="reference"><strong>Reference:</strong> ${escapeHtml(model.barcodeReference)}</p>
      <footer>
        <p>Dispatched by: ____________________ Date: __________</p>
        <p>Received by: ______________________ Date: __________</p>
      </footer>
    </article>`.trim();
}
