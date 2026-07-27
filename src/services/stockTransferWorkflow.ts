import {
  Branch,
  Product,
  ResourceLifecycleStatus,
  StaffRole,
  Warehouse,
} from '../types';

export interface TransferDraftLine {
  productId: string;
  productName: string;
  sku: string;
  quantityRequested: number;
  quantityApproved: number;
  quantityDispatched: number;
  quantityReceived: number;
  unitOfMeasure: string;
  batchNumber?: string;
  serialNumber?: string;
}

export class StockTransferWorkflowError extends Error {
  constructor(
    readonly code:
      | 'wrong_source_type'
      | 'wrong_destination_type'
      | 'tenant_mismatch'
      | 'inactive_resource'
      | 'insufficient_stock'
      | 'duplicate_line'
      | 'duplicate_processing'
      | 'reason_required'
      | 'unauthorized',
    message: string,
  ) {
    super(message);
    this.name = 'StockTransferWorkflowError';
  }
}

function isActive(
  resource: { status?: ResourceLifecycleStatus | 'inactive'; licenseStatus?: string },
): boolean {
  return resource.status !== 'suspended' &&
    resource.status !== 'archived' &&
    resource.status !== 'inactive' &&
    resource.licenseStatus !== 'unlicensed';
}

export function assertWarehouseToBranchRoute(
  vendorId: string,
  sourceType: 'warehouse' | 'branch',
  source: Warehouse | Branch,
  destinationType: 'warehouse' | 'branch',
  destination: Warehouse | Branch,
): void {
  if (sourceType !== 'warehouse' || !('location' in source)) {
    throw new StockTransferWorkflowError('wrong_source_type', 'Transfer source must be an active warehouse.');
  }
  if (destinationType !== 'branch' || !('address' in destination)) {
    throw new StockTransferWorkflowError('wrong_destination_type', 'Transfer destination must be an active branch.');
  }
  if (source.vendorId !== vendorId || destination.vendorId !== vendorId) {
    throw new StockTransferWorkflowError('tenant_mismatch', 'Transfer resources must belong to the same vendor tenant.');
  }
  if (!isActive(source) || !isActive(destination)) {
    throw new StockTransferWorkflowError('inactive_resource', 'Transfer resources must be active and licensed.');
  }
}

export function searchTransferProducts(products: Product[], query: string): Product[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return products.filter(product =>
    product.sku.toLowerCase().includes(normalized) ||
    product.name.toLowerCase().includes(normalized) ||
    Boolean(product.brand?.toLowerCase().includes(normalized)) ||
    Boolean(product.barcode?.toLowerCase().includes(normalized)) ||
    Boolean(product.manufacturerCode?.toLowerCase().includes(normalized)),
  );
}

function lineKey(line: TransferDraftLine): string {
  return [
    line.productId,
    line.batchNumber?.trim().toLowerCase() || '',
    line.serialNumber?.trim().toLowerCase() || '',
    line.unitOfMeasure.trim().toLowerCase(),
  ].join('|');
}

export function addTransferLine(
  lines: TransferDraftLine[],
  incoming: TransferDraftLine,
): TransferDraftLine[] {
  if (lines.some(line => lineKey(line) === lineKey(incoming))) {
    throw new StockTransferWorkflowError(
      'duplicate_line',
      'This product, batch, serial and unit context is already on the transfer.',
    );
  }
  return [...lines, incoming];
}

export function assertRequestedStockAvailable(
  lines: TransferDraftLine[],
  availableStock: Record<string, number>,
): void {
  const totals = new Map<string, number>();
  lines.forEach(line => {
    totals.set(line.productId, (totals.get(line.productId) || 0) + line.quantityRequested);
  });
  totals.forEach((requested, productId) => {
    const available = availableStock[productId] || 0;
    if (requested <= 0 || requested > available) {
      throw new StockTransferWorkflowError(
        'insufficient_stock',
        `Requested quantity ${requested} exceeds source availability ${available}.`,
      );
    }
  });
}

export function assertCanDispatch(status: string): void {
  if (status.toUpperCase() !== 'APPROVED') {
    throw new StockTransferWorkflowError(
      'duplicate_processing',
      'Only an approved, undispatched transfer can be dispatched.',
    );
  }
}

export function validateTransferReceipt(
  role: StaffRole,
  quantityReceived: number,
  outstandingQuantity: number,
  reason: string,
): void {
  if (quantityReceived <= 0 || quantityReceived > outstandingQuantity) {
    throw new StockTransferWorkflowError(
      'insufficient_stock',
      'Received quantity must be positive and cannot exceed stock in transit.',
    );
  }
  if (quantityReceived !== outstandingQuantity) {
    if (!reason.trim()) {
      throw new StockTransferWorkflowError(
        'reason_required',
        'A reason is required for partial receipt or variance.',
      );
    }
    if (role !== 'sysadmin' && role !== 'manager') {
      throw new StockTransferWorkflowError(
        'unauthorized',
        'Partial receipt or variance requires manager review.',
      );
    }
  }
}

export function canAccessTransferLedger(role: StaffRole): boolean {
  return role === 'sysadmin' || role === 'manager' || role === 'warehouse_staff';
}
