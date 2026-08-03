import { useEffect, useMemo, useState } from 'react';
import { Building2, RefreshCw, Search, Warehouse as WarehouseIcon } from 'lucide-react';
import { fetchBranchStock, fetchWarehouseStock } from '../../services/db';
import { Branch, Product, Warehouse } from '../../types';

interface Props { vendorId: string; products: Product[]; warehouses: Warehouse[]; branches: Branch[]; }
interface CostCenter { id: string; code: string; name: string; type: 'warehouse' | 'branch'; }
type StockByCostCenter = Record<string, Record<string, number>>;

export function StockCostCenterMatrix({ vendorId, products, warehouses, branches }: Props) {
  const [stock, setStock] = useState<StockByCostCenter>({});
  const [search, setSearch] = useState('');
  const [costCenterType, setCostCenterType] = useState<'all' | 'warehouse' | 'branch'>('all');
  const [selectedCostCenter, setSelectedCostCenter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const costCenters = useMemo<CostCenter[]>(() => [
    ...warehouses.map(item => ({ id: item.id, code: item.code, name: item.name, type: 'warehouse' as const })),
    ...branches.map(item => ({ id: item.id, code: item.code, name: item.name, type: 'branch' as const })),
  ], [warehouses, branches]);
  const typeFilteredCenters = useMemo(() => costCenters.filter(center => costCenterType === 'all' || center.type === costCenterType), [costCenters, costCenterType]);
  const visibleCostCenters = useMemo(() => typeFilteredCenters.filter(center => selectedCostCenter === 'all' || `${center.type}:${center.id}` === selectedCostCenter), [typeFilteredCenters, selectedCostCenter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    Promise.all(costCenters.map(async center => [`${center.type}:${center.id}`, center.type === 'warehouse' ? await fetchWarehouseStock(vendorId, center.id) : await fetchBranchStock(vendorId, center.id)] as const))
      .then(entries => { if (!cancelled) setStock(Object.fromEntries(entries)); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load stock balances.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [vendorId, costCenters, reloadKey]);

  const quantity = (center: CostCenter, productId: string) => stock[`${center.type}:${center.id}`]?.[productId] ?? 0;
  const rows = useMemo(() => {
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter(product => {
      if (product.status === 'archived') return false;
      if (!tokens.length) return true;
      // Include every persisted product field plus cost-center names, codes,
      // types and balances. Tokens may be entered in any order.
      const inventoryFields = visibleCostCenters.flatMap(center => [center.type, center.code, center.name, String(quantity(center, product.id))]);
      const corpus = `${Object.values(product).map(value => typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')).join(' ')} ${inventoryFields.join(' ')}`.toLowerCase();
      return tokens.every(token => corpus.includes(token));
    });
  }, [products, search, visibleCostCenters, stock]);

  return <div className="space-y-4">
    <header className="bg-white border border-slate-300 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"><div><h2 className="text-xl font-black">Stock by Cost Center</h2><p className="text-sm text-slate-600">All active products across {warehouses.length} warehouse{warehouses.length === 1 ? '' : 's'} and {branches.length} branch{branches.length === 1 ? '' : 'es'}.</p></div><button onClick={() => setReloadKey(value => value + 1)} disabled={loading} className="border px-4 py-2 font-bold flex items-center gap-2 disabled:opacity-50"><RefreshCw className={`w-4 ${loading ? 'animate-spin' : ''}`} />Refresh balances</button></header>
    <section className="bg-white border border-slate-300 p-4 grid md:grid-cols-[minmax(18rem,1fr)_12rem_minmax(14rem,20rem)_auto] gap-3"><label className="relative block"><Search className="absolute left-3 top-3 w-4 text-slate-400" /><input aria-label="Search all inventory fields" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search all inventory fields, in any order" className="w-full border p-2.5 pl-9" /></label><select aria-label="Cost center type" value={costCenterType} onChange={event => { setCostCenterType(event.target.value as typeof costCenterType); setSelectedCostCenter('all'); }} className="border p-2.5 font-bold"><option value="all">All cost centers</option><option value="warehouse">Warehouses only</option><option value="branch">Branches only</option></select><select aria-label="Specific cost center" value={selectedCostCenter} onChange={event => setSelectedCostCenter(event.target.value)} className="border p-2.5 font-bold"><option value="all">All {costCenterType === 'all' ? 'warehouses and branches' : `${costCenterType}s`}</option>{typeFilteredCenters.map(center => <option key={`${center.type}:${center.id}`} value={`${center.type}:${center.id}`}>{center.type === 'warehouse' ? 'Warehouse' : 'Branch'} · {center.code} · {center.name}</option>)}</select><button onClick={() => { setSearch(''); setCostCenterType('all'); setSelectedCostCenter('all'); }} className="border px-4 py-2 font-bold">Clear filters</button></section>
    {error && <div role="alert" className="border border-red-300 bg-red-50 text-red-800 p-4">{error}</div>}
    <div className="stock-matrix-scroll bg-white border border-slate-300 max-w-full max-h-[70vh] overflow-y-auto">
      <table className="min-w-max w-full text-xs"><thead className="bg-slate-900 text-white sticky top-0 z-20"><tr><th className="p-3 text-left sticky left-0 bg-slate-900 z-30 min-w-32">SKU</th><th className="p-3 text-left sticky left-32 bg-slate-900 z-30 min-w-64">Product Name</th>{visibleCostCenters.map(center => <th key={`${center.type}:${center.id}`} className="p-3 text-right min-w-36"><span className="flex justify-end gap-1">{center.type === 'warehouse' ? <WarehouseIcon className="w-3" /> : <Building2 className="w-3" />}{center.code}</span><span className="block text-[10px] text-slate-300 font-normal truncate max-w-40" title={center.name}>{center.name}</span></th>)}<th className="p-3 text-right bg-[#FF6600] min-w-24">Total</th></tr></thead>
        <tbody>{!loading && rows.map(product => { const total = visibleCostCenters.reduce((sum, center) => sum + quantity(center, product.id), 0); return <tr key={product.id} className="border-t hover:bg-orange-50"><td className="p-3 sticky left-0 bg-white font-mono font-black">{product.sku}</td><td className="p-3 sticky left-32 bg-white font-bold">{product.name}</td>{visibleCostCenters.map(center => { const value = quantity(center, product.id); return <td key={`${center.type}:${center.id}`} className={`p-3 text-right tabular-nums ${value < 0 ? 'text-red-700 font-black' : value > 0 ? 'font-bold' : 'text-slate-400'}`}>{value}</td>; })}<td className="p-3 text-right tabular-nums font-black bg-orange-50">{total}</td></tr>; })}</tbody>
      </table>
      {loading && <div className="p-16 text-center font-bold text-slate-600">Loading stock from all cost centers…</div>}
      {!loading && !rows.length && <div className="p-16 text-center text-slate-500">No products match your search.</div>}
      {!loading && !costCenters.length && <div className="p-16 text-center text-slate-500">No warehouses or branches are configured.</div>}
    </div>
  </div>;
}
