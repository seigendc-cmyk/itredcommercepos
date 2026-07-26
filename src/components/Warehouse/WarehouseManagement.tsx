import React, { useState } from 'react';
import { Warehouse, Product, SupplierReceipt, StockTransfer } from '../../types';
import { Warehouse as WarehouseIcon, PlusCircle, ArrowLeftRight, Truck, Package, Search } from 'lucide-react';

interface WarehouseManagementProps {
  warehouses: Warehouse[];
  products: Product[];
  warehouseStock: Record<string, number>;
  supplierReceipts: SupplierReceipt[];
  transfers: StockTransfer[];
  onOpenSupplierReceiveModal: () => void;
  onOpenTransferModal: () => void;
}

export const WarehouseManagement: React.FC<WarehouseManagementProps> = ({
  warehouses,
  products,
  warehouseStock,
  supplierReceipts,
  transfers,
  onOpenSupplierReceiveModal,
  onOpenTransferModal
}) => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'receipts' | 'transfers'>('inventory');
  const [searchTerm, setSearchTerm] = useState('');

  const currentWh = warehouses[0];

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Actions */}
      <div className="bg-white p-6 rounded-lg border border-gray-100 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-[#333333] text-[#FF6B00] flex items-center justify-center font-bold shadow">
            <WarehouseIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#333333]">Central Warehouse Engine</h2>
              <span className="bg-orange-50 text-[#FF6B00] text-[10px] font-bold px-2 py-0.5 rounded uppercase border border-orange-200">
                Primary Supplier Hub
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {currentWh?.name || 'Central HQ Warehouse'} • Mandatory Entry Point for all Supplier Deliveries
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={onOpenSupplierReceiveModal}
            className="flex-1 md:flex-initial px-4 py-2 bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold rounded text-xs sm:text-sm shadow flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Receive Supplier Stock</span>
          </button>

          <button
            onClick={onOpenTransferModal}
            className="flex-1 md:flex-initial px-4 py-2 bg-[#333333] hover:bg-black text-white font-bold rounded text-xs sm:text-sm shadow flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ArrowLeftRight className="w-4 h-4 text-[#FF6B00]" />
            <span>Transfer to Branch</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex border-b border-gray-200 gap-2 font-bold text-xs">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'inventory'
              ? 'border-[#FF6B00] text-[#FF6B00]'
              : 'border-transparent text-gray-500 hover:text-[#333333]'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Central Stock Balance ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('receipts')}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'receipts'
              ? 'border-[#FF6B00] text-[#FF6B00]'
              : 'border-transparent text-gray-500 hover:text-[#333333]'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Supplier Stock Receipts ({supplierReceipts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('transfers')}
          className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'transfers'
              ? 'border-[#FF6B00] text-[#FF6B00]'
              : 'border-transparent text-gray-500 hover:text-[#333333]'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          <span>Outbound Branch Transfers ({transfers.length})</span>
        </button>
      </div>

      {/* Tab 1: Central Stock Balance */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-sm max-w-md">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter central warehouse items..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs font-medium focus:ring-1 focus:ring-[#FF6600]"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[11px] text-gray-400 border-b border-gray-100 bg-[#333333] text-white">
                  <th className="p-3 font-semibold">SKU</th>
                  <th className="p-3 font-semibold">PRODUCT NAME</th>
                  <th className="p-3 font-semibold">CATEGORY</th>
                  <th className="p-3 text-right font-semibold">COST PRICE</th>
                  <th className="p-3 text-right font-semibold">SELLING PRICE</th>
                  <th className="p-3 text-center font-semibold">WAREHOUSE STOCK LEVEL</th>
                </tr>
              </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map(product => {
                    const stock = warehouseStock[product.id] || 0;
                    return (
                      <tr key={product.id} className="hover:bg-slate-50">
                        <td className="p-3.5 font-mono font-bold text-slate-700">{product.sku}</td>
                        <td className="p-3.5 font-bold text-slate-900">{product.name}</td>
                        <td className="p-3.5 text-slate-600">{product.category}</td>
                        <td className="p-3.5 text-right text-slate-600">${product.costPrice.toFixed(2)}</td>
                        <td className="p-3.5 text-right font-bold text-slate-900">${product.sellingPrice.toFixed(2)}</td>
                        <td className="p-3.5 text-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            stock > 20
                              ? 'bg-emerald-100 text-emerald-800'
                              : stock > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {stock} {product.unit}s
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

      {/* Tab 2: Supplier Stock Receipts */}
      {activeTab === 'receipts' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#1F242D] text-slate-200 font-bold uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="p-3.5">Receipt Ref #</th>
                  <th className="p-3.5">Supplier Name</th>
                  <th className="p-3.5">Date & Time</th>
                  <th className="p-3.5">Items Recv.</th>
                  <th className="p-3.5 text-right">Total Cost ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierReceipts.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="p-3.5 font-mono font-bold text-[#FF6600]">{r.referenceNo}</td>
                    <td className="p-3.5 font-bold text-slate-900">{r.supplierName}</td>
                    <td className="p-3.5 text-slate-600">{new Date(r.date).toLocaleString()}</td>
                    <td className="p-3.5">
                      <span className="bg-slate-100 text-slate-800 font-bold px-2 py-1 rounded text-xs">
                        {r.items.length} product lines
                      </span>
                    </td>
                    <td className="p-3.5 text-right font-black text-slate-900">${r.totalAmount.toFixed(2)}</td>
                  </tr>
                ))}
                {supplierReceipts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 font-medium">
                      No supplier stock receipts recorded yet. Click "Receive Supplier Stock" to add inventory.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Outbound Branch Transfers */}
      {activeTab === 'transfers' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#1F242D] text-slate-200 font-bold uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="p-3.5">Transfer #</th>
                  <th className="p-3.5">Target Branch</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Items Transferred</th>
                  <th className="p-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map(trf => (
                  <tr key={trf.id} className="hover:bg-slate-50">
                    <td className="p-3.5 font-mono font-bold text-[#FF6600]">{trf.transferNo}</td>
                    <td className="p-3.5 font-bold text-slate-900">{trf.targetBranchName}</td>
                    <td className="p-3.5 text-slate-600">{new Date(trf.date).toLocaleString()}</td>
                    <td className="p-3.5 text-slate-800">
                      {trf.items.map(i => `${i.productName} (${i.quantity})`).join(', ')}
                    </td>
                    <td className="p-3.5 text-center">
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full">
                        {trf.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
                {transfers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 font-medium">
                      No stock transfers recorded yet. Click "Transfer to Branch" to send stock to stores.
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
