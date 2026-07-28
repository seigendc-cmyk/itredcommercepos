import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CreditCard,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { Customer, CreditPayment, CreditSale, CollectionActivity } from '../../types';
import type { saveCustomer } from '../../services/db';

export type CustomerSaveInput = Parameters<typeof saveCustomer>[1];

interface CustomerManagementProps {
  vendorId: string;
  customers: Customer[];
  creditSales: CreditSale[];
  creditPayments: CreditPayment[];
  collectionActivities: CollectionActivity[];
  loading: boolean;
  error: string | null;
  onSaveCustomer: (customer: CustomerSaveInput) => Promise<void>;
  onRefresh: () => Promise<void>;
}

type DetailTab = 'summary' | 'sales' | 'payments' | 'activity';

const EMPTY_FORM: CustomerSaveInput = {
  customerCode: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  creditLimit: 0,
  creditTermsDays: 30,
  riskCategory: 'low',
  status: 'active',
  notes: '',
};

const badgeStyles = {
  status: {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    suspended: 'bg-amber-50 text-amber-700 border-amber-200',
    closed: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  risk: {
    low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    high: 'bg-red-50 text-red-700 border-red-200',
    blacklisted: 'bg-slate-900 text-white border-slate-900',
  },
};

export function filterCustomers(customers: Customer[], query: string): Customer[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return customers;
  return customers.filter(customer =>
    [customer.name, customer.phone, customer.email, customer.customerCode]
      .some(value => value?.toLowerCase().includes(normalized)),
  );
}

export function getCustomerAccountHistory(
  vendorId: string,
  customerId: string,
  creditSales: CreditSale[],
  creditPayments: CreditPayment[],
  collectionActivities: CollectionActivity[],
) {
  return {
    creditSales: creditSales.filter(item => item.vendorId === vendorId && item.customerId === customerId),
    creditPayments: creditPayments.filter(item => item.vendorId === vendorId && item.customerId === customerId),
    collectionActivities: collectionActivities.filter(item => item.vendorId === vendorId && item.customerId === customerId),
  };
}

export function normalizeCustomerSaveInput(customer: CustomerSaveInput): CustomerSaveInput {
  return {
    ...customer,
    name: customer.name.trim(),
    phone: customer.phone.trim(),
    email: customer.email?.trim(),
    customerCode: customer.customerCode.trim(),
    creditLimit: Number(customer.creditLimit),
    creditTermsDays: Number(customer.creditTermsDays),
  };
}

function formatMoney(currency: string, amount: number): string {
  return `${currency}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function CustomerManagement({
  vendorId,
  customers,
  creditSales,
  creditPayments,
  collectionActivities,
  loading,
  error,
  onSaveCustomer,
  onRefresh,
}: CustomerManagementProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(customers[0]?.id ?? null);
  const [detailTab, setDetailTab] = useState<DetailTab>('summary');
  const [editing, setEditing] = useState<CustomerSaveInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const scopedCustomers = customers.filter(customer => customer.vendorId === vendorId);
    if (selectedId && scopedCustomers.some(customer => customer.id === selectedId)) return;
    setSelectedId(scopedCustomers[0]?.id ?? null);
  }, [customers, selectedId, vendorId]);

  const vendorCustomers = useMemo(
    () => customers.filter(customer => customer.vendorId === vendorId),
    [customers, vendorId],
  );
  const visibleCustomers = useMemo(() => filterCustomers(vendorCustomers, query), [vendorCustomers, query]);
  const selected = vendorCustomers.find(customer => customer.id === selectedId) ?? null;
  const accountHistory = selectedId
    ? getCustomerAccountHistory(vendorId, selectedId, creditSales, creditPayments, collectionActivities)
    : { creditSales: [], creditPayments: [], collectionActivities: [] };
  const customerSales = accountHistory.creditSales;
  const customerPayments = accountHistory.creditPayments;
  const customerActivities = accountHistory.collectionActivities;
  const availableCredit = selected ? Math.max(0, selected.creditLimit - selected.currentBalance) : 0;

  const openEditor = (customer?: Customer) => {
    setFormError('');
    setEditing(customer ? {
      id: customer.id,
      customerCode: customer.customerCode,
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? '',
      address: customer.address ?? '',
      creditLimit: customer.creditLimit,
      currentBalance: customer.currentBalance,
      creditTermsDays: customer.creditTermsDays,
      riskCategory: customer.riskCategory,
      status: customer.status,
      notes: customer.notes ?? '',
    } : { ...EMPTY_FORM });
  };

  const submitCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !editing.name.trim() || !editing.phone.trim()) {
      setFormError('Customer name and phone are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await onSaveCustomer(normalizeCustomerSaveInput(editing));
      setEditing(null);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Unable to save customer.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-64 border border-slate-200 bg-white flex items-center justify-center text-sm font-semibold text-slate-600">Loading customers...</div>;
  }

  if (error) {
    return <div role="alert" className="min-h-64 border border-red-200 bg-red-50 flex items-center justify-center gap-2 p-6 text-sm font-semibold text-red-700"><AlertCircle className="w-5 h-5" />{error}</div>;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Customers &amp; CRM</h1>
          <p className="text-sm text-slate-500">Customer accounts, credit exposure and collection history</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void onRefresh()} className="inline-flex items-center justify-center gap-2 border border-slate-300 hover:border-[#FF6B00] text-slate-700 px-3 py-2 text-sm font-semibold rounded">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button type="button" onClick={() => openEditor()} className="inline-flex items-center justify-center gap-2 bg-[#FF6B00] hover:bg-[#e66000] text-white px-4 py-2 text-sm font-semibold rounded">
            <Plus className="w-4 h-4" /> New Customer
          </button>
        </div>
      </header>

      {vendorCustomers.length === 0 ? (
        <div className="min-h-72 border border-dashed border-slate-300 bg-white flex flex-col items-center justify-center p-8 text-center">
          <UserRound className="w-9 h-9 text-slate-400 mb-3" />
          <h2 className="font-bold text-slate-800">No customers yet</h2>
          <p className="text-sm text-slate-500 mt-1">Create the first customer account for this vendor.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] border border-slate-200 bg-white min-h-[620px]">
          <aside className="border-b lg:border-b-0 lg:border-r border-slate-200">
            <div className="p-3 border-b border-slate-200">
              <label className="relative block">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input aria-label="Search customers" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, phone, email or code" className="w-full border border-slate-300 rounded pl-9 pr-3 py-2 text-sm outline-none focus:border-[#FF6B00]" />
              </label>
            </div>
            <div className="max-h-[560px] overflow-y-auto">
              {visibleCustomers.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">No customers match this search.</p>
              ) : visibleCustomers.map(customer => (
                <button key={customer.id} type="button" onClick={() => setSelectedId(customer.id)} className={`w-full text-left p-4 border-b border-slate-100 transition ${selectedId === customer.id ? 'bg-orange-50 border-l-4 border-l-[#FF6B00]' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-sm text-slate-900">{customer.name}</span>
                    <span className={`border px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${badgeStyles.risk[customer.riskCategory]}`}>{customer.riskCategory}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{customer.customerCode} · {customer.phone}</div>
                    <div className="flex justify-between mt-2 text-xs"><span className={`border px-1.5 py-0.5 rounded font-semibold ${badgeStyles.status[customer.status]}`}>{formatLabel(customer.status)}</span><span className="font-bold text-slate-700">{formatMoney('$', customer.currentBalance)}</span></div>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0">
            {selected ? (
              <>
                <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-900">{selected.name}</h2><span className={`border px-2 py-0.5 rounded text-xs font-bold ${badgeStyles.status[selected.status]}`}>{formatLabel(selected.status)}</span><span className={`border px-2 py-0.5 rounded text-xs font-bold ${badgeStyles.risk[selected.riskCategory]}`}>{formatLabel(selected.riskCategory)} Risk</span></div>
                    <p className="text-xs font-mono text-slate-500 mt-1">{selected.customerCode}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-slate-600"><span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{selected.phone}</span>{selected.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{selected.email}</span>}</div>
                  </div>
                  <button type="button" onClick={() => openEditor(selected)} className="self-start inline-flex items-center gap-2 border border-slate-300 hover:border-[#FF6B00] px-3 py-2 rounded text-sm font-semibold text-slate-700"><Edit3 className="w-4 h-4" /> Edit</button>
                </div>

                <div className="grid grid-cols-2 xl:grid-cols-4 border-b border-slate-200">
                  {[['Outstanding', formatMoney('$', selected.currentBalance)], ['Credit limit', formatMoney('$', selected.creditLimit)], ['Available credit', formatMoney('$', availableCredit)], ['Terms', `${selected.creditTermsDays} days`]].map(([label, value]) => <div key={label} className="p-4 border-r border-b xl:border-b-0 border-slate-100 last:border-r-0"><p className="text-xs uppercase font-semibold text-slate-500">{label}</p><p className="text-lg font-bold text-slate-900 mt-1">{value}</p></div>)}
                </div>

                <div className="flex overflow-x-auto border-b border-slate-200 px-4">
                  {([['summary', 'Account Summary'], ['sales', 'Credit Sales'], ['payments', 'Payments'], ['activity', 'Activity Timeline']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setDetailTab(id)} className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 ${detailTab === id ? 'border-[#FF6B00] text-[#FF6B00]' : 'border-transparent text-slate-500'}`}>{label}</button>)}
                </div>

                <div className="p-5">
                  {detailTab === 'summary' && <div className="grid md:grid-cols-2 gap-5 text-sm"><div className="border border-slate-200 p-4"><h3 className="font-bold text-slate-800 flex items-center gap-2"><Building2 className="w-4 h-4 text-[#FF6B00]" /> Contact Details</h3><p className="mt-3 text-slate-600 flex gap-2"><MapPin className="w-4 h-4 shrink-0" />{selected.address || 'No address recorded'}</p></div><div className="border border-slate-200 p-4"><h3 className="font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-4 h-4 text-[#FF6B00]" /> Account Notes</h3><p className="mt-3 text-slate-600 whitespace-pre-wrap">{selected.notes || 'No account notes recorded.'}</p></div></div>}
                  {detailTab === 'sales' && <HistoryTable empty="No credit sales recorded for this customer." headers={['Invoice', 'Sale date', 'Due date', 'Status', 'Balance']} rows={customerSales.map(sale => [sale.invoiceNumber, sale.saleDate, sale.dueDate, formatLabel(sale.status), formatMoney('$', sale.balanceAmount)])} />}
                  {detailTab === 'payments' && <HistoryTable empty="No payments recorded for this customer." headers={['Invoice', 'Payment date', 'Method', 'Reference', 'Amount']} rows={customerPayments.map(payment => [payment.invoiceNumber, payment.paymentDate, formatLabel(payment.paymentMethod), payment.referenceNo || '—', formatMoney('$', payment.amount)])} />}
                  {detailTab === 'activity' && <div className="space-y-3">{customerActivities.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No collection activity recorded for this customer.</p> : customerActivities.map(activity => <div key={activity.id} className="border-l-2 border-[#FF6B00] pl-4 py-1"><div className="flex flex-wrap justify-between gap-2"><span className="font-bold text-sm text-slate-800">{formatLabel(activity.activityType)}</span><span className="text-xs text-slate-500">{new Date(activity.createdAt).toLocaleString()}</span></div><p className="text-sm text-slate-600 mt-1">{activity.notes}</p><p className="text-xs text-slate-500 mt-1">{activity.loggedBy} · {formatLabel(activity.status)}</p></div>)}</div>}
                </div>
              </>
            ) : <div className="h-full flex items-center justify-center p-8 text-sm text-slate-500">Select a customer to view their account.</div>}
          </section>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={editing.id ? 'Edit customer' : 'Create customer'}>
          <form onSubmit={submitCustomer} className="bg-white border border-slate-300 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded">
            <div className="flex items-center justify-between p-4 border-b border-slate-200"><h2 className="font-bold text-slate-900">{editing.id ? 'Edit Customer' : 'Create Customer'}</h2><button type="button" onClick={() => setEditing(null)} className="p-1 text-slate-500 hover:text-slate-900" aria-label="Close"><X className="w-5 h-5" /></button></div>
            <div className="grid sm:grid-cols-2 gap-4 p-5">
              <Field label="Customer name"><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} required className={fieldClass} /></Field>
              <Field label="Customer code"><input value={editing.customerCode} onChange={e => setEditing({ ...editing, customerCode: e.target.value })} placeholder="Generated if blank" className={fieldClass} /></Field>
              <Field label="Phone"><input value={editing.phone} onChange={e => setEditing({ ...editing, phone: e.target.value })} required className={fieldClass} /></Field>
              <Field label="Email"><input type="email" value={editing.email} onChange={e => setEditing({ ...editing, email: e.target.value })} className={fieldClass} /></Field>
              <Field label="Status"><select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as Customer['status'] })} className={fieldClass}><option value="active">Active</option><option value="suspended">Suspended</option><option value="closed">Closed</option></select></Field>
              <Field label="Risk category"><select value={editing.riskCategory} onChange={e => setEditing({ ...editing, riskCategory: e.target.value as Customer['riskCategory'] })} className={fieldClass}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="blacklisted">Blacklisted</option></select></Field>
              <Field label="Credit limit"><input type="number" min="0" step="0.01" value={editing.creditLimit} onChange={e => setEditing({ ...editing, creditLimit: Number(e.target.value) })} className={fieldClass} /></Field>
              <Field label="Credit terms (days)"><input type="number" min="0" value={editing.creditTermsDays} onChange={e => setEditing({ ...editing, creditTermsDays: Number(e.target.value) })} className={fieldClass} /></Field>
              <div className="sm:col-span-2"><Field label="Address"><textarea value={editing.address} onChange={e => setEditing({ ...editing, address: e.target.value })} rows={2} className={fieldClass} /></Field></div>
              <div className="sm:col-span-2"><Field label="Notes"><textarea value={editing.notes} onChange={e => setEditing({ ...editing, notes: e.target.value })} rows={3} className={fieldClass} /></Field></div>
              {formError && <p role="alert" className="sm:col-span-2 text-sm font-semibold text-red-700">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-200"><button type="button" onClick={() => setEditing(null)} className="px-4 py-2 border border-slate-300 rounded text-sm font-semibold">Cancel</button><button type="submit" disabled={saving} className="px-4 py-2 bg-[#FF6B00] text-white rounded text-sm font-semibold disabled:opacity-60">{saving ? 'Saving...' : 'Save Customer'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

const fieldClass = 'w-full border border-slate-300 rounded px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-[#FF6B00]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-700 space-y-1"><span>{label}</span>{children}</label>;
}

function HistoryTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p className="py-10 text-center text-sm text-slate-500">{empty}</p>;
  return <div className="overflow-x-auto border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{headers.map(header => <th key={header} className="text-left px-3 py-2 border-b border-slate-200">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b border-slate-100 last:border-0">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 text-slate-700 whitespace-nowrap">{cell}</td>)}</tr>)}</tbody></table></div>;
}
