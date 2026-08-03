import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, ShieldAlert } from 'lucide-react';
import { Branch, Product, ProductSector, ProductSectorAttributes, ProductType, StaffMember, TaxOption, Warehouse } from '../../types';
import { inspectProductUsage, requestBelowAverageCostChange, saveProduct } from '../../services/db';
import { BOOLEAN_SECTOR_FIELDS, effectiveProductTaxRate, hasExtendedProductPermission, PRODUCT_SECTORS, sanitizeSectorAttributes, SECTOR_ATTRIBUTE_FIELDS, TAX_OPTIONS, validateHsCode, ProductDuplicateError, ProductDuplicateMatch } from '../../features/products';
import { Modal } from '../Common/Modal';
import { requiresBelowAverageCostApproval } from '../../features/inventory/averageCost';

interface ProductModalProps {
  isOpen: boolean; onClose: () => void; vendorId: string; vendorTaxRate: number; vendorDefaultSector?: string;
  productToEdit?: Product | null; products: Product[]; warehouses: Warehouse[]; branches: Branch[]; activeStaff: StaffMember;
  warehouseStock: Record<string, number>; branchStock: Record<string, number>;
  averageCost?: number;
  onSuccess: () => void; onUseExistingProduct?: (product: Product) => void; onOpenStockAdjustment?: (product: Product) => void;
  onOpeningBalanceRequest: (product: Product, quantity: number, location: { id: string; name: string; type: 'warehouse' | 'branch' }, idempotencyKey: string) => Promise<void>;
}

interface FormState {
  productType: ProductType; sector: ProductSector; category: string; name: string; sku: string; barcode: string; description: string;
  costPrice: string; sellingPrice: string; quantity: string; location: string; shelfCode: string; binCode: string; unitOfMeasure: string;
  size: string; alternativeLookupCode: string; hsCode: string; taxOption: TaxOption; reorderLevel: string; primarySupplierName: string;
  brand: string; manufacturer: string; status: 'active' | 'archived'; sectorAttributes: ProductSectorAttributes;
  branchPrices: Record<string, string>;
}

const emptyForm = (defaultSector: ProductSector): FormState => ({ productType: 'INVENTORY', sector: defaultSector, category: '', name: '', sku: '', barcode: '', description: '', costPrice: '', sellingPrice: '', quantity: '', location: '', shelfCode: '', binCode: '', unitOfMeasure: '', size: '', alternativeLookupCode: '', hsCode: '', taxOption: 'STANDARD_RATED', reorderLevel: '0', primarySupplierName: '', brand: '', manufacturer: '', status: 'active', sectorAttributes: {}, branchPrices: {} });
const labelFor = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/(^|\s)\S/g, letter => letter.toUpperCase());

export const ProductModal: React.FC<ProductModalProps> = props => {
  const defaultSector = PRODUCT_SECTORS.some(option => option.value === props.vendorDefaultSector) ? props.vendorDefaultSector as ProductSector : 'GENERAL';
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultSector));
  const [sectorOpen, setSectorOpen] = useState(false); const [isSubmitting, setIsSubmitting] = useState(false); const [error, setError] = useState('');
  const [hasHistory, setHasHistory] = useState(false); const [duplicateMatches, setDuplicateMatches] = useState<ProductDuplicateMatch[]>([]); const [duplicateReason, setDuplicateReason] = useState('');
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(previous => ({ ...previous, [key]: value }));
  const isService = form.productType === 'SERVICE';
  const locations = useMemo(() => [...props.warehouses.map(item => ({ id: item.id, name: item.name, code: item.code, type: 'warehouse' as const })), ...props.branches.map(item => ({ id: item.id, name: item.name, code: item.code, type: 'branch' as const }))], [props.branches, props.warehouses]);

  useEffect(() => {
    const product = props.productToEdit;
    setForm(product ? {
      productType: product.productType || 'INVENTORY', sector: product.sector || defaultSector, category: product.category, name: product.name, sku: product.sku,
      barcode: product.barcode || '', description: product.description || '', costPrice: String(product.costPrice), sellingPrice: String(product.sellingPrice), quantity: '',
      location: product.location || '', shelfCode: product.shelfCode || product.shelf || '', binCode: product.binCode || product.bin || '', unitOfMeasure: product.unitOfMeasure || product.unit || '',
      size: product.size || '', alternativeLookupCode: product.alternativeLookupCode || '', hsCode: product.hsCode || '', taxOption: product.taxOption || 'STANDARD_RATED', reorderLevel: String(product.reorderLevel),
      primarySupplierName: product.primarySupplierName || '', brand: product.brand || '', manufacturer: product.manufacturer || '', status: product.status || 'active', sectorAttributes: product.sectorAttributes || {}, branchPrices: Object.fromEntries(Object.entries(product.branchPrices || {}).map(([branchId, price]) => [branchId, String(price)])),
    } : emptyForm(defaultSector));
    setSectorOpen(Boolean(product && Object.keys(product.sectorAttributes || {}).length) || Boolean(product?.sector && product.sector !== 'GENERAL'));
    setError(''); setDuplicateMatches([]); setDuplicateReason(''); setHasHistory(false);
    if (product && props.isOpen) void inspectProductUsage(props.vendorId, product.id).then(usage => setHasHistory(usage.references.length > 0 || usage.stockByLocation.some(item => item.quantity !== 0))).catch(() => setHasHistory(true));
  }, [defaultSector, props.isOpen, props.productToEdit, props.vendorId]);

  const sectorFields = SECTOR_ATTRIBUTE_FIELDS[form.sector];
  const changeSector = (sector: ProductSector) => { update('sector', sector); if (sector !== 'GENERAL') setSectorOpen(true); };
  const selectedLocation = locations.find(location => `${location.type}:${location.id}` === form.location);

  const persist = async (overrideReason?: string) => {
    if (!form.sku.trim() || !form.name.trim() || !form.category.trim() || !form.unitOfMeasure.trim()) throw new Error('Product Type, Industrial Sector, Category, Product Name, SKU and Unit of Measure are required.');
    const hsError = validateHsCode(form.hsCode); if (hsError) throw new Error(hsError);
    const quantity = form.quantity.trim() === '' ? 0 : Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Opening Quantity must be blank, zero or a positive number.');
    const branchPriceEntries = Object.entries(form.branchPrices) as [string, string][];
    const invalidBranchPrice = branchPriceEntries.find(([, value]) => value.trim() !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0));
    if (invalidBranchPrice) throw new Error('Branch price overrides must be zero or positive numbers.');
    if (quantity > 0 && (!selectedLocation || isService || !['INVENTORY', 'BOM'].includes(form.productType))) throw new Error('A valid stock location is required for a positive opening Quantity on an inventory-capable product.');
    const proposedCost = Number(form.costPrice || 0);
    if (props.productToEdit && requiresBelowAverageCostApproval(proposedCost, props.averageCost || 0) && proposedCost !== props.productToEdit.costPrice) {
      await requestBelowAverageCostChange(props.vendorId, props.productToEdit, proposedCost, props.averageCost, { id: props.activeStaff.id, name: props.activeStaff.name, role: props.activeStaff.role });
      await props.onSuccess(); props.onClose();
      alert(`Cost change sent to management because ${proposedCost.toFixed(2)} is below average stock cost ${props.averageCost.toFixed(2)}. The current cost remains unchanged until approval.`);
      return;
    }
    const product = await saveProduct(props.vendorId, {
      id: props.productToEdit?.id, createdAt: props.productToEdit?.createdAt, productType: form.productType, sector: form.sector, category: form.category.trim(), name: form.name.trim(), sku: form.sku.trim(), barcode: form.barcode.trim() || undefined,
      description: form.description.trim(), costPrice: Number(form.costPrice || 0), sellingPrice: Number(form.sellingPrice || 0), branchPrices: Object.fromEntries(branchPriceEntries.filter(([, price]) => price.trim() !== '').map(([branchId, price]) => [branchId, Number(price)])), location: isService ? undefined : selectedLocation?.code,
      shelfCode: isService ? undefined : form.shelfCode.trim() || undefined, binCode: isService ? undefined : form.binCode.trim() || undefined, unitOfMeasure: form.unitOfMeasure.trim(), unit: form.unitOfMeasure.trim(), size: form.size.trim() || undefined,
      alternativeLookupCode: form.alternativeLookupCode.trim() || undefined, hsCode: form.hsCode, taxOption: form.taxOption, applicableTaxRate: effectiveProductTaxRate(form.taxOption, props.vendorTaxRate), reorderLevel: Number(form.reorderLevel || 0),
      primarySupplierName: form.primarySupplierName.trim() || undefined, brand: form.brand.trim() || undefined, manufacturer: form.manufacturer.trim() || undefined,
      sectorAttributes: sanitizeSectorAttributes(form.sector, form.sectorAttributes), status: form.status,
    }, { actor: { id: props.activeStaff.id, name: props.activeStaff.name, role: props.activeStaff.role }, vendorTaxRate: props.vendorTaxRate, duplicateDecision: overrideReason ? { actorId: props.activeStaff.id, decision: 'CONTINUE_SEPARATE', reason: overrideReason } : undefined });
    if (!props.productToEdit && quantity > 0 && selectedLocation) await props.onOpeningBalanceRequest(product, quantity, selectedLocation, `product-opening:${product.id}:${selectedLocation.type}:${selectedLocation.id}`);
    await props.onSuccess(); props.onClose();
  };

  const submit = async (event: React.FormEvent) => { event.preventDefault(); setIsSubmitting(true); setError(''); try { await persist(); } catch (caught) { if (caught instanceof ProductDuplicateError) setDuplicateMatches(caught.matches); else setError(caught instanceof Error ? caught.message : 'Failed to save product.'); } finally { setIsSubmitting(false); } };

  const fieldClass = 'w-full border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#FF6600] outline-none';
  const Input = ({ label, value, onChange, type = 'text', disabled = false, required = false }: { key?: React.Key; label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean; required?: boolean }) => <label className="block"><span className="block text-xs font-black mb-1">{label}{required && <span className="text-[#FF6600]"> *</span>}</span><input aria-label={label} type={type} min={type === 'number' ? 0 : undefined} value={value} disabled={disabled} required={required} onChange={event => onChange(event.target.value)} className={`${fieldClass} disabled:bg-slate-100`} /></label>;

  return <Modal isOpen={props.isOpen} onClose={props.onClose} title={props.productToEdit ? 'Edit Catalog Product' : 'Add New Product'} subtitle="Canonical product master and controlled opening setup" maxWidth="4xl">
    <form onSubmit={submit} className="space-y-5">
      {error && <div className="border border-red-300 bg-red-50 p-3 text-red-800 text-sm">{error}</div>}
      <Section title="Core Product Details"><div className="grid sm:grid-cols-2 gap-4">
        <label><span className="block text-xs font-black mb-1">Product Type *</span><select aria-label="Product Type" value={form.productType} onChange={event => update('productType', event.target.value as ProductType)} className={fieldClass}>{['INVENTORY', 'NON_INVENTORY', 'SERVICE', 'BOM', 'OTHER'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span className="block text-xs font-black mb-1">Industrial Sector *</span><select aria-label="Industrial Sector" value={form.sector} onChange={event => changeSector(event.target.value as ProductSector)} className={fieldClass}>{PRODUCT_SECTORS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <Input label="Category" required value={form.category} onChange={value => update('category', value)} /><Input label="Product Name" required value={form.name} onChange={value => update('name', value)} />
        <Input label="SKU" required value={form.sku} onChange={value => update('sku', value)} /><Input label="Barcode / EAN" value={form.barcode} onChange={value => update('barcode', value)} />
        <label className="sm:col-span-2"><span className="block text-xs font-black mb-1">Description</span><textarea aria-label="Description" value={form.description} onChange={event => update('description', event.target.value)} className={fieldClass} /></label>
      </div></Section>
      <Section title="Pricing"><div className="grid sm:grid-cols-2 gap-4"><div><Input label="Supplier Cost Price" type="number" value={form.costPrice} onChange={value => update('costPrice', value)} />{props.productToEdit && <p className={`mt-1 text-xs font-bold ${Number(form.costPrice) < (props.averageCost || 0) ? 'text-red-600' : 'text-slate-500'}`}>Average cost in stock: {(props.averageCost ?? props.productToEdit.costPrice).toFixed(2)}{Number(form.costPrice) < (props.averageCost || 0) ? ' · Management approval required' : ''}</p>}</div><Input label="Base Retail Selling Price" type="number" value={form.sellingPrice} onChange={value => update('sellingPrice', value)} /></div>{props.branches.length > 0 && <div className="mt-4 border-t pt-3"><h4 className="text-xs font-black">Optional Branch Price Overrides</h4><p className="text-xs text-slate-500 mb-3">Leave blank to use the base retail price.</p><div className="grid sm:grid-cols-2 gap-3">{props.branches.map(branch => <Input key={branch.id} label={`${branch.code} · ${branch.name}`} type="number" value={form.branchPrices[branch.id] || ''} onChange={value => update('branchPrices', { ...form.branchPrices, [branch.id]: value })} />)}</div></div>}</Section>
      <Section title="Inventory Setup"><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {!isService && !props.productToEdit && <Input label="Quantity — Optional" type="number" value={form.quantity} onChange={value => update('quantity', value)} />}
        {!isService && <label><span className="block text-xs font-black mb-1">Stock Location</span><select aria-label="Stock Location" value={form.location} onChange={event => update('location', event.target.value)} className={fieldClass}><option value="">Select location</option>{locations.map(location => <option key={`${location.type}:${location.id}`} value={`${location.type}:${location.id}`}>{location.type === 'warehouse' ? 'Warehouse' : 'Branch'} · {location.code} · {location.name}</option>)}</select></label>}
        {!isService && <Input label="Shelf" value={form.shelfCode} onChange={value => update('shelfCode', value)} />} {!isService && <Input label="Bin" value={form.binCode} onChange={value => update('binCode', value)} />}
        <Input label="Unit of Measure" required value={form.unitOfMeasure} onChange={value => update('unitOfMeasure', value)} />
      </div>{props.productToEdit && <div className="mt-3 border border-amber-300 bg-amber-50 p-3 text-sm"><p>Quantity cannot be changed from Product Details after inventory history exists. Use Stock Adjustment.</p><button type="button" onClick={() => props.productToEdit && props.onOpenStockAdjustment?.(props.productToEdit)} className="mt-2 font-black text-[#FF6600] flex gap-1"><ExternalLink className="w-4" />Open Stock Adjustment</button>{!hasHistory && <p className="text-xs text-slate-500 mt-1">Opening Quantity is available only during new product creation.</p>}</div>}</Section>
      <Section title="Additional Identification"><div className="grid sm:grid-cols-2 gap-4"><Input label="Size" value={form.size} onChange={value => update('size', value)} /><Input label="Alternative Look Up" value={form.alternativeLookupCode} onChange={value => update('alternativeLookupCode', value)} /></div></Section>
      <Section title="Tax and Classification"><div className="grid sm:grid-cols-2 gap-4">
        <Input label="HS Code" value={form.hsCode} disabled={!hasExtendedProductPermission(props.activeStaff.role, 'product.hs_code.edit')} onChange={value => update('hsCode', value)} />
        <label><span className="block text-xs font-black mb-1">Tax Option</span><select aria-label="Tax Option" value={form.taxOption} disabled={!hasExtendedProductPermission(props.activeStaff.role, 'product.tax.edit')} onChange={event => update('taxOption', event.target.value as TaxOption)} className={fieldClass}>{TAX_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span className="text-xs text-slate-500">Effective rate: {effectiveProductTaxRate(form.taxOption, props.vendorTaxRate)}%</span></label>
      </div></Section>
      <Section title="Replenishment and Source"><div className="grid sm:grid-cols-2 gap-4"><Input label="Reorder Quantity" type="number" value={form.reorderLevel} onChange={value => update('reorderLevel', value)} /><Input label="Primary Supplier" value={form.primarySupplierName} onChange={value => update('primarySupplierName', value)} /><Input label="Brand" value={form.brand} onChange={value => update('brand', value)} /><Input label="Manufacturer" value={form.manufacturer} onChange={value => update('manufacturer', value)} /></div></Section>
      <section className="border border-slate-300"><button type="button" aria-expanded={sectorOpen} onClick={() => setSectorOpen(!sectorOpen)} className="w-full p-3 bg-slate-100 flex items-center justify-between font-black"><span>Sector-Specific Details · {PRODUCT_SECTORS.find(option => option.value === form.sector)?.label}</span>{sectorOpen ? <ChevronDown className="w-4" /> : <ChevronRight className="w-4" />}</button>{sectorOpen && <div className="p-4 grid sm:grid-cols-2 gap-4">{sectorFields.map(field => BOOLEAN_SECTOR_FIELDS.has(field) ? <label key={field} className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form.sectorAttributes[field])} onChange={event => update('sectorAttributes', { ...form.sectorAttributes, [field]: event.target.checked })} />{labelFor(field)}</label> : <Input key={field} label={labelFor(field)} value={String(form.sectorAttributes[field] || '')} onChange={value => update('sectorAttributes', { ...form.sectorAttributes, [field]: value })} />)}</div>}</section>
      {props.productToEdit && <label><span className="block text-xs font-black mb-1">Product Status</span><select aria-label="Product Status" value={form.status} onChange={event => update('status', event.target.value as 'active' | 'archived')} className={fieldClass}><option value="active">Active</option><option value="archived">Archived</option></select></label>}
      <div className="flex justify-end gap-2 border-t pt-4"><button type="button" onClick={props.onClose} className="border px-5 py-2 font-bold">Cancel</button><button type="submit" disabled={isSubmitting} className="bg-[#FF6600] text-white px-6 py-2 font-black disabled:opacity-50">{isSubmitting ? 'Saving…' : props.productToEdit ? 'Update Product' : 'Add Product'}</button></div>
    </form>
    {duplicateMatches.length > 0 && <div role="dialog" aria-modal="true" aria-label="Possible Duplicate Product Detected" className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"><div className="bg-white border-t-4 border-[#FF6600] max-w-3xl w-full p-5 shadow-2xl"><h2 className="font-black text-lg flex gap-2"><ShieldAlert className="w-5 text-[#FF6600]" />Possible Duplicate Product Detected</h2><div className="grid md:grid-cols-2 gap-4 mt-4 text-sm"><Comparison title="New or edited product" product={{ ...props.productToEdit, ...form, id: props.productToEdit?.id || 'new', vendorId: props.vendorId, costPrice: Number(form.costPrice), sellingPrice: Number(form.sellingPrice), reorderLevel: Number(form.reorderLevel), createdAt: props.productToEdit?.createdAt || '' } as Product} quantity={0} /><Comparison title="Existing possible match" product={duplicateMatches[0].product} quantity={(props.warehouseStock[duplicateMatches[0].product.id] || 0) + (props.branchStock[duplicateMatches[0].product.id] || 0)} /></div><p className="mt-3 text-xs"><strong>Match reasons:</strong> {duplicateMatches[0].reasons.map(labelFor).join(', ')}</p>{!duplicateMatches.some(match => match.blocking) && <label className="block mt-3"><span className="text-xs font-black">Reason to continue as a separate product</span><textarea value={duplicateReason} onChange={event => setDuplicateReason(event.target.value)} className={fieldClass} /></label>}<div className="flex flex-wrap justify-end gap-2 mt-4"><button type="button" onClick={() => props.onUseExistingProduct?.(duplicateMatches[0].product)} className="border px-3 py-2 font-bold">View Existing Product</button><button type="button" onClick={() => { props.onUseExistingProduct?.(duplicateMatches[0].product); props.onClose(); }} className="border px-3 py-2 font-bold">Use Existing Product</button><button type="button" onClick={() => setDuplicateMatches([])} className="border px-3 py-2 font-bold">Edit New Product</button>{!duplicateMatches.some(match => match.blocking) && <button type="button" disabled={!duplicateReason.trim()} onClick={() => { setIsSubmitting(true); void persist(duplicateReason).catch(caught => setError(caught instanceof Error ? caught.message : 'Save failed.')).finally(() => setIsSubmitting(false)); }} className="bg-[#FF6600] text-white px-3 py-2 font-black disabled:opacity-40">Continue as Separate Product</button>}<button type="button" onClick={() => { setDuplicateMatches([]); props.onClose(); }} className="border px-3 py-2 font-bold">Cancel</button></div></div></div>}
  </Modal>;
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="border border-slate-300 p-4"><h2 className="font-black text-sm mb-3 border-b border-slate-200 pb-2">{title}</h2>{children}</section>;
const Comparison = ({ title, product, quantity }: { title: string; product: Product; quantity: number }) => <div className="border border-slate-300 p-3"><h3 className="font-black mb-2">{title}</h3><dl className="grid grid-cols-2 gap-1 text-xs">{[['SKU', product.sku], ['Product Name', product.name], ['Category', product.category], ['Size', product.size], ['Barcode', product.barcode], ['ALU', product.alternativeLookupCode], ['HS Code', product.hsCode], ['Product Type', product.productType], ['Sector', product.sector], ['Status', product.status], ['Current Qty', quantity]].map(([label, value]) => <React.Fragment key={String(label)}><dt className="text-slate-500">{label}</dt><dd className="font-bold">{String(value || '—')}</dd></React.Fragment>)}</dl></div>;
