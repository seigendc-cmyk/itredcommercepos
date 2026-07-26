import React, { useState } from 'react';
import { Modal } from '../Common/Modal';
import { Warehouse, Product } from '../../types';
import { receiveSupplierStock } from '../../services/db';
import { Plus, Trash2, AlertCircle, PackageCheck, Truck } from 'lucide-react';

interface ReceiveSupplierStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string;
  warehouses: Warehouse[];
  products: Product[];
  onSuccess: () => void;
}

export const ReceiveSupplierStockModal: React.FC<ReceiveSupplierStockModalProps> = ({
  isOpen,
  onClose,
  vendorId,
  warehouses,
  products,
  onSuccess
}) => {
  const defaultWarehouse = warehouses.find(w => w.isDefault) || warehouses[0];
  const [warehouseId, setWarehouseId] = useState(defaultWarehouse?.id || '');
  const [supplierName, setSupplierName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  
  const [lineItems, setLineItems] = useState<{
    productId: string;
    quantity: number;
    unitCost: number;
  }>([
    { productId: products[0]?.id || '', quantity: 50, unitCost: products[0]?.costPrice || 10 }
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAddLine = () => {
    const firstUnused = products.find(p => !lineItems.some(item => item.productId === p.id)) || products[0];
    if (firstUnused) {
      setLineItems([
        ...lineItems,
        { productId: firstUnused.id, quantity: 10, unitCost: firstUnused.costPrice }
      ]);
    }
  };

  const handleRemoveLine = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const handleProductChange = (index: number, pId: string) => {
    const prod = products.find(p => p.id === pId);
    const updated = [...lineItems];
    updated[index].productId = pId;
    if (prod) {
      updated[index].unitCost = prod.costPrice;
    }
    setLineItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) {
      setError('Please enter the Supplier Name.');
      return;
    }

    const validItems = lineItems.filter(i => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      setError('Please add at least one product with quantity > 0.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const formattedItems = validItems.map(item => {
        const prod = products.find(p => p.id === item.productId);
        return {
          productId: item.productId,
          productName: prod ? prod.name : 'Unknown Product',
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost)
        };
      });

      await receiveSupplierStock(
        vendorId,
        warehouseId || defaultWarehouse.id,
        supplierName.trim(),
        referenceNo.trim() || `PO-${Math.floor(1000 + Math.random() * 9000)}`,
        formattedItems,
        notes.trim()
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to record supplier stock receipt.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const grandTotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Receive Stock from Supplier"
      subtitle="Exclusively received into Central Warehouse first"
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        
        {/* Mandatory Rule Banner */}
        <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-3.5 text-xs sm:text-sm text-amber-900 flex items-start gap-3">
          <Truck className="w-5 h-5 text-[#FF6600] shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-slate-900">iTred Inventory Rule</p>
            <p className="text-slate-700 mt-0.5">
              All supplier shipments MUST be received into the <span className="font-bold text-slate-900">Central Warehouse</span> first before being distributed to retail branches.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Destination Central Warehouse <span className="text-[#FF6600]">*</span>
            </label>
            <select
              value={warehouseId || defaultWarehouse?.id}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Supplier / Distributor Name <span className="text-[#FF6600]">*</span>
            </label>
            <input
              type="text"
              required
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="e.g. Acme Logistics & Distributors"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Purchase Order / Invoice Ref #
            </label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="e.g. PO-2026-8819"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Notes / Delivery Vehicle #
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Delivered via Truck #4"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            />
          </div>
        </div>

        {/* Line items table */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-[#FF6600]" />
              Received Stock Items
            </h4>
            <button
              type="button"
              onClick={handleAddLine}
              className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#FF6600] rounded-xl text-xs font-bold transition-all flex items-center gap-1 border border-orange-200 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Item
            </button>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#1F242D] text-slate-200 font-bold uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3 w-28 text-center">Qty Recv.</th>
                    <th className="p-3 w-32 text-right">Unit Cost ($)</th>
                    <th className="p-3 w-32 text-right">Subtotal ($)</th>
                    <th className="p-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lineItems.map((line, idx) => {
                    const lineSubtotal = (line.quantity || 0) * (line.unitCost || 0);
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2.5">
                          <select
                            value={line.productId}
                            onChange={(e) => handleProductChange(idx, e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-semibold text-xs focus:ring-1 focus:ring-[#FF6600]"
                          >
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 0);
                              const updated = [...lineItems];
                              updated[idx].quantity = val;
                              setLineItems(updated);
                            }}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-center text-slate-900 font-bold text-xs focus:ring-1 focus:ring-[#FF6600]"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.unitCost}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const updated = [...lineItems];
                              updated[idx].unitCost = val;
                              setLineItems(updated);
                            }}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-right text-slate-900 font-bold text-xs focus:ring-1 focus:ring-[#FF6600]"
                          />
                        </td>
                        <td className="p-2.5 text-right font-bold text-slate-900">
                          ${lineSubtotal.toFixed(2)}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={lineItems.length === 1}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors disabled:opacity-30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">Total Purchase Order Value:</span>
              <span className="text-lg font-black text-[#FF6600]">${grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-bold rounded-xl text-xs sm:text-sm shadow-md flex items-center gap-2 transition-all cursor-pointer"
          >
            {isSubmitting ? 'Posting Receipt...' : 'Confirm Stock Receipt into Warehouse'}
          </button>
        </div>

      </form>
    </Modal>
  );
};
