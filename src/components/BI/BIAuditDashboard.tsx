import React, { useState } from 'react';
import { BIEvent, BIInsight, BIAggregates } from '../../bi/types';
import { Product, Warehouse, Branch, Order } from '../../types';
import type { InventoryCostSnapshot } from '../../services/db';
import { 
  BrainCircuit, 
  Activity, 
  AlertTriangle, 
  ShieldCheck, 
  TrendingUp, 
  Search, 
  Filter, 
  Sparkles, 
  Clock, 
  FileText,
  Zap,
  ArrowUpRight,
  Package,
  Layers,
  MapPin,
  Tag,
  DollarSign,
  Download,
  AlertCircle,
  BarChart2
} from 'lucide-react';

interface BIAuditDashboardProps {
  logs: BIEvent[];
  insights: BIInsight[];
  aggregates: BIAggregates;
  products?: Product[];
  warehouses?: Warehouse[];
  branches?: Branch[];
  warehouseStock?: Record<string, number>;
  branchStock?: Record<string, number>;
  currency?: string;
  inventoryCosts?: Record<string, InventoryCostSnapshot>;
  orders?: Order[];
}

export function BIAuditDashboard({ 
  logs, 
  insights, 
  aggregates,
  products = [],
  warehouses = [],
  branches = [],
  warehouseStock = {},
  branchStock = {},
  currency = '$', inventoryCosts = {}, orders = []
}: BIAuditDashboardProps) {
  const [activeSubTab, setActiveSubTab] = useState<'inventory_bi' | 'audit_logs' | 'insights'>('inventory_bi');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [periodDays, setPeriodDays] = useState(30);
  const periodStart = Date.now() - periodDays * 86400000;
  const periodOrders = orders.filter(order => new Date(order.createdAt).getTime() >= periodStart && order.status === 'completed');
  const regionFor = (branchId: string) => {
    const branch = branches.find(item => item.id === branchId); const address = branch?.address?.trim();
    if (!address) return 'Unclassified'; const parts = address.split(',').map(value => value.trim()).filter(Boolean); return parts.at(-2) || parts.at(-1) || 'Unclassified';
  };
  const regionalDemand = Object.values(periodOrders.reduce<Record<string, { region: string; units: number; revenue: number; orders: number }>>((map, order) => { const region = regionFor(order.branchId); const row = map[region] || { region, units: 0, revenue: 0, orders: 0 }; row.orders += 1; row.revenue += order.totalAmount; row.units += order.items.reduce((sum, item) => sum + item.quantity, 0); map[region] = row; return map; }, {})).sort((a,b)=>b.units-a.units);
  const movementEvents = logs.filter(log => new Date(log.timestamp).getTime() >= periodStart && ['SUPPLY_RECEIPT','STOCK_TRANSFER','STOCK_ADJUSTMENT','POS_TRANSACTION','INVENTORY_WORKFLOW_TRANSITION'].includes(log.eventType));
  const priceChanges = logs.filter(log => log.eventType === 'PRODUCT_PRICE_CHANGED' && new Date(log.timestamp).getTime() >= periodStart);
  const regionalPriceRows = products.flatMap(product => Object.entries(product.branchPrices || {}).map(([branchId, price]) => ({ product, branch: branches.find(item=>item.id===branchId), region: regionFor(branchId), price }))).sort((a,b)=>a.region.localeCompare(b.region));

  // Filter BI Audit Logs
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.actionSummary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.staffName && log.staffName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      log.eventType.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = selectedType === 'ALL' || log.eventType === selectedType;
    return matchesSearch && matchesType;
  });

  // Calculate Product categories
  const categories = Array.from(new Set(products.map(p => p.category)));

  // Filter Products for Inventory BI Table
  const filteredProducts = products.filter(product => {
    const wQty = warehouseStock[product.id] || 0;
    const bQty = branchStock[product.id] || 0;
    const totalQty = wQty + bQty;

    const matchesSearch = 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.location && product.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (product.shelf && product.shelf.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = selectedCategory === 'ALL' || product.category === selectedCategory;
    const matchesLowStock = !showLowStockOnly || totalQty <= product.reorderLevel;

    return matchesSearch && matchesCategory && matchesLowStock;
  });

  // Inventory BI Statistics
  const totalValuationCost = products.reduce((acc, p) => {
    const wQty = warehouseStock[p.id] || 0;
    const bQty = branchStock[p.id] || 0;
    return acc + (inventoryCosts[p.id]?.stockValue ?? p.costPrice * (wQty + bQty));
  }, 0);

  const totalWarehouseQty = products.reduce((acc, p) => acc + (warehouseStock[p.id] || 0), 0);
  const totalBranchesQty = products.reduce((acc, p) => acc + (branchStock[p.id] || 0), 0);
  const lowStockCount = products.filter(p => ((warehouseStock[p.id] || 0) + (branchStock[p.id] || 0)) <= p.reorderLevel).length;

  return (
    <div className="space-y-6">
      
      {/* BI Executive Header */}
      <div className="bg-[#333333] text-white p-6 rounded-xl shadow-md border-l-4 border-[#FF6B00] space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#FF6B00] text-white rounded-lg flex items-center justify-center font-bold shadow-lg shrink-0">
              <BrainCircuit className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Business Intelligence & Operational Engine</h1>
                <span className="px-2.5 py-0.5 bg-orange-500/20 text-[#FF6B00] border border-[#FF6B00]/40 rounded text-[10px] font-bold uppercase tracking-wider">
                  Active BI Decision Brain
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-1 max-w-3xl">
                Real-time predictive analytics, inventory valuation matrix, multi-branch stock telemetry, and immutable activity audit trail.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto text-xs">
            <div className="bg-white/10 px-3 py-2 rounded-lg border border-white/10 text-center">
              <p className="text-[10px] text-gray-300 font-semibold uppercase">Total Asset Valuation</p>
              <p className="text-sm font-bold text-green-400">{currency}{totalValuationCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-white/10 px-3 py-2 rounded-lg border border-white/10 text-center">
              <p className="text-[10px] text-gray-300 font-semibold uppercase">Warehouse Stock</p>
              <p className="text-sm font-bold text-white">{totalWarehouseQty} pcs</p>
            </div>
            <div className="bg-white/10 px-3 py-2 rounded-lg border border-white/10 text-center">
              <p className="text-[10px] text-gray-300 font-semibold uppercase">Branch Stock</p>
              <p className="text-sm font-bold text-white">{totalBranchesQty} pcs</p>
            </div>
            <div className="bg-white/10 px-3 py-2 rounded-lg border border-white/10 text-center">
              <p className="text-[10px] text-gray-300 font-semibold uppercase">Reorder Alerts</p>
              <p className="text-sm font-bold text-amber-400">{lowStockCount} SKUs</p>
            </div>
          </div>
        </div>

        {/* BI View Switcher Tabs */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-700 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveSubTab('inventory_bi')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition ${
              activeSubTab === 'inventory_bi'
                ? 'bg-[#FF6B00] text-white shadow'
                : 'bg-white/10 text-gray-300 hover:text-white hover:bg-white/20'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Inventory BI & Stock Matrix</span>
            <span className="ml-1 px-2 py-0.5 bg-black/30 rounded-full text-[10px]">{products.length}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('audit_logs')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition ${
              activeSubTab === 'audit_logs'
                ? 'bg-[#FF6B00] text-white shadow'
                : 'bg-white/10 text-gray-300 hover:text-white hover:bg-white/20'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Audit Trail Logs</span>
            <span className="ml-1 px-2 py-0.5 bg-black/30 rounded-full text-[10px]">{aggregates.totalEventsLogged}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('insights')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition ${
              activeSubTab === 'insights'
                ? 'bg-[#FF6B00] text-white shadow'
                : 'bg-white/10 text-gray-300 hover:text-white hover:bg-white/20'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Predictive Insights & Anomalies</span>
            {aggregates.anomalyCount > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-red-500 text-white rounded-full text-[10px] font-bold">
                {aggregates.anomalyCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* SECTION 1: INVENTORY BI TABLE */}
      {activeSubTab === 'inventory_bi' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3"><div><b className="text-sm">Inventory movement and regional pricing period</b><p className="text-xs text-slate-600">Regions are derived only from configured branch addresses inside the vendor's country; incomplete addresses remain Unclassified.</p></div><select value={periodDays} onChange={event=>setPeriodDays(Number(event.target.value))} className="border bg-white px-3 py-2 text-xs font-bold"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option></select></div>
          <div className="grid gap-3 lg:grid-cols-3">
            <article className="rounded-lg border p-3"><h3 className="font-black text-sm">Movements over time</h3><p className="mt-1 text-2xl font-black text-[#FF6600]">{movementEvents.length}</p><p className="text-xs text-slate-500">Audited receipts, transfers, adjustments and sales events</p></article>
            <article className="rounded-lg border p-3"><h3 className="font-black text-sm">Product price changes</h3><p className="mt-1 text-2xl font-black text-[#FF6600]">{priceChanges.length}</p><p className="text-xs text-slate-500">Cost, base selling and branch override changes</p></article>
            <article className="rounded-lg border p-3"><h3 className="font-black text-sm">Regional demand coverage</h3><p className="mt-1 text-2xl font-black text-[#FF6600]">{regionalDemand.length}</p><p className="text-xs text-slate-500">Configured regions with completed sales</p></article>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[520px] text-xs"><thead className="bg-slate-800 text-white"><tr><th className="p-2 text-left">Region / town</th><th>Orders</th><th>Units demanded</th><th>Revenue</th></tr></thead><tbody>{regionalDemand.map(row=><tr key={row.region} className="border-t"><td className="p-2 font-bold">{row.region}</td><td className="text-center">{row.orders}</td><td className="text-center">{row.units}</td><td className="text-right p-2">{currency}{row.revenue.toFixed(2)}</td></tr>)}{!regionalDemand.length&&<tr><td colSpan={4} className="p-5 text-center text-slate-500">No regional demand in this period.</td></tr>}</tbody></table></div>
            <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[620px] text-xs"><thead className="bg-slate-800 text-white"><tr><th className="p-2 text-left">Region / branch</th><th className="text-left">SKU / product</th><th>Base price</th><th>Regional price</th><th>Variation</th></tr></thead><tbody>{regionalPriceRows.slice(0,100).map(row=><tr key={`${row.product.id}-${row.branch?.id}`} className="border-t"><td className="p-2">{row.region} · {row.branch?.name||'Unknown branch'}</td><td>{row.product.sku} · {row.product.name}</td><td className="text-right">{currency}{row.product.sellingPrice.toFixed(2)}</td><td className="text-right">{currency}{row.price.toFixed(2)}</td><td className="p-2 text-right font-bold">{row.product.sellingPrice ? (((row.price-row.product.sellingPrice)/row.product.sellingPrice)*100).toFixed(1) : '0.0'}%</td></tr>)}{!regionalPriceRows.length&&<tr><td colSpan={5} className="p-5 text-center text-slate-500">No branch price variations configured.</td></tr>}</tbody></table></div>
          </div>
          
          {/* Section Header & Filters */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-[#333333] flex items-center gap-2">
                <Package className="w-5 h-5 text-[#FF6B00]" />
                Inventory BI Valuation & Location Telemetry
              </h2>
              <p className="text-xs text-gray-500">
                Detailed stock breakdown across central warehouse and branch locations with SKU shelf tracking.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search SKU, Name, Location, Shelf..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#FF6B00] focus:outline-none"
                />
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-1.5 bg-gray-50 p-1 rounded-lg border border-gray-200">
                <Filter className="w-3.5 h-3.5 text-gray-400 ml-1" />
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-gray-700 focus:outline-none pr-1"
                >
                  <option value="ALL">All Categories</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Low Stock Toggle */}
              <button
                onClick={() => setShowLowStockOnly(!showLowStockOnly)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition flex items-center gap-1.5 ${
                  showLowStockOnly
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Low Stock Alerts</span>
              </button>
            </div>
          </div>

          {/* INVENTORY BI TABLE */}
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-800 text-white font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-3">Product SKU</th>
                  <th className="py-3 px-3">Name</th>
                  <th className="py-3 px-3">Location</th>
                  <th className="py-3 px-3">Shelf</th>
                  <th className="py-3 px-3 text-center">Warehouse QTY</th>
                  <th className="py-3 px-3 text-center">Branches QTY</th>
                  <th className="py-3 px-3 text-right">Average Stock Cost</th>
                  <th className="py-3 px-3 text-right">Price by Branch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {filteredProducts.map(product => {
                  const wQty = warehouseStock[product.id] || 0;
                  const bQty = branchStock[product.id] || 0;
                  const totalQty = wQty + bQty;
                  const isLowStock = totalQty <= product.reorderLevel;

                  return (
                    <tr key={product.id} className="hover:bg-orange-50/20 transition-colors">
                      {/* Product SKU */}
                      <td className="py-3 px-3 whitespace-nowrap font-mono font-bold text-[#FF6B00]">
                        <span className="bg-orange-50 text-[#FF6B00] border border-orange-200 px-2 py-1 rounded">
                          {product.sku}
                        </span>
                      </td>

                      {/* Name & Category */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-[#333333] text-xs">{product.name}</div>
                        <div className="text-[10px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                          <span className="bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded">{product.category}</span>
                          <span>Unit: {product.unit}</span>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-3 px-3 text-gray-700 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-xs">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{product.location || 'Central Depot / Main Warehouse'}</span>
                        </div>
                      </td>

                      {/* Shelf */}
                      <td className="py-3 px-3 text-gray-700 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-xs font-mono">
                          <Tag className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{product.shelf || 'Aisle A, Shelf 1'}</span>
                        </div>
                      </td>

                      {/* Warehouse QTY */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full font-bold text-xs ${
                          wQty === 0
                            ? 'bg-red-100 text-red-700'
                            : wQty < 10
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {wQty} {product.unit}
                        </span>
                      </td>

                      {/* Branches QTY */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex flex-col items-center">
                          <span className={`px-2.5 py-1 rounded-full font-bold text-xs ${
                            bQty === 0
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-green-50 text-green-700 border border-green-200'
                          }`}>
                            {bQty} {product.unit}
                          </span>
                          {branches.length > 0 && (
                            <div className="text-[9px] text-gray-400 mt-1 flex gap-1">
                              {branches.map(b => (
                                <span key={b.id} className="bg-gray-100 px-1 rounded">
                                  {b.code || b.name}: {bQty > 0 ? Math.floor(bQty / branches.length) : 0}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Cost */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-gray-700 whitespace-nowrap">
                        <div>{currency}{(inventoryCosts[product.id]?.averageUnitCost ?? product.costPrice).toFixed(2)}</div>
                        <div className="text-[10px] text-gray-400 font-normal">
                          Total: {currency}{(inventoryCosts[product.id]?.stockValue ?? product.costPrice * totalQty).toFixed(2)}
                        </div>
                      </td>

                      {/* Price by Branch */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-green-700 whitespace-nowrap">
                        <div className="text-xs">{currency}{product.sellingPrice.toFixed(2)}</div>
                        <div className="text-[9px] text-gray-400 font-normal">
                          {branches.length === 0 ? 'Standard' : `${branches.length} Branches Synchronized`}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredProducts.length === 0 && (
              <div className="py-12 text-center space-y-2 text-gray-400">
                <Package className="w-8 h-8 mx-auto text-gray-300" />
                <p className="text-xs font-semibold">No products match your current Inventory BI filters.</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* SECTION 2: AUDIT LOGS TABLE */}
      {activeSubTab === 'audit_logs' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-[#333333] flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#FF6B00]" />
                Immutable System Audit Stream
              </h2>
              <p className="text-xs text-gray-500">
                Capturing security approvals, inventory shifts, cash drawer events, and POS transactions.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search logs..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#FF6B00] focus:outline-none"
                />
              </div>

              <select
                value={selectedType}
                onChange={e => setSelectedType(e.target.value)}
                className="px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#FF6B00] focus:outline-none bg-white font-medium"
              >
                <option value="ALL">All Event Types</option>
                <option value="POS_TRANSACTION">POS Transactions</option>
                <option value="SUPPLY_RECEIPT">Supplier Receipts</option>
                <option value="STOCK_TRANSFER">Stock Transfers</option>
                <option value="STOCK_ADJUSTMENT">Stock Adjustments</option>
                <option value="APPROVAL_REQUESTED">Approval Requests</option>
                <option value="APPROVAL_DECISION">Approval Decisions</option>
                <option value="STAFF_CREATED">Staff Created</option>
                <option value="SETTINGS_UPDATE_PROFILE">Profile Settings</option>
                <option value="SETTINGS_UPDATE_HARDWARE">Hardware Settings</option>
                <option value="SETTINGS_CREATE_ROLE">Role Created</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-800 text-white font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Action Summary</th>
                  <th className="py-2.5 px-3">Staff / Actor</th>
                  <th className="py-2.5 px-3 text-right">Risk Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>

                    <td className="py-2.5 px-3 font-bold text-gray-700 whitespace-nowrap">
                      <span className="bg-gray-100 text-gray-800 text-[10px] px-2 py-0.5 rounded font-mono">
                        {log.eventType}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 font-medium text-[#333333]">
                      {log.actionSummary}
                    </td>

                    <td className="py-2.5 px-3 text-gray-600 font-medium whitespace-nowrap">
                      {log.staffName || 'System'} <span className="text-gray-400">({log.staffRole || 'admin'})</span>
                    </td>

                    <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        log.riskScore >= 70
                          ? 'bg-red-100 text-red-800 border border-red-200'
                          : log.riskScore >= 40
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {log.riskScore} / 100
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredLogs.length === 0 && (
              <div className="py-8 text-center text-gray-400 text-xs">
                No BI events recorded for this filter query.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: PREDICTIVE INSIGHTS */}
      {activeSubTab === 'insights' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-[#FF6B00]" />
            <h2 className="text-sm font-bold text-[#333333] uppercase tracking-wider">Predictive Decision Intelligence</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map(ins => (
              <div
                key={ins.id}
                className={`p-5 bg-white rounded-xl border shadow-sm space-y-3 ${
                  ins.severity === 'critical'
                    ? 'border-red-200 bg-red-50/10'
                    : ins.severity === 'high'
                    ? 'border-orange-200'
                    : 'border-gray-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded uppercase ${
                    ins.severity === 'critical'
                      ? 'bg-red-100 text-red-800'
                      : ins.severity === 'high'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {ins.severity} Severity
                  </span>
                  <span className="text-[10px] text-gray-400 font-medium">Confidence: {(ins.confidenceScore * 100).toFixed(0)}%</span>
                </div>

                <h3 className="font-bold text-sm text-[#333333]">{ins.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{ins.description}</p>

                <div className="pt-2 border-t border-gray-100 flex items-start gap-2 text-xs text-orange-900 bg-orange-50/60 p-2.5 rounded-lg">
                  <Zap className="w-4 h-4 text-[#FF6B00] shrink-0 mt-0.5" />
                  <span><strong>Recommendation:</strong> {ins.recommendation}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
