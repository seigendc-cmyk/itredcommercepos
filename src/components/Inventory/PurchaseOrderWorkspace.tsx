import React, { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, FileDown, Plus, Printer, Search, Send, ShoppingCart, Trash2 } from 'lucide-react';
import { Product, PurchaseOrder, PurchaseOrderItem, StaffMember, Supplier, Warehouse } from '../../types';
import { createPurchaseOrder, fetchPurchaseOrders, fetchSuppliers, fetchSystemInventoryTotals } from '../../services/db';
import { buildPurchaseRecommendations } from '../../features/purchasing/purchaseOrders';
import { searchReceivingProducts } from '../../services/supplierReceiving';
import { logBIEvent } from '../../bi/tracker';
import { AddSupplierModal } from '../Suppliers/AddSupplierModal';
import { PurchaseOrderFormModal } from './PurchaseOrderFormModal';

interface Props { vendorId: string; businessName: string; currency: string; products: Product[]; warehouses: Warehouse[]; activeStaff: StaffMember; onChanged: () => void; }
type DraftLine = Omit<PurchaseOrderItem, 'receivedQuantity'>;

export function PurchaseOrderWorkspace({ vendorId, businessName, currency, products, warehouses, activeStaff, onChanged }: Props) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [supplierId, setSupplierId] = useState('');
  const [source, setSource] = useState<'PLANNED' | 'BI_RECOMMENDATION'>('PLANNED');
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [poFormOpen, setPoFormOpen] = useState(false);
  const load = async () => {
    const [nextOrders, nextSuppliers, nextTotals] = await Promise.all([fetchPurchaseOrders(vendorId), fetchSuppliers(vendorId), fetchSystemInventoryTotals(vendorId)]);
    setOrders(nextOrders); setSuppliers(nextSuppliers); setTotals(nextTotals); setSupplierId(current => current || nextSuppliers[0]?.id || '');
  };
  useEffect(() => { void load().catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load purchase orders.')); }, [vendorId]);
  const recommendations = useMemo(() => buildPurchaseRecommendations(products, totals), [products, totals]);
  const results = useMemo(() => searchReceivingProducts(products, query).slice(0, 7), [products, query]);
  const selectedSupplier = suppliers.find(item => item.id === supplierId);
  const addProduct = (product: Product, quantity = 1) => {
    setLines(current => current.some(line => line.productId === product.id) ? current : [...current, { productId: product.id, productName: product.name, sku: product.sku, orderedQuantity: quantity, unitCost: product.costPrice, unitOfMeasure: product.unit }]);
    setQuery('');
  };
  const useRecommendations = () => { setSource('BI_RECOMMENDATION'); setLines(recommendations.map(({ systemQuantity: _system, recommendedQuantity: _recommended, rationale: _rationale, ...line }) => line)); setPoFormOpen(true); };
  const total = lines.reduce((sum, line) => sum + line.orderedQuantity * line.unitCost, 0);
  const submit = async () => {
    if (!selectedSupplier) return setError('Select a supplier before submitting.');
    setBusy(true); setError('');
    try {
      await createPurchaseOrder(vendorId, { supplierId: selectedSupplier.id, supplierName: selectedSupplier.name, source, notes, items: lines, requester: { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role } });
      setLines([]); setNotes(''); await load(); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Purchase order submission failed.'); }
    finally { setBusy(false); }
  };
  const pdf = async (order: PurchaseOrder, share = false) => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF(); doc.setFontSize(16); doc.text(`${businessName} - Purchase Order`, 14, 16); doc.setFontSize(10); doc.text(`${order.orderNumber} | ${order.supplierName} | ${order.status}`, 14, 23);
    autoTable(doc, { startY: 29, head: [['SKU', 'Product', 'Qty', 'Unit', 'Unit Cost', 'Total']], body: order.items.map(item => [item.sku || '', item.productName, item.orderedQuantity, item.unitOfMeasure || '', `${currency}${item.unitCost.toFixed(2)}`, `${currency}${(item.unitCost * item.orderedQuantity).toFixed(2)}`]), foot: [['', 'TOTAL', '', '', '', `${currency}${order.items.reduce((sum, item) => sum + item.orderedQuantity * item.unitCost, 0).toFixed(2)}`]] });
    if (share && navigator.share) {
      const file = new File([doc.output('blob')], `${order.orderNumber}.pdf`, { type: 'application/pdf' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) { await navigator.share({ title: order.orderNumber, text: `Purchase order for ${order.supplierName}`, files: [file] }); await logBIEvent(vendorId, 'PURCHASE_ORDER_PDF_SHARED', `${order.orderNumber} PDF shared`, { purchaseOrderId: order.id, channel: 'device_share' }, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role }); return; }
    }
    doc.save(`${order.orderNumber}.pdf`);
    await logBIEvent(vendorId, share ? 'PURCHASE_ORDER_PDF_SHARED' : 'PURCHASE_ORDER_PRINTED', `${order.orderNumber} PDF ${share ? 'prepared for sharing' : 'downloaded'}`, { purchaseOrderId: order.id, channel: share ? 'whatsapp' : 'pdf' }, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role });
    if (share) window.open(`https://wa.me/?text=${encodeURIComponent(`${businessName} purchase order ${order.orderNumber}. Please attach the downloaded PDF.`)}`, '_blank', 'noopener,noreferrer');
  };
  const print = (order: PurchaseOrder) => {
    const popup = window.open('', '_blank', 'width=900,height=700'); if (!popup) return;
    const rows = order.items.map(item => `<tr><td>${item.sku || ''}</td><td>${item.productName}</td><td>${item.orderedQuantity}</td><td>${currency}${item.unitCost.toFixed(2)}</td><td>${currency}${(item.orderedQuantity * item.unitCost).toFixed(2)}</td></tr>`).join('');
    popup.document.write(`<title>${order.orderNumber}</title><style>body{font:12px Arial;padding:25px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #555;padding:8px;text-align:left}</style><h2>${businessName} - Purchase Order</h2><p>${order.orderNumber} | ${order.supplierName} | ${order.status}</p><table><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Cost</th><th>Total</th></tr>${rows}</table>`); popup.document.close(); popup.print(); void logBIEvent(vendorId, 'PURCHASE_ORDER_PRINTED', `${order.orderNumber} device print requested`, { purchaseOrderId: order.id, channel: 'device_print' }, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role });
  };
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-xl font-black"><ShoppingCart className="text-[#FF6600]"/>Purchase Orders</h1><p className="text-xs text-slate-500">Planning and approval only. Inventory changes exclusively through approved stock receiving.</p></div><div className="flex gap-2"><button onClick={()=>{setSource('PLANNED');setLines([]);setPoFormOpen(true);}} className="flex items-center gap-2 rounded bg-[#FF6600] px-4 py-2 text-xs font-black text-white"><Plus className="h-4"/>Create Planned Purchase Order</button><button onClick={useRecommendations} disabled={!recommendations.length} className="flex items-center gap-2 rounded bg-[#1F242D] px-4 py-2 text-xs font-bold text-white disabled:opacity-40"><BrainCircuit className="h-4 w-4"/>Use {recommendations.length} BI recommendations</button></div></header>
    {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
    <section className="hidden rounded-xl border bg-white p-4 shadow-sm space-y-4" aria-hidden="true">
      <div className="grid gap-3 md:grid-cols-3"><label className="text-xs font-bold">Supplier<select value={supplierId} onChange={e=>{ if(e.target.value==='__add_new__') setAddSupplierOpen(true); else setSupplierId(e.target.value); }} className="mt-1 w-full rounded border p-2"><option value="">Select supplier</option><option value="__add_new__">＋ Add New Supplier…</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}{s.businessNumber?` · ${s.businessNumber}`:''}</option>)}</select></label><label className="text-xs font-bold">PO source<select value={source} onChange={e=>setSource(e.target.value as typeof source)} className="mt-1 w-full rounded border p-2"><option value="PLANNED">Planned purchase</option><option value="BI_RECOMMENDATION">BI recommendation</option></select></label><label className="text-xs font-bold">Notes<input value={notes} onChange={e=>setNotes(e.target.value)} className="mt-1 w-full rounded border p-2"/></label></div>
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search and add products by SKU, name, barcode or code" className="w-full rounded border py-2.5 pl-9"/>{query && <div className="absolute z-10 w-full border bg-white shadow">{results.map(product=><button key={product.id} onClick={()=>addProduct(product)} className="flex w-full justify-between p-2 text-xs hover:bg-orange-50"><span>{product.sku} · {product.name}</span><Plus className="h-4 w-4"/></button>)}</div>}</div>
      <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-xs"><thead className="bg-[#1F242D] text-white"><tr><th className="p-2 text-left">SKU / Product</th><th>System Qty</th><th>Order Qty</th><th>Unit Cost</th><th>Total</th><th/></tr></thead><tbody>{lines.map((line,index)=><tr key={line.productId} className="border-b"><td className="p-2"><b>{line.sku}</b> · {line.productName}</td><td className="text-center">{totals[line.productId]||0}</td><td><input type="number" min="1" value={line.orderedQuantity} onChange={e=>setLines(current=>current.map((item,i)=>i===index?{...item,orderedQuantity:Number(e.target.value)}:item))} className="w-20 border p-1"/></td><td><input type="number" min="0" step="0.01" value={line.unitCost} onChange={e=>setLines(current=>current.map((item,i)=>i===index?{...item,unitCost:Number(e.target.value)}:item))} className="w-24 border p-1"/></td><td>{currency}{(line.orderedQuantity*line.unitCost).toFixed(2)}</td><td><button onClick={()=>setLines(current=>current.filter((_,i)=>i!==index))}><Trash2 className="h-4 w-4 text-red-600"/></button></td></tr>)}</tbody></table></div>
      <div className="flex justify-end gap-4 items-center"><b>Total: {currency}{total.toFixed(2)}</b><button onClick={()=>void submit()} disabled={busy||!lines.length} className="rounded bg-[#FF6600] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{busy?'Submitting…':'Send for management approval'}</button></div>
    </section>
    <section><h2 className="mb-2 font-black">BI Recommended Purchases</h2><div className="overflow-x-auto rounded border bg-white"><table className="min-w-[850px] w-full text-xs"><thead className="bg-slate-100"><tr><th className="p-2 text-left">SKU / Product</th><th>System Qty</th><th>Recommended Qty</th><th className="text-left">Analytics basis</th></tr></thead><tbody>{recommendations.map(item=><tr key={item.productId} className="border-t"><td className="p-2"><b>{item.sku}</b> · {item.productName}</td><td className="text-center">{item.systemQuantity}</td><td className="text-center font-bold text-[#FF6600]">{item.recommendedQuantity}</td><td>{item.rationale}</td></tr>)}</tbody></table></div></section>
    <section><h2 className="mb-2 font-black">Purchase Order History</h2><div className="space-y-2">{orders.map(order=><article key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded border bg-white p-3 text-xs"><div><b>{order.orderNumber}</b> · {order.supplierName}<p>{order.source?.replaceAll('_',' ')} · {order.status} · {order.items.length} lines</p></div><div className="flex gap-2"><button title="Device print" onClick={()=>print(order)}><Printer className="h-4 w-4"/></button><button title="Download PDF" onClick={()=>void pdf(order)}><FileDown className="h-4 w-4"/></button><button title="Share PDF via WhatsApp" onClick={()=>void pdf(order,true)}><Send className="h-4 w-4 text-green-600"/></button></div></article>)}</div></section>
    <AddSupplierModal isOpen={addSupplierOpen} onClose={()=>setAddSupplierOpen(false)} vendorId={vendorId} activeStaff={activeStaff} onCreated={supplier=>{ setSuppliers(current=>[...current,supplier].sort((a,b)=>a.name.localeCompare(b.name))); setSupplierId(supplier.id); }} />
    <PurchaseOrderFormModal isOpen={poFormOpen} onClose={()=>setPoFormOpen(false)} vendorId={vendorId} businessName={businessName} currency={currency} products={products} systemQuantities={totals} suppliers={suppliers} setSuppliers={setSuppliers} warehouses={warehouses} activeStaff={activeStaff} source={source} initialLines={lines} onSubmit={async input=>{await createPurchaseOrder(vendorId,input);await load();onChanged();}} />
  </div>;
}
