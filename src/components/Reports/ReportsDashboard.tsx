import React from 'react';
import { Order, Product, Branch } from '../../types';
import { BarChart3, DollarSign, ShoppingBag, TrendingUp, Warehouse, Store, CreditCard } from 'lucide-react';

interface ReportsDashboardProps {
  orders: Order[];
  products: Product[];
  branches: Branch[];
  warehouseStock: Record<string, number>;
  branchStock: Record<string, number>;
}

export const ReportsDashboard: React.FC<ReportsDashboardProps> = ({
  orders,
  products,
  branches,
  warehouseStock,
  branchStock
}) => {
  const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalTransactions = orders.length;

  // Calculate total warehouse inventory valuation (at cost price)
  const whValuation = products.reduce((sum, p) => {
    const qty = warehouseStock[p.id] || 0;
    return sum + (qty * p.costPrice);
  }, 0);

  // Calculate total branch inventory valuation (at retail price)
  const brValuation = products.reduce((sum, p) => {
    const qty = branchStock[p.id] || 0;
    return sum + (qty * p.sellingPrice);
  }, 0);

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-lg border border-gray-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-[#333333] text-[#FF6B00] flex items-center justify-center font-bold shadow">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#333333]">POS Analytics & Financial Metrics</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Real-time sales performance, stock movement, and multi-tenant inventory valuations.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards Grid - High Density Theme */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-lg border border-gray-100 shadow-sm">
          <div className="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-1">
            Gross POS Revenue
          </div>
          <div className="text-2xl font-bold text-[#333333]">${totalRevenue.toFixed(2)}</div>
          <div className="mt-2 h-1 w-full bg-gray-100 rounded">
            <div className="h-1 w-[80%] bg-[#FF6B00] rounded"></div>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">Across all active branches</p>
        </div>

        <div className="bg-white p-5 rounded-lg border border-gray-100 shadow-sm">
          <div className="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-1">
            Completed Orders
          </div>
          <div className="text-2xl font-bold text-[#333333]">{totalTransactions}</div>
          <div className="mt-2 h-1 w-full bg-gray-100 rounded">
            <div className="h-1 w-[65%] bg-[#333333] rounded"></div>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">Total checkout receipts</p>
        </div>

        <div className="bg-white p-5 rounded-lg border border-gray-100 shadow-sm">
          <div className="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-1">
            Central Warehouse Value
          </div>
          <div className="text-2xl font-bold text-[#333333]">${whValuation.toFixed(2)}</div>
          <div className="mt-2 h-1 w-full bg-gray-100 rounded">
            <div className="h-1 w-[90%] bg-[#FF6B00] rounded"></div>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">At supplier cost price</p>
        </div>

        <div className="bg-white p-5 rounded-lg border border-gray-100 shadow-sm">
          <div className="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-1">
            Branch Retail Stock Value
          </div>
          <div className="text-2xl font-bold text-[#333333]">${brValuation.toFixed(2)}</div>
          <div className="mt-2 h-1 w-full bg-gray-100 rounded">
            <div className="h-1 w-[75%] bg-green-500 rounded"></div>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">At active retail price</p>
        </div>

      </div>

      {/* Orders Audit Table */}
      <div className="bg-white rounded-lg border border-gray-100 overflow-hidden shadow-sm">
        <div className="p-3 bg-[#333333] text-white flex items-center justify-between border-b border-gray-700">
          <h3 className="font-bold text-xs uppercase tracking-wider flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#FF6B00]" />
            Recent Sales Order Audit Log
          </h3>
          <span className="text-[11px] text-gray-400 font-semibold">{orders.length} Records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] text-gray-400 border-b border-gray-100 uppercase tracking-wider bg-gray-50">
                <th className="p-3 font-semibold">Order ID</th>
                <th className="p-3 font-semibold">Branch & Terminal</th>
                <th className="p-3 font-semibold">Date & Time</th>
                <th className="p-3 font-semibold">Payment Method</th>
                <th className="p-3 font-semibold">Customer</th>
                <th className="p-3 text-right font-semibold">Total Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map(order => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="p-3 font-mono font-bold text-[#333333]">{order.id}</td>
                  <td className="p-3">
                    <p className="font-bold text-[#333333]">{order.branchName}</p>
                    <p className="text-[10px] text-gray-400">{order.terminalName}</p>
                  </td>
                  <td className="p-3 text-gray-600">{new Date(order.createdAt).toLocaleString()}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-orange-50 text-[#FF6B00] font-bold rounded text-[10px] uppercase border border-orange-200">
                      {order.paymentMethod.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-3 text-gray-700">{order.customerName || 'Walk-in'}</td>
                  <td className="p-3 text-right font-bold text-[#333333]">${order.totalAmount.toFixed(2)}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400 font-medium">
                    No sales recorded yet. Process checkouts in the POS Register tab to generate sales reports.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
