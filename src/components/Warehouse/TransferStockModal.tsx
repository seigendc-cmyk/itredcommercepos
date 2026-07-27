import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Search, Trash2 } from 'lucide-react';
import { Modal } from '../Common/Modal';
import { Branch, Product, StaffMember, Warehouse } from '../../types';
import { fetchWarehouseStock, transferStockFromWarehouse } from '../../services/db';
import {
  addTransferLine,
  assertRequestedStockAvailable,
  assertWarehouseToBranchRoute,
  searchTransferProducts,
  TransferDraftLine,
} from '../../services/stockTransferWorkflow';
import { ProductLedgerModal } from './ProductLedgerModal';

interface TransferStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string;
  warehouses: Warehouse[];
  branches: Branch[];
  products: Product[];
  warehouseStock: Record<string, number>;
  activeStaff: StaffMember;
  onSuccess: () => void;
}

export const TransferStockModal: React.FC<TransferStockModalProps> = ({
  isOpen,
  onClose,
  vendorId,
  warehouses,
  branches,
  products,
  warehouseStock,
  activeStaff,
  onSuccess,
}) => {
  const activeWarehouses = warehouses.filter(item =>
    item.status !== 'archived' && item.status !== 'suspended' && item.licenseStatus !== 'unlicensed');
  const activeBranches = branches.filter(item =>
    item.status !== 'archived' && item.status !== 'suspended' && item.licenseStatus !== 'unlicensed');
  const defaultWarehouse = activeWarehouses.find(item => item.isDefault) || activeWarehouses[0];
  const defaultBranch = activeBranches.find(item => item.isDefault) || activeBranches[0];
  const [warehouseId, setWarehouseId] = useState(defaultWarehouse?.id || '');
  const [targetBranchId, setTargetBranchId] = useState(defaultBranch?.id || '');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedResult, setHighlightedResult] = useState(0);
  const [lineItems, setLineItems] = useState<TransferDraftLine[]>([]);
  const [sourceStock, setSourceStock] = useState<Record<string, number>>(warehouseStock);
  const [ledgerProduct, setLedgerProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const sourceWarehouse = activeWarehouses.find(item => item.id === warehouseId);
  const targetBranch = activeBranches.find(item => item.id === targetBranchId);
  const searchResults = useMemo(
    () => searchTransferProducts(products, searchTerm).slice(0, 8),
    [products, searchTerm],
  );

  useEffect(() => {
    if (!isOpen || !warehouseId) return;
    if (warehouseId === defaultWarehouse?.id) {
      setSourceStock(warehouseStock);
      return;
    }
    void fetchWarehouseStock(vendorId, warehouseId)
      .then(setSourceStock)
      .catch(() => setSourceStock({}));
  }, [defaultWarehouse?.id, isOpen, vendorId, warehouseId, warehouseStock]);

  const addProduct = (product: Product) => {
    const incoming: TransferDraftLine = {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      quantityRequested: 1,
      quantityApproved: 0,
      quantityDispatched: 0,
      quantityReceived: 0,
      unitOfMeasure: product.unit,
    };
    try {
      setLineItems(current => addTransferLine(current, incoming));
      setSearchTerm('');
      setHighlightedResult(0);
      setError('');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to add this product.');
    }
  };

  const updateLine = (index: number, patch: Partial<TransferDraftLine>) => {
    setLineItems(current => current.map((line, lineIndex) =>
      lineIndex === index ? { ...line, ...patch } : line,
    ));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sourceWarehouse || !targetBranch) {
      setError('Select an active warehouse and active destination branch.');
      return;
    }
    if (lineItems.length === 0) {
      setError('Add at least one product to the transfer.');
      return;
    }
    try {
      assertWarehouseToBranchRoute(
        vendorId,
        'warehouse',
        sourceWarehouse,
        'branch',
        targetBranch,
      );
      assertRequestedStockAvailable(lineItems, sourceStock);
      setIsSubmitting(true);
      setError('');
      await transferStockFromWarehouse(
        vendorId,
        sourceWarehouse.id,
        sourceWarehouse.name,
        targetBranch.id,
        targetBranch.name,
        lineItems.map(line => ({
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantityRequested,
          sku: line.sku,
          unitOfMeasure: line.unitOfMeasure,
          batchNumber: line.batchNumber,
          serialNumber: line.serialNumber,
        })),
        notes.trim(),
        { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role },
      );
      onSuccess();
      onClose();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Stock transfer submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Transfer Stock to Branch"
        subtitle="Controlled central warehouse dispatch" maxWidth="4xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}

          <div className="grid grid-cols-1 gap-4 rounded-xl border border-orange-100 bg-orange-50 p-4 md:grid-cols-2">
            <label className="text-xs font-bold text-[#1F242D]">
              Active source warehouse
              <select value={warehouseId} onChange={event => setWarehouseId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                {activeWarehouses.map(warehouse => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-[#1F242D]">
              Active destination branch
              <select value={targetBranchId} onChange={event => setTargetBranchId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                {activeBranches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>
                ))}
              </select>
            </label>
          </div>

          <div className="relative">
            <label className="text-xs font-bold text-[#1F242D]">Find a warehouse product</label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input value={searchTerm}
                onChange={event => {
                  setSearchTerm(event.target.value);
                  setHighlightedResult(0);
                }}
                onKeyDown={event => {
                  if (event.key === 'ArrowDown' && searchResults.length > 0) {
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
                placeholder="Search SKU, name, brand, barcode or manufacturer reference"
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 focus:ring-2 focus:ring-[#FF6600]" />
            </div>
            {searchTerm && searchResults.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                {searchResults.map((product, index) => (
                  <button key={product.id} type="button" onClick={() => addProduct(product)}
                    className={`flex w-full justify-between rounded-lg px-3 py-2 text-left text-xs ${
                      index === highlightedResult ? 'bg-orange-50' : 'hover:bg-slate-50'
                    }`}>
                    <span><strong>{product.name}</strong><span className="ml-2 font-mono text-[#FF6600]">{product.sku}</span></span>
                    <span className="text-slate-500">{product.brand || product.manufacturerCode || product.barcode}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1120px] text-left text-xs">
              <thead className="bg-[#1F242D] text-white">
                <tr>
                  <th className="p-3">SKU / Product</th><th className="p-3 text-right">Available</th>
                  <th className="p-3 text-right">Requested</th><th className="p-3 text-right">Approved</th>
                  <th className="p-3 text-right">Dispatched</th><th className="p-3 text-right">Received</th>
                  <th className="p-3 text-right">Outstanding</th><th className="p-3">Batch / serial / unit</th><th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.map((line, index) => (
                  <tr key={`${line.productId}-${line.batchNumber || ''}-${line.serialNumber || ''}-${line.unitOfMeasure}`}>
                    <td className="p-3">
                      <p className="font-mono font-bold text-[#FF6600]">{line.sku}</p>
                      <button type="button"
                        onDoubleClick={() => setLedgerProduct(products.find(product => product.id === line.productId) || null)}
                        className="font-bold hover:text-[#FF6600] hover:underline"
                        title="Double-click to open warehouse ledger">{line.productName}</button>
                    </td>
                    <td className="p-3 text-right font-bold">{sourceStock[line.productId] || 0}</td>
                    <td className="p-3"><input type="number" min="1" max={sourceStock[line.productId] || 0}
                      value={line.quantityRequested}
                      onChange={event => updateLine(index, { quantityRequested: Math.max(1, Number(event.target.value) || 1) })}
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right font-bold" /></td>
                    <td className="p-3 text-right">{line.quantityApproved}</td>
                    <td className="p-3 text-right">{line.quantityDispatched}</td>
                    <td className="p-3 text-right">{line.quantityReceived}</td>
                    <td className="p-3 text-right">{line.quantityDispatched - line.quantityReceived}</td>
                    <td className="p-3">
                      <input value={line.batchNumber || ''} onChange={event => updateLine(index, { batchNumber: event.target.value })}
                        placeholder="Batch" className="mb-1 w-24 rounded border border-slate-200 px-2 py-1" />
                      <input value={line.serialNumber || ''} onChange={event => updateLine(index, { serialNumber: event.target.value })}
                        placeholder="Serial" className="mb-1 ml-1 w-24 rounded border border-slate-200 px-2 py-1" />
                      <input value={line.unitOfMeasure} onChange={event => updateLine(index, { unitOfMeasure: event.target.value })}
                        placeholder="Unit" className="w-24 rounded border border-slate-200 px-2 py-1" />
                    </td>
                    <td className="p-3"><button type="button"
                      onClick={() => setLineItems(current => current.filter((_, itemIndex) => itemIndex !== index))}
                      aria-label={`Remove ${line.productName}`} className="text-slate-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button></td>
                  </tr>
                ))}
                {lineItems.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-slate-500">Search and add products to transfer.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <label className="block text-xs font-bold text-[#1F242D]">
            Dispatch reference / notes
            <textarea value={notes} onChange={event => setNotes(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="submit" disabled={isSubmitting}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#FF6600] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
              <ArrowLeftRight className="h-4 w-4" />
              {isSubmitting ? 'Submitting…' : 'Submit Transfer for Approval'}
            </button>
          </div>
        </form>
      </Modal>

      <ProductLedgerModal
        isOpen={ledgerProduct !== null}
        onClose={() => setLedgerProduct(null)}
        vendorId={vendorId}
        warehouse={sourceWarehouse}
        product={ledgerProduct}
      />
    </>
  );
};
