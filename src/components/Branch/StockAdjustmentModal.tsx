import React, { useState } from 'react';
import { Modal } from '../Common/Modal';
import { Branch, Product } from '../../types';
import { adjustBranchStock } from '../../services/db';
import { SlidersHorizontal, Plus, Trash2, Store, Sparkles } from 'lucide-react';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string;
  branches: Branch[];
  activeBranchId?: string;
  products: Product[];
  branchStock: Record<string, number>;
  onSuccess: () => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  vendorId,
  branches,
  activeBranchId,
  products,
  branchStock,
  onSuccess
}) => {
  const defaultBranch = branches.find(b => b.id === activeBranchId) || branches[0];
  const [branchId, setBranchId] = useState(defaultBranch?.id || '');
  const [type, setType] = useState<'opening_balance' | 'recount' | 'damage' | 'return' | 'other'>('opening_balance');
  const [notes, setNotes] = useState('');

  const [lineItems, setLineItems] = useState<{
    productId: string;
    quantityDelta: number;
    reason?: string;
  }>([
    { productId: products[0]?.id || '', quantityDelta: 50, reason: 'Initial Branch Opening Stock' }
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAddLine = () => {
    const unused = products.find(p => !lineItems.some(i => i.productId === p.id)) || products[0];
    if (unused) {
      setLineItems([...lineItems, {
        productId: unused.id,
        quantityDelta: 20,
        reason: type === 'opening_balance' ? 'Opening Balance' : 'Recount'
      }]);
    }
  };

  const handleRemoveLine = (idx: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== idx));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchId) {
      setError('Please select a Branch.');
      return;
    }

    const validItems = lineItems.filter(i => i.productId && i.quantityDelta !== 0);
    if (validItems.length === 0) {
      setError('Please add at least one line with non-zero adjustment quantity.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const selectedBr = branches.find(b => b.id === branchId);
      const itemsFormatted = validItems.map(item => {
        const prod = products.find(p => p.id === item.productId);
        return {
          productId: item.productId,
          productName: prod ? prod.name : 'Unknown Product',
          quantityDelta: Number(item.quantityDelta),
          reason: item.reason || (type === 'opening_balance' ? 'Opening Balance Setup' : 'Stock Adjustment')
        };
      });

      await adjustBranchStock(
        vendorId,
        branchId,
        selectedBr?.name || 'Main Branch',
        type,
        itemsFormatted,
        notes.trim()
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Branch stock adjustment failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Branch Stock Adjustment / Opening Balance"
      subtitle="Direct inventory adjustment form for retail branches"
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        
        {/* Helper Callout for Opening Balance */}
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3.5 text-xs sm:text-sm text-orange-950 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-[#FF6600] shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-slate-900">Branch Opening Inventory Rule</p>
            <p className="text-slate-700 mt-0.5">
              Opening balance inventory are added to a branch directly via this Stock Adjustment Form. Specify positive numbers for additions or negative numbers for reductions/damages.
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
            <label className="block text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <Store className="w-4 h-4 text-[#FF6600]" />
              Target Retail Branch <span className="text-[#FF6600]">*</span>
            </label>
            <select
              value={branchId || defaultBranch?.id}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-[#FF6600]" />
              Adjustment Type <span className="text-[#FF6600]">*</span>
            </label>
            <select
              value={type}
              onChange={(e: any) => setType(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            >
              <option value="opening_balance">✨ Opening Balance Entry</option>
              <option value="recount">📋 Inventory Recount / Audit</option>
              <option value="damage">⚠️ Damaged / Expired Goods (-)</option>
              <option value="return">↩️ Customer Return (+)</option>
              <option value="other">📝 Other Adjustment</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-900 mb-1">
            Reference / Memo
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Initial branch stock count upon onboarding"
            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
          />
        </div>

        {/* Adjustments Table */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#FF6600]" />
              Adjustment Line Items
            </h4>
            <button
              type="button"
              onClick={handleAddLine}
              className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#FF6600] rounded-xl text-xs font-bold transition-all flex items-center gap-1 border border-orange-200 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Product Line
            </button>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#1F242D] text-slate-200 font-bold uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3 w-28 text-center">Current Stock</th>
                    <th className="p-3 w-32 text-center">Qty Change (+/-)</th>
                    <th className="p-3">Reason / Remarks</th>
                    <th className="p-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lineItems.map((line, idx) => {
                    const current = branchStock[line.productId] || 0;
                    const newTotal = Math.max(0, current + line.quantityDelta);
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
                          {current} units
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            value={line.quantityDelta}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              const updated = [...lineItems];
                              updated[idx].quantityDelta = val;
                              setLineItems(updated);
                            }}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-center font-bold text-xs focus:ring-1 focus:ring-[#FF6600] text-slate-900"
                          />
                          <p className="text-[10px] text-center text-slate-500 mt-0.5">
                            Result: <span className="font-bold text-[#FF6600]">{newTotal}</span>
                          </p>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={line.reason || ''}
                            onChange={(e) => {
                              const updated = [...lineItems];
                              updated[idx].reason = e.target.value;
                              setLineItems(updated);
                            }}
                            placeholder="Reason for change"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-xs focus:ring-1 focus:ring-[#FF6600]"
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
            {isSubmitting ? 'Saving Adjustment...' : 'Apply Stock Adjustment'}
          </button>
        </div>

      </form>
    </Modal>
  );
};
