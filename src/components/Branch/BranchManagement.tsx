import React, { useState } from 'react';
import { Branch, Terminal, Product, StockAdjustment } from '../../types';
import { Store, Tv2, SlidersHorizontal, Plus, MapPin, Phone, CheckCircle2 } from 'lucide-react';

interface BranchManagementProps {
  branches: Branch[];
  terminals: Terminal[];
  products: Product[];
  branchStock: Record<string, number>;
  stockAdjustments: StockAdjustment[];
  activeBranch: Branch | null;
  setActiveBranch: (branch: Branch) => void;
  onOpenStockAdjustmentModal: () => void;
  onOpenAddBranchTerminalModal: () => void;
}

export const BranchManagement: React.FC<BranchManagementProps> = ({
  branches,
  terminals,
  products,
  branchStock,
  stockAdjustments,
  activeBranch,
  setActiveBranch,
  onOpenStockAdjustmentModal,
  onOpenAddBranchTerminalModal
}) => {
  const [viewTab, setViewTab] = useState<'branches' | 'stock' | 'adjustments'>('branches');

  const selectedBranchTerminals = terminals.filter(t => activeBranch ? t.branchId === activeBranch.id : true);

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#1F242D] text-[#FF6600] flex items-center justify-center font-bold shadow-md">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Branch & Terminal Management</h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Manage retail store branches, register counters, and branch opening balances.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={onOpenStockAdjustmentModal}
            className="flex-1 md:flex-initial px-4 py-2.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-bold rounded-xl text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Branch Stock Adj. / Opening Bal.</span>
          </button>

          <button
            onClick={onOpenAddBranchTerminalModal}
            className="flex-1 md:flex-initial px-4 py-2.5 bg-[#1F242D] hover:bg-slate-800 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#FF6600]" />
            <span>Add Branch / Terminal</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex border-b border-slate-200 gap-2 font-bold text-xs sm:text-sm">
        <button
          onClick={() => setViewTab('branches')}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-all ${
            viewTab === 'branches'
              ? 'border-[#FF6600] text-[#FF6600]'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Active Outlets & Terminals ({branches.length})</span>
        </button>

        <button
          onClick={() => setViewTab('stock')}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-all ${
            viewTab === 'stock'
              ? 'border-[#FF6600] text-[#FF6600]'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Branch Inventory Levels</span>
        </button>

        <button
          onClick={() => setViewTab('adjustments')}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-all ${
            viewTab === 'adjustments'
              ? 'border-[#FF6600] text-[#FF6600]'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Opening Balance & Adjustment Logs ({stockAdjustments.length})</span>
        </button>
      </div>

      {/* Tab 1: Branches Grid */}
      {viewTab === 'branches' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map(branch => {
            const bTerminals = terminals.filter(t => t.branchId === branch.id);
            const isSelected = activeBranch?.id === branch.id;

            return (
              <div
                key={branch.id}
                className={`bg-white rounded-2xl border p-5 shadow-sm space-y-4 transition-all ${
                  isSelected ? 'border-2 border-[#FF6600] ring-1 ring-[#FF6600]/20' : 'border-slate-200/90'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-slate-900">{branch.name}</h3>
                      {branch.isDefault && (
                        <span className="bg-orange-100 text-[#FF6600] text-[10px] font-bold px-2 py-0.5 rounded">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono font-bold text-slate-600 mt-0.5">{branch.code}</p>
                  </div>

                  {!isSelected && (
                    <button
                      onClick={() => setActiveBranch(branch)}
                      className="px-3 py-1 bg-slate-100 hover:bg-[#FF6600] hover:text-white text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Select
                    </button>
                  )}
                </div>

                <div className="space-y-1.5 text-xs text-slate-600">
                  <p className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-[#FF6600]" />
                    <span>{branch.address}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-[#FF6600]" />
                    <span>{branch.phone || 'N/A'}</span>
                  </p>
                </div>

                {/* Terminals under this branch */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
                    <span>POS Terminals</span>
                    <span className="text-[11px] text-[#FF6600]">{bTerminals.length} Active</span>
                  </p>
                  
                  <div className="space-y-1.5">
                    {bTerminals.map(term => (
                      <div
                        key={term.id}
                        className="flex items-center justify-between p-2 bg-slate-50 rounded-xl text-xs font-semibold"
                      >
                        <div className="flex items-center gap-2">
                          <Tv2 className="w-3.5 h-3.5 text-[#FF6600]" />
                          <span className="text-slate-900">{term.name}</span>
                        </div>
                        <span className="text-[10px] font-mono bg-white px-2 py-0.5 border border-slate-200 rounded text-slate-600">
                          {term.code}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Branch Inventory Stock Levels */}
      {viewTab === 'stock' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
            <span className="text-xs sm:text-sm font-bold text-slate-900">
              Showing Stock for: <span className="text-[#FF6600]">{activeBranch?.name || 'Main Branch'}</span>
            </span>
            <select
              value={activeBranch?.id || ''}
              onChange={(e) => {
                const b = branches.find(br => br.id === e.target.value);
                if (b) setActiveBranch(b);
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#1F242D] text-slate-200 font-bold uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="p-3.5">SKU</th>
                    <th className="p-3.5">Product Name</th>
                    <th className="p-3.5">Category</th>
                    <th className="p-3.5 text-right">Price ($)</th>
                    <th className="p-3.5 text-center">Branch Available Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map(p => {
                    const qty = branchStock[p.id] || 0;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-3.5 font-mono font-bold text-slate-700">{p.sku}</td>
                        <td className="p-3.5 font-bold text-slate-900">{p.name}</td>
                        <td className="p-3.5 text-slate-600">{p.category}</td>
                        <td className="p-3.5 text-right font-bold text-slate-900">${p.sellingPrice.toFixed(2)}</td>
                        <td className="p-3.5 text-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            qty > 10
                              ? 'bg-emerald-100 text-emerald-800'
                              : qty > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {qty} {p.unit}s
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Adjustment Logs */}
      {viewTab === 'adjustments' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#1F242D] text-slate-200 font-bold uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="p-3.5">Branch</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5">Date & Time</th>
                  <th className="p-3.5">Items & Quantities Changed</th>
                  <th className="p-3.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockAdjustments.map(adj => (
                  <tr key={adj.id} className="hover:bg-slate-50">
                    <td className="p-3.5 font-bold text-slate-900">{adj.branchName}</td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-1 bg-orange-100 text-[#FF6600] font-bold rounded-lg text-xs uppercase">
                        {adj.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-600">{new Date(adj.date).toLocaleString()}</td>
                    <td className="p-3.5 text-slate-800">
                      {adj.items.map((i, idx) => (
                        <span key={idx} className="block font-medium">
                          {i.productName}: <span className={i.quantityDelta >= 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                            {i.quantityDelta >= 0 ? `+${i.quantityDelta}` : i.quantityDelta}
                          </span>
                        </span>
                      ))}
                    </td>
                    <td className="p-3.5 text-slate-500 italic">{adj.notes || 'N/A'}</td>
                  </tr>
                ))}
                {stockAdjustments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 font-medium">
                      No branch stock adjustments recorded yet. Click "Branch Stock Adj. / Opening Bal." to add initial opening balance.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
