import React, { useState } from 'react';
import { StaffMember, VendorProfile, Warehouse, Product, SupplierReceipt, StockTransfer } from '../../types';
import { Warehouse as WarehouseIcon, PlusCircle, ArrowLeftRight, Truck, Package, Search } from 'lucide-react';
import { TransferSlipModal } from './TransferSlipModal';
import {
  canRolePreviewTransferSlip,
  isOperationalTransferStatus,
  TransferSlipAction,
  TransferSlipFormat,
} from '../../services/transferSlip';
import { confirmStockTransferReceipt, dispatchStockTransfer } from '../../services/db';
import { TransferReceiptModal } from './TransferReceiptModal';

interface WarehouseManagementProps {
  warehouses: Warehouse[];
  products: Product[];
  warehouseStock: Record<string, number>;
  supplierReceipts: SupplierReceipt[];
  transfers: StockTransfer[];
  vendor: VendorProfile;
  activeStaff: StaffMember;
  onOpenAddWarehouseModal: () => void;
  onOpenSupplierReceiveModal: () => void;
  onOpenTransferModal: () => void;
  onTransferSlipAction: (
    action: TransferSlipAction,
    transfer: StockTransfer,
    format: TransferSlipFormat,
  ) => Promise<void>;
  onTransferUpdated: () => void | Promise<void>;
}

export const WarehouseManagement: React.FC<WarehouseManagementProps> = ({
  warehouses,
  products,
  warehouseStock,
  supplierReceipts,
  transfers,
  vendor,
  activeStaff,
  onOpenAddWarehouseModal,
  onOpenSupplierReceiveModal,
  onOpenTransferModal,
  onTransferSlipAction,
  onTransferUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'receipts' | 'transfers'>('inventory');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);
  const [receivingTransfer, setReceivingTransfer] = useState<StockTransfer | null>(null);
  const [processingTransferId, setProcessingTransferId] = useState<string | null>(null);

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
            onClick={onOpenAddWarehouseModal}
            className="flex-1 md:flex-initial px-4 py-2 bg-white hover:bg-orange-50 text-[#FF6B00] border border-[#FF6B00] font-bold rounded text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <WarehouseIcon className="w-4 h-4" />
            <span>Add Warehouse</span>
          </button>

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
          <p className="border-b border-orange-100 bg-orange-50 px-4 py-2 text-xs font-semibold text-[#1F242D]">
            Double-click an approved or completed transfer to preview its movement slip.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#1F242D] text-slate-200 font-bold uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="p-3.5">Transfer #</th>
                  <th className="p-3.5">Target Branch</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Items Transferred</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map(trf => {
                  const canOpenSlip =
                    canRolePreviewTransferSlip(activeStaff.role) &&
                    isOperationalTransferStatus(trf.status);
                  return (
                  <tr
                    key={trf.id}
                    onDoubleClick={() => {
                      if (canOpenSlip) setSelectedTransfer(trf);
                    }}
                    title={canOpenSlip ? 'Double-click to open transfer slip' : undefined}
                    className={`hover:bg-orange-50/50 ${canOpenSlip ? 'cursor-pointer select-none' : ''}`}
                  >
                    <td className="p-3.5 font-mono font-bold text-[#FF6600]">{trf.transferNo}</td>
                    <td className="p-3.5 font-bold text-slate-900">{trf.targetBranchName}</td>
                    <td className="p-3.5 text-slate-600">{new Date(trf.date).toLocaleString()}</td>
                    <td className="p-3.5 text-slate-800">
                      <div className="space-y-2">
                        {trf.items.map((item, index) => {
                          const requested = item.quantityRequested ?? item.quantity;
                          const approved = item.quantityApproved ?? 0;
                          const dispatched = item.quantityDispatched ?? 0;
                          const received = item.quantityReceived ?? 0;
                          return (
                            <div key={`${item.productId}-${index}`} className="min-w-[430px]">
                              <p className="font-bold text-slate-900">
                                <span className="mr-2 font-mono text-[#FF6600]">{item.sku || '—'}</span>
                                {item.productName}
                              </p>
                              <p className="mt-0.5 text-[10px] text-slate-600">
                                Requested {requested} • Approved {approved} • Dispatched {dispatched} •
                                Received {received} • Outstanding {Math.max(0, dispatched - received)} •
                                {item.unitOfMeasure || 'unit'}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="p-3.5 text-center">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        isOperationalTransferStatus(trf.status)
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {trf.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      {String(trf.status).toUpperCase() === 'APPROVED' && (
                        <button type="button" disabled={processingTransferId === trf.id}
                          onClick={async event => {
                            event.stopPropagation();
                            setProcessingTransferId(trf.id);
                            try {
                              await dispatchStockTransfer(
                                vendor.id,
                                trf.id,
                                { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role },
                                trf.version || 1,
                              );
                              await onTransferUpdated();
                            } catch (reason: unknown) {
                              alert(reason instanceof Error ? reason.message : 'Transfer dispatch failed.');
                            } finally {
                              setProcessingTransferId(null);
                            }
                          }}
                          className="rounded-lg bg-[#1F242D] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                          Dispatch
                        </button>
                      )}
                      {(String(trf.status).toUpperCase() === 'IN_TRANSIT' ||
                        String(trf.status).toUpperCase() === 'PARTIALLY_RECEIVED') && (
                        <button type="button" onClick={event => {
                          event.stopPropagation();
                          setReceivingTransfer(trf);
                        }}
                          className="rounded-lg bg-[#FF6600] px-3 py-1.5 text-xs font-bold text-white">
                          Confirm receipt
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {transfers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 font-medium">
                      No stock transfers recorded yet. Click "Transfer to Branch" to send stock to stores.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TransferSlipModal
        isOpen={selectedTransfer !== null}
        onClose={() => setSelectedTransfer(null)}
        transfer={selectedTransfer}
        vendor={vendor}
        products={products}
        onAction={onTransferSlipAction}
      />
      <TransferReceiptModal
        transfer={receivingTransfer}
        onClose={() => setReceivingTransfer(null)}
        onConfirm={async (transfer, receipts, reason) => {
          await confirmStockTransferReceipt(
            vendor.id,
            transfer.id,
            { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role },
            transfer.version || 1,
            receipts,
            reason,
          );
          await onTransferUpdated();
        }}
      />
    </div>
  );
};
