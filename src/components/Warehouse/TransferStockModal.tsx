import React, { useState } from 'react';
import { Modal } from '../Common/Modal';
import { Warehouse, Branch, Product } from '../../types';
import { transferStockFromWarehouse } from '../../services/db';
import { ArrowLeftRight, Plus, Trash2, Building2, Store } from 'lucide-react';

interface TransferStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string;
  warehouses: Warehouse[];
  branches: Branch[];
  products: Product[];
  warehouseStock: Record<string, number>;
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
  onSuccess
}) => {
  const defaultWh = warehouses.find(w => w.isDefault) || warehouses[0];
  const defaultBr = branches.find(b => b.isDefault) || branches[0];

  const [warehouseId, setWarehouseId] = useState(defaultWh?.id || '');
  const [targetBranchId, setTargetBranchId] = useState(defaultBr?.id || '');
  const [notes, setNotes] = useState('');

  const [lineItems, setLineItems] = useState<{
    productId: string;
    quantity: number;
  }>([
    { productId: products[0]?.id || '', quantity: 10 }
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAddLine = () => {
    const unused = products.find(p => !lineItems.some(i => i.productId === p.id)) || products[0];
    if (unused) {
      setLineItems([...lineItems, { productId: unused.id, quantity: 5 }]);
    }
  };

  const handleRemoveLine = (idx: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== idx));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBranchId) {
      setError('Please select a Destination Branch.');
      return;
    }

    const validItems = lineItems.filter(i => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      setError('Please specify quantity > 0 to transfer.');
      return;
    }

    // Check stock availability
    for (const item of validItems) {
      const avail = warehouseStock[item.productId] || 0;
      if (item.quantity > avail) {
        const prod = products.find(p => p.id === item.productId);
        setError(`Insufficient Central Warehouse stock for ${prod?.name || 'Product'}. Available: ${avail}, Requested: ${item.quantity}`);
        return;
      }
    }

    setIsSubmitting(true);
    setError('');

    try {
      const currentWh = warehouses.find(w => w.id === (warehouseId || defaultWh.id));
      const currentBr = branches.find(b => b.id === targetBranchId);

      const itemsFormatted = validItems.map(item => {
        const prod = products.find(p => p.id === item.productId);
        return {
          productId: item.productId,
          productName: prod ? prod.name : 'Unknown Product',
          quantity: Number(item.quantity)
        };
      });

      await transferStockFromWarehouse(
        vendorId,
        warehouseId || defaultWh.id,
        currentWh?.name || 'Central Warehouse',
        targetBranchId,
        currentBr?.name || 'Target Branch',
        itemsFormatted,
        notes.trim()
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Stock transfer failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Transfer Stock from Central Warehouse to Branch"
      subtitle="Dispatch inventory to branch location"
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-[#FF6600]" />
              Source (Central Warehouse)
            </label>
            <select
              value={warehouseId || defaultWh?.id}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <Store className="w-4 h-4 text-[#FF6600]" />
              Destination Retail Branch <span className="text-[#FF6600]">*</span>
            </label>
            <select
              value={targetBranchId}
              onChange={(e) => setTargetBranchId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-900 mb-1">
            Dispatch Reference / Notes
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Weekly replenishment transfer for Main Branch"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
          />
        </div>

        {/* Transfer Items Table */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-[#FF6600]" />
              Transfer Items & Quantities
            </h4>
            <button
              type="button"
              onClick={handleAddLine}
              className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#FF6600] rounded-xl text-xs font-bold transition-all flex items-center gap-1 border border-orange-200 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Product
            </button>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#1F242D] text-slate-200 font-bold uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3 w-32 text-center">Avail. Stock</th>
                    <th className="p-3 w-32 text-center">Transfer Qty</th>
                    <th className="p-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lineItems.map((line, idx) => {
                    const avail = warehouseStock[line.productId] || 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2.5">
                          <select
                            value={line.productId}
                            onChange={(e) => {
                              const updated = [...lineItems];
                              updated[idx].productId = e.target.value;
                              setLineItems(updated);
                            }}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-semibold text-xs focus:ring-1 focus:ring-[#FF6600]"
                          >
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-700">
                          <span className={`px-2 py-1 rounded-lg text-xs ${avail > 0 ? 'bg-slate-100 text-slate-800' : 'bg-red-100 text-red-700'}`}>
                            {avail} units
                          </span>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min="1"
                            max={avail}
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
            {isSubmitting ? 'Transferring...' : 'Execute Stock Transfer'}
          </button>
        </div>

      </form>
    </Modal>
  );
};
