import React, { useMemo, useState } from 'react';
import { Archive, ClipboardCheck, Download, Edit3, FileSpreadsheet, Package, Plus, RotateCcw, Search } from 'lucide-react';
import { ApprovalRequest, Branch, Product, StaffMember, Warehouse } from '../../types';
import { exportProductCsvTemplate, exportProductXlsxTemplate, ProductImportLocation } from '../../features/product-import';
import { StocktakeWorkspace } from '../Inventory/StocktakeWorkspace';
import { BIEventType } from '../../bi/types';

interface Props {
  products: Product[]; warehouseStock: Record<string, number>; branchStock: Record<string, number>;
  warehouses?: Warehouse[]; branches?: Branch[]; activeStaff?: StaffMember; vendorId?: string; businessName?: string;
  approvalRequests?: ApprovalRequest[];
  onOpenAddProductModal: () => void; onOpenImportModal?: () => void; onEditProduct: (product: Product) => void;
  onSubmitStocktakeApproval?: (payload: any) => Promise<void>; onNavigateToApprovals?: () => void;
  onStockLocationChange?: (type: 'warehouse' | 'branch', id: string) => Promise<void>;
  onArchiveProduct?: (product: Product) => Promise<void>; onRestoreProduct?: (product: Product) => Promise<void>;
  onTemplateExport?: (format: 'CSV' | 'XLSX') => void;
  onLogBIEvent?: (eventType: BIEventType, details: Record<string, unknown>) => Promise<unknown> | void;
}

export const ProductManagement: React.FC<Props> = ({ products, warehouseStock, branchStock, warehouses = [], branches = [], activeStaff, vendorId = '', businessName = 'iTred Commerce POS', approvalRequests = [], onOpenAddProductModal, onOpenImportModal, onEditProduct, onSubmitStocktakeApproval, onNavigateToApprovals, onStockLocationChange, onArchiveProduct, onRestoreProduct, onTemplateExport, onLogBIEvent }) => {
  const [subTab, setSubTab] = useState<'catalog' | 'stocktake'>('catalog');
  const [search, setSearch] = useState(''); const [showArchived, setShowArchived] = useState(false);
  const firstLocation = warehouses[0] ? `warehouse:${warehouses[0].id}` : branches[0] ? `branch:${branches[0].id}` : '';
  const [location, setLocation] = useState(firstLocation);
  const [exportOpen, setExportOpen] = useState(false);
  const [locationType, locationId] = location.split(':') as ['warehouse' | 'branch', string];
  const selectedLocation = locationType === 'warehouse' ? warehouses.find(item => item.id === locationId) : branches.find(item => item.id === locationId);
  const stock = locationType === 'warehouse' ? warehouseStock : branchStock;
  const locations: ProductImportLocation[] = [...warehouses.map(item => ({ id: item.id, code: item.code, name: item.name, type: 'warehouse' as const })), ...branches.map(item => ({ id: item.id, code: item.code, name: item.name, type: 'branch' as const }))];
  const rows = useMemo(() => products.filter(product => (showArchived || product.status !== 'archived') && [product.sku, product.name, product.barcode, product.alternativeLookupCode].some(value => value?.toLowerCase().includes(search.toLowerCase()))), [products, search, showArchived]);
  const exportOptions = { tenantId: vendorId, applicationVersion: import.meta.env?.VITE_APP_VERSION, categories: Array.from(new Set<string>(products.map(product => product.category))), locations };
  if (subTab === 'stocktake' && activeStaff && onSubmitStocktakeApproval) return <div className="space-y-4"><button onClick={() => setSubTab('catalog')} className="font-bold text-[#FF6600]">← Product Catalog</button><StocktakeWorkspace products={products} warehouses={warehouses} branches={branches} warehouseStock={warehouseStock} branchStock={branchStock} activeStaff={activeStaff} vendorId={vendorId} businessName={businessName} approvalRequests={approvalRequests} onSubmitStocktakeApproval={onSubmitStocktakeApproval} onNavigateToApprovals={onNavigateToApprovals} onStockLocationChange={onStockLocationChange} onLogBIEvent={onLogBIEvent} /></div>;
  const changeLocation = async (value: string) => { setLocation(value); const [type, id] = value.split(':') as ['warehouse' | 'branch', string]; await onStockLocationChange?.(type, id); };
  return <div className="space-y-5">
    <section className="bg-white border border-slate-300 p-5 flex flex-col lg:flex-row justify-between gap-4">
      <div><h2 className="text-xl font-black flex gap-2"><Package className="text-[#FF6600]" />Master Product Catalog</h2><p className="text-sm text-slate-600">Canonical product masters with location-scoped quantity.</p></div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setSubTab('stocktake')} className="px-3 py-2 bg-slate-900 text-white font-bold flex gap-2"><ClipboardCheck className="w-4" />Stocktake</button>
        <button onClick={onOpenImportModal} className="px-3 py-2 bg-slate-800 text-white font-bold flex gap-2"><FileSpreadsheet className="w-4 text-[#FF6600]" />Import Products</button>
        <div className="relative"><button onClick={() => setExportOpen(!exportOpen)} className="px-3 py-2 border border-slate-400 font-bold flex gap-2"><Download className="w-4" />Export Template</button>{exportOpen && <div className="absolute right-0 z-10 bg-white border shadow-lg min-w-40"><button onClick={() => { exportProductCsvTemplate(); onTemplateExport?.('CSV'); setExportOpen(false); }} className="block w-full text-left p-3 hover:bg-slate-100">CSV template</button><button onClick={() => { exportProductXlsxTemplate(exportOptions); onTemplateExport?.('XLSX'); setExportOpen(false); }} className="block w-full text-left p-3 hover:bg-slate-100">XLSX template</button></div>}</div>
        <button onClick={onOpenAddProductModal} className="px-3 py-2 bg-[#FF6600] text-white font-black flex gap-2"><Plus className="w-4" />Add Product</button>
      </div>
    </section>
    <section className="bg-white border border-slate-300 p-4 flex flex-col md:flex-row gap-3">
      <label className="relative flex-1"><Search className="absolute left-3 top-3 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search SKU, name, barcode or ALU" className="w-full border p-2.5 pl-9" /></label>
      <select aria-label="Stock location" value={location} onChange={event => changeLocation(event.target.value)} className="border p-2.5 font-bold"><option value="">Select stock location</option>{warehouses.map(item => <option key={item.id} value={`warehouse:${item.id}`}>Warehouse · {item.code} · {item.name}</option>)}{branches.map(item => <option key={item.id} value={`branch:${item.id}`}>Branch · {item.code} · {item.name}</option>)}</select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />Show archived</label>
    </section>
    <div className="hidden md:block bg-white border border-slate-300 overflow-x-auto"><table className="min-w-[1500px] w-full text-xs"><thead className="bg-[#1F242D] text-white sticky top-0"><tr>{['SKU','Product Name','Description','Category','Size','Cost','Price','Qty','UM','Location','Alternative Look Up','Product Type','Actions'].map(value => <th key={value} className={`p-3 text-left ${value === 'SKU' ? 'sticky left-0 bg-[#1F242D]' : ''}`}>{value}</th>)}</tr></thead><tbody>{rows.map(product => <tr key={product.id} className="border-t"><td className="p-3 sticky left-0 bg-white font-mono font-black">{product.sku}</td><td className="p-3 font-bold">{product.name}</td><td className="p-3 max-w-52 truncate">{product.description || '—'}</td><td className="p-3">{product.category}</td><td className="p-3">{product.size || '—'}</td><td className="p-3">${product.costPrice.toFixed(2)}</td><td className="p-3 text-[#FF6600] font-black">${product.sellingPrice.toFixed(2)}</td><td className="p-3 font-black">{stock[product.id] ?? 0}</td><td className="p-3">{product.unitOfMeasure || product.unit}</td><td className="p-3">{selectedLocation ? `${selectedLocation.code} · ${selectedLocation.name}` : 'Select location'}</td><td className="p-3">{product.alternativeLookupCode || '—'}</td><td className="p-3">{product.productType}</td><td className="p-3 sticky right-0 bg-white"><div className="flex gap-1"><button onClick={() => onEditProduct(product)} title="Edit Product" className="p-2"><Edit3 className="w-4" /></button>{product.status === 'archived' ? <button onClick={() => onRestoreProduct?.(product)} title="Restore Product" className="p-2 text-green-700"><RotateCcw className="w-4" /></button> : <button onClick={() => onArchiveProduct?.(product)} title="Delete or archive product" className="p-2 text-red-700"><Archive className="w-4" /></button>}</div></td></tr>)}</tbody></table></div>
    <div className="md:hidden space-y-3">{rows.map(product => <article key={product.id} className="bg-white border-l-4 border-[#FF6600] p-4"><div className="flex justify-between"><div><p className="font-mono text-xs">{product.sku}</p><h3 className="font-black">{product.name}</h3></div><button onClick={() => onEditProduct(product)}><Edit3 className="w-4" /></button></div><dl className="grid grid-cols-2 gap-2 text-xs mt-3"><div><dt className="text-slate-500">Qty / UM</dt><dd className="font-black">{stock[product.id] ?? 0} {product.unitOfMeasure || product.unit}</dd></div><div><dt className="text-slate-500">Location</dt><dd>{selectedLocation?.code || 'Select location'}</dd></div><div><dt className="text-slate-500">Category</dt><dd>{product.category}</dd></div><div><dt className="text-slate-500">Type</dt><dd>{product.productType}</dd></div></dl></article>)}</div>
  </div>;
};
