import React, { useEffect, useState } from 'react';
import { Building2, Save } from 'lucide-react';
import { StaffMember, Supplier } from '../../types';
import { saveSupplier } from '../../services/db';
import { Modal } from '../Common/Modal';

interface Props { isOpen: boolean; onClose: () => void; vendorId: string; activeStaff: StaffMember; onCreated: (supplier: Supplier) => void; }
const empty = { name: '', code: '', fullAddress: '', phone: '', businessNumber: '', taxNumber: '' };

export function AddSupplierModal({ isOpen, onClose, vendorId, activeStaff, onCreated }: Props) {
  const [form, setForm] = useState(empty); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (isOpen) { setForm(empty); setError(''); } }, [isOpen]);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const supplier = await saveSupplier(vendorId, form, { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role }); onCreated(supplier); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create supplier.'); } finally { setBusy(false); } };
  const field = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-[#FF6600] focus:outline-none focus:ring-2 focus:ring-orange-100';
  const update = (key: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  return <Modal isOpen={isOpen} onClose={onClose} title="Add New Supplier" subtitle="Create and immediately select a purchasing supplier" maxWidth="2xl">
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs"><Building2 className="h-5 w-5 shrink-0 text-[#FF6600]"/><p>Supplier registration details are retained for purchase orders, receiving documents and tax records.</p></div>
      {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-bold">Supplier Name *<input required value={form.name} onChange={e=>update('name',e.target.value)} className={field}/></label>
        <label className="text-xs font-bold">Supplier Code <input value={form.code} onChange={e=>update('code',e.target.value)} placeholder="Auto-generated if blank" className={field}/></label>
        <label className="text-xs font-bold sm:col-span-2">Full Address *<textarea required rows={3} value={form.fullAddress} onChange={e=>update('fullAddress',e.target.value)} placeholder="Street, town/city, province/region, country" className={field}/></label>
        <label className="text-xs font-bold">Phone *<input required type="tel" value={form.phone} onChange={e=>update('phone',e.target.value)} className={field}/></label>
        <label className="text-xs font-bold">Business Number *<input required value={form.businessNumber} onChange={e=>update('businessNumber',e.target.value)} className={field}/></label>
        <label className="text-xs font-bold">Tax Number *<input required value={form.taxNumber} onChange={e=>update('taxNumber',e.target.value)} className={field}/></label>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4"><button type="button" onClick={onClose} className="rounded border px-4 py-2 text-xs font-bold">Cancel</button><button disabled={busy} className="flex items-center gap-2 rounded bg-[#FF6600] px-5 py-2 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4"/>{busy?'Creating…':'Create & Select Supplier'}</button></div>
    </form>
  </Modal>;
}
