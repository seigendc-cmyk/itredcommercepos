import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, PackageCheck, Search, Trash2, Truck } from 'lucide-react';
import { Modal } from '../Common/Modal';
import { Product, PurchaseOrder, StaffMember, Supplier, Warehouse } from '../../types';
import {
  fetchSupplierPurchaseOrders,
  fetchSuppliers,
  receiveSupplierStock,
} from '../../services/db';
import {
  assertReceiptAllowed,
  compareReceiptToPurchaseOrder,
  mergeReceiptLine,
  ReceiptDraftLine,
  searchReceivingProducts,
} from '../../services/supplierReceiving';
import { ProductLedgerModal } from './ProductLedgerModal';
import { AddSupplierModal } from '../Suppliers/AddSupplierModal';

interface ReceiveSupplierStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string;
  warehouses: Warehouse[];
  products: Product[];
  warehouseStock: Record<string, number>;
  activeStaff: StaffMember;
  onSuccess: () => void;
}

export const ReceiveSupplierStockModal: React.FC<ReceiveSupplierStockModalProps> = ({
  isOpen,
  onClose,
  vendorId,
  warehouses,
  products,
  warehouseStock,
  activeStaff,
  onSuccess,
}) => {
  const activeWarehouses = warehouses.filter(warehouse =>
    warehouse.status !== 'archived' &&
    warehouse.status !== 'suspended' &&
    warehouse.licenseStatus !== 'unlicensed',
  );
  const defaultWarehouse = activeWarehouses.find(warehouse => warehouse.isDefault) || activeWarehouses[0];
  const [warehouseId, setWarehouseId] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedResult, setHighlightedResult] = useState(0);
  const [lineItems, setLineItems] = useState<ReceiptDraftLine[]>([]);
  const [exceptionRequested, setExceptionRequested] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');
  const [ledgerProduct, setLedgerProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState('');
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setWarehouseId(current => current || defaultWarehouse?.id || '');
    setLoadingSuppliers(true);
    setError('');
    void fetchSuppliers(vendorId)
      .then(loaded => {
        setSuppliers(loaded);
        setSupplierId(current => current || loaded[0]?.id || '');
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Unable to load suppliers.');
      })
      .finally(() => setLoadingSuppliers(false));
  }, [defaultWarehouse?.id, isOpen, vendorId]);

  useEffect(() => {
    if (!isOpen || !supplierId) {
      setPurchaseOrders([]);
      setPurchaseOrderId('');
      return;
    }
    setLoadingOrders(true);
    setPurchaseOrderId('');
    setLineItems([]);
    void fetchSupplierPurchaseOrders(vendorId, supplierId)
      .then(setPurchaseOrders)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Unable to load supplier purchase orders.');
      })
      .finally(() => setLoadingOrders(false));
  }, [isOpen, supplierId, vendorId]);

  const selectedSupplier = suppliers.find(supplier => supplier.id === supplierId);
  const selectedPurchaseOrder = purchaseOrders.find(order => order.id === purchaseOrderId);
  const searchResults = useMemo(
    () => searchReceivingProducts(products, searchTerm).slice(0, 8),
    [products, searchTerm],
  );
  const comparisons = useMemo(
    () => compareReceiptToPurchaseOrder(lineItems, selectedPurchaseOrder),
    [lineItems, selectedPurchaseOrder],
  );
  const hasOverReceipt = comparisons.some(line => line.status === 'OVER_RECEIPT');
  const grandTotal = lineItems.reduce((sum, item) => sum + (item.acceptedQuantity ?? item.quantity) * item.unitCost, 0);

  const addProduct = (product: Product) => {
    const poItem = selectedPurchaseOrder?.items.find(item => item.productId === product.id);
    const outstanding = poItem
      ? Math.max(0, poItem.orderedQuantity - poItem.receivedQuantity)
      : 0;
    const incoming: ReceiptDraftLine = {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      quantity: outstanding > 0 ? outstanding : 1,
      deliveredQuantity: outstanding > 0 ? outstanding : 1,
      acceptedQuantity: outstanding > 0 ? outstanding : 1,
      damagedQuantity: 0,
      quarantinedQuantity: 0,
      rejectedQuantity: 0,
      unitCost: poItem?.unitCost ?? product.costPrice,
      unitOfMeasure: poItem?.unitOfMeasure || product.unit,
      batchNumber: poItem?.batchNumber,
      orderedQuantity: poItem?.orderedQuantity || 0,
      previouslyReceivedQuantity: poItem?.receivedQuantity || 0,
    };
    try {
      setLineItems(current => mergeReceiptLine(current, incoming));
      setSearchTerm('');
      setHighlightedResult(0);
      setError('');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to add this product.');
    }
  };

  const updateLine = (index: number, patch: Partial<ReceiptDraftLine>) => {
    setLineItems(current => current.map((line, lineIndex) =>
      lineIndex === index ? { ...line, ...patch } : line,
    ));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSupplier) {
      setError('Select a supplier.');
      return;
    }
    if (!warehouseId || !activeWarehouses.some(warehouse => warehouse.id === warehouseId)) {
      setError('Select an active licensed destination warehouse.');
      return;
    }
    if (lineItems.length === 0) {
      setError('Add at least one product to the receipt.');
      return;
    }
    try {
      assertReceiptAllowed('warehouse', comparisons, exceptionRequested);
      if (hasOverReceipt && exceptionRequested && !exceptionReason.trim()) {
        throw new Error('Provide a reason for the over-receipt exception request.');
      }
      setIsSubmitting(true);
      setError('');
      await receiveSupplierStock(
        vendorId,
        warehouseId,
        selectedSupplier.id,
        selectedSupplier.name,
        selectedPurchaseOrder?.orderNumber || referenceNo.trim() || `REC-${Date.now()}`,
        lineItems,
        notes.trim(),
        { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role },
        selectedPurchaseOrder,
        { requested: hasOverReceipt && exceptionRequested, reason: exceptionReason },
      );
      onSuccess();
      onClose();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Failed to submit supplier stock receipt.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Receive Stock from Supplier"
        subtitle="Purchase-order comparison and controlled warehouse intake"
        maxWidth="4xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-[#1F242D]">
            <Truck className="mt-0.5 h-5 w-5 shrink-0 text-[#FF6600]" />
            <p><strong>Warehouse-only intake:</strong> stock increases only after this receipt is approved and completed atomically.</p>
          </div>

          {error && (
            <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-xs font-bold text-[#1F242D]">
              Destination warehouse
              <select value={warehouseId} onChange={event => setWarehouseId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                {activeWarehouses.map(warehouse => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-[#1F242D]">
              Supplier
              <select value={supplierId} disabled={loadingSuppliers} onChange={event => { if (event.target.value === '__add_new__') setAddSupplierOpen(true); else setSupplierId(event.target.value); }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <option value="">{loadingSuppliers ? 'Loading suppliers…' : 'Select supplier'}</option>
                <option value="__add_new__">＋ Add New Supplier…</option>
                {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-[#1F242D]">
              Open purchase order (optional)
              <select value={purchaseOrderId} disabled={!supplierId || loadingOrders}
                onChange={event => {
                  setPurchaseOrderId(event.target.value);
                  setLineItems([]);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <option value="">{loadingOrders ? 'Loading orders…' : 'Free-order receipt'}</option>
                {purchaseOrders.map(order => (
                  <option key={order.id} value={order.id}>
                    {order.orderNumber} • {order.status.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-[#1F242D]">
              Free-order invoice/reference
              <input value={referenceNo} disabled={Boolean(selectedPurchaseOrder)}
                onChange={event => setReferenceNo(event.target.value)}
                placeholder="Supplier invoice or delivery note"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 disabled:bg-slate-100" />
            </label>
          </div>

          <div className="relative">
            <label className="text-xs font-bold text-[#1F242D]">Find a product</label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input value={searchTerm}
                onChange={event => {
                  setSearchTerm(event.target.value);
                  setHighlightedResult(0);
                }}
                onKeyDown={event => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setHighlightedResult(current => Math.min(current + 1, searchResults.length - 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setHighlightedResult(current => Math.max(0, current - 1));
                  } else if (event.key === 'Enter' && searchResults[highlightedResult]) {
                    event.preventDefault();
                    addProduct(searchResults[highlightedResult]);
                  }
                }}
                placeholder="Search SKU, name, brand, manufacturer code or barcode"
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 focus:ring-2 focus:ring-[#FF6600]" />
            </div>
            {searchTerm && searchResults.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                {searchResults.map((product, index) => (
                  <button key={product.id} type="button" onClick={() => addProduct(product)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${
                      index === highlightedResult ? 'bg-orange-50 text-[#1F242D]' : 'hover:bg-slate-50'
                    }`}>
                    <span><strong>{product.name}</strong><span className="ml-2 font-mono text-[#FF6600]">{product.sku}</span></span>
                    <span className="text-slate-500">{product.brand || product.manufacturerCode || product.barcode}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1180px] text-left text-xs">
              <thead className="bg-[#1F242D] text-white">
                <tr>
                  <th className="p-3">SKU / Product</th><th className="p-3 text-right">Ordered</th>
                  <th className="p-3 text-right">Previously received</th><th className="p-3 text-right">Delivered</th>
                  <th className="p-3 text-right">Accepted</th><th className="p-3 text-right">Damaged</th>
                  <th className="p-3 text-right">Quarantine</th><th className="p-3 text-right">Rejected</th>
                  <th className="p-3 text-right">Outstanding</th><th className="p-3 text-right">Warehouse available</th>
                  <th className="p-3 text-right">Unit cost</th><th className="p-3 text-right">Variance</th>
                  <th className="p-3">Batch / unit</th><th className="p-3">Status</th><th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparisons.map((line, index) => (
                  <tr key={`${line.productId}-${line.batchNumber || ''}-${line.unitOfMeasure}`}>
                    <td className="p-3">
                      <p className="font-mono font-bold text-[#FF6600]">{line.sku}</p>
                      <button type="button" onDoubleClick={() => setLedgerProduct(products.find(product => product.id === line.productId) || null)}
                        className="font-bold text-[#1F242D] underline-offset-2 hover:text-[#FF6600] hover:underline"
                        title="Double-click to open product ledger">{line.productName}</button>
                    </td>
                    <td className="p-3 text-right">{line.orderedQuantity}</td>
                    <td className="p-3 text-right">{line.previouslyReceivedQuantity}</td>
                    <td className="p-3 text-right font-bold">{line.deliveredQuantity}</td>
                    <td className="p-3"><input type="number" min="0" value={line.acceptedQuantity}
                      onChange={event => { const acceptedQuantity = Math.max(0, Number(event.target.value) || 0); updateLine(index, { quantity: acceptedQuantity, acceptedQuantity, deliveredQuantity: acceptedQuantity + (line.damagedQuantity || 0) + (line.quarantinedQuantity || 0) + (line.rejectedQuantity || 0) }); }}
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right font-bold" /></td>
                    <td className="p-3"><input type="number" min="0" value={line.damagedQuantity || 0} onChange={event => { const damagedQuantity = Math.max(0, Number(event.target.value) || 0); updateLine(index, { damagedQuantity, deliveredQuantity: (line.acceptedQuantity || 0) + damagedQuantity + (line.quarantinedQuantity || 0) + (line.rejectedQuantity || 0) }); }} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right" /></td>
                    <td className="p-3"><input type="number" min="0" value={line.quarantinedQuantity || 0} onChange={event => { const quarantinedQuantity = Math.max(0, Number(event.target.value) || 0); updateLine(index, { quarantinedQuantity, deliveredQuantity: (line.acceptedQuantity || 0) + (line.damagedQuantity || 0) + quarantinedQuantity + (line.rejectedQuantity || 0) }); }} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right" /></td>
                    <td className="p-3"><input type="number" min="0" value={line.rejectedQuantity || 0} onChange={event => { const rejectedQuantity = Math.max(0, Number(event.target.value) || 0); updateLine(index, { rejectedQuantity, deliveredQuantity: (line.acceptedQuantity || 0) + (line.damagedQuantity || 0) + (line.quarantinedQuantity || 0) + rejectedQuantity }); }} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right" /></td>
                    <td className="p-3 text-right">{line.outstandingAfterReceipt}</td>
                    <td className="p-3 text-right">{warehouseStock[line.productId] || 0}</td>
                    <td className="p-3"><input type="number" min="0" step="0.01" value={line.unitCost}
                      onChange={event => updateLine(index, { unitCost: Number(event.target.value) || 0 })}
                      className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right" /></td>
                    <td className={`p-3 text-right font-bold ${line.variance > 0 ? 'text-red-700' : 'text-slate-700'}`}>{line.variance}</td>
                    <td className="p-3">
                      <input value={line.batchNumber || ''} onChange={event => updateLine(index, { batchNumber: event.target.value })}
                        placeholder="Batch" className="mb-1 w-24 rounded border border-slate-200 px-2 py-1" />
                      <input value={line.unitOfMeasure} onChange={event => updateLine(index, { unitOfMeasure: event.target.value })}
                        placeholder="Unit" className="w-24 rounded border border-slate-200 px-2 py-1" />
                    </td>
                    <td className="p-3"><span className={`rounded-full px-2 py-1 font-bold ${
                      line.status === 'OVER_RECEIPT' ? 'bg-red-100 text-red-700' :
                      line.status === 'MATCHED' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-orange-100 text-orange-800'
                    }`}>{line.status.replaceAll('_', ' ')}</span></td>
                    <td className="p-3"><button type="button" onClick={() => setLineItems(current => current.filter((_, itemIndex) => itemIndex !== index))}
                      aria-label={`Remove ${line.productName}`} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
                {comparisons.length === 0 && <tr><td colSpan={15} className="p-8 text-center text-slate-500">Search and add products to receive.</td></tr>}
              </tbody>
            </table>
          </div>

          {hasOverReceipt && (
            <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <label className="flex items-center gap-2 text-xs font-bold text-red-800">
                <input type="checkbox" checked={exceptionRequested} onChange={event => setExceptionRequested(event.target.checked)} />
                Request an authorised over-receipt exception
              </label>
              {exceptionRequested && <textarea value={exceptionReason} onChange={event => setExceptionReason(event.target.value)}
                placeholder="Explain the over-receipt variance for the approver"
                className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs" />}
            </div>
          )}

          <label className="block text-xs font-bold text-[#1F242D]">
            Notes
            <textarea value={notes} onChange={event => setNotes(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-[#1F242D]"><PackageCheck className="mr-2 inline h-4 w-4 text-[#FF6600]" />Receipt value: ${grandTotal.toFixed(2)}</p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="submit" disabled={isSubmitting || !selectedSupplier}
                className="rounded-xl bg-[#FF6600] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                {isSubmitting ? 'Submitting…' : 'Submit Receipt for Approval'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <ProductLedgerModal
        isOpen={ledgerProduct !== null}
        onClose={() => setLedgerProduct(null)}
        vendorId={vendorId}
        warehouse={activeWarehouses.find(warehouse => warehouse.id === warehouseId)}
        product={ledgerProduct}
      />
      <AddSupplierModal isOpen={addSupplierOpen} onClose={() => setAddSupplierOpen(false)} vendorId={vendorId} activeStaff={activeStaff} onCreated={supplier => { setSuppliers(current => [...current, supplier].sort((a, b) => a.name.localeCompare(b.name))); setSupplierId(supplier.id); }} />
    </>
  );
};
