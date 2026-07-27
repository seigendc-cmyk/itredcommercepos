import React, { useEffect, useMemo, useState } from 'react';
import { Product, ProductLedgerEntry, Warehouse } from '../../types';
import { fetchProductLedger } from '../../services/db';
import { Modal } from '../Common/Modal';

interface ProductLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string;
  warehouse: Warehouse | undefined;
  product: Product | null;
}

function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function movementCategory(type: string): 'receipts' | 'transfersIn' | 'transfersOut' | 'sales' | 'returns' | 'adjustments' {
  const normalized = type.toLowerCase();
  if (normalized.includes('receipt')) return 'receipts';
  if (normalized.includes('transfer_in')) return 'transfersIn';
  if (normalized.includes('transfer_out')) return 'transfersOut';
  if (normalized.includes('sale')) return 'sales';
  if (normalized.includes('return')) return 'returns';
  return 'adjustments';
}

export const ProductLedgerModal: React.FC<ProductLedgerModalProps> = ({
  isOpen,
  onClose,
  vendorId,
  warehouse,
  product,
}) => {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [fromDate, setFromDate] = useState(dateInputValue(monthStart));
  const [toDate, setToDate] = useState(dateInputValue(today));
  const [entries, setEntries] = useState<ProductLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !warehouse || !product) return;
    setLoading(true);
    setError('');
    void fetchProductLedger(vendorId, warehouse.id, product.id)
      .then(setEntries)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Unable to load the product ledger.');
      })
      .finally(() => setLoading(false));
  }, [isOpen, product, vendorId, warehouse]);

  const periodEntries = useMemo(() => {
    const from = new Date(`${fromDate}T00:00:00`).getTime();
    const to = new Date(`${toDate}T23:59:59.999`).getTime();
    return entries.filter(entry => {
      const timestamp = new Date(entry.createdAt).getTime();
      return timestamp >= from && timestamp <= to;
    });
  }, [entries, fromDate, toDate]);

  const summary = useMemo(() => {
    const from = new Date(`${fromDate}T00:00:00`).getTime();
    const priorEntries = entries.filter(entry => new Date(entry.createdAt).getTime() < from);
    const openingBalance = priorEntries.at(-1)?.quantityAfter ??
      periodEntries[0]?.quantityBefore ??
      0;
    const totals = {
      receipts: 0,
      transfersIn: 0,
      transfersOut: 0,
      sales: 0,
      returns: 0,
      adjustments: 0,
    };
    periodEntries.forEach(entry => {
      totals[movementCategory(entry.movementType)] += entry.quantityDelta;
    });
    return {
      openingBalance,
      closingBalance: periodEntries.at(-1)?.quantityAfter ?? openingBalance,
      ...totals,
    };
  }, [entries, fromDate, periodEntries]);

  if (!product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Product Inventory Ledger"
      subtitle={`${product.sku} • ${product.name}`}
      maxWidth="4xl"
    >
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-orange-100 bg-orange-50 p-3 sm:grid-cols-3 sm:items-end">
        <label className="text-xs font-bold text-[#1F242D]">
          From
          <input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
        </label>
        <label className="text-xs font-bold text-[#1F242D]">
          To
          <input type="date" value={toDate} onChange={event => setToDate(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
        </label>
        <p className="text-xs font-semibold text-slate-600">
          {warehouse?.name || 'Warehouse'} • {periodEntries.length} movement records
        </p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Opening', summary.openingBalance],
          ['Receipts', summary.receipts],
          ['Transfers in', summary.transfersIn],
          ['Transfers out', summary.transfersOut],
          ['Sales', summary.sales],
          ['Returns', summary.returns],
          ['Adjustments', summary.adjustments],
          ['Closing', summary.closingBalance],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-black text-[#1F242D]">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="bg-[#1F242D] text-white">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Movement</th>
              <th className="p-3 text-right">Before</th>
              <th className="p-3 text-right">Change</th>
              <th className="p-3 text-right">After</th>
              <th className="p-3">Source document</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {periodEntries.map(entry => (
              <tr key={entry.id}>
                <td className="p-3">{new Date(entry.createdAt).toLocaleString()}</td>
                <td className="p-3 font-bold">{entry.movementType.replaceAll('_', ' ')}</td>
                <td className="p-3 text-right">{entry.quantityBefore}</td>
                <td className={`p-3 text-right font-bold ${entry.quantityDelta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {entry.quantityDelta >= 0 ? '+' : ''}{entry.quantityDelta}
                </td>
                <td className="p-3 text-right font-bold">{entry.quantityAfter}</td>
                <td className="p-3 font-mono text-[#FF6600]">{entry.sourceDocumentReference}</td>
              </tr>
            ))}
            {!loading && periodEntries.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">No movements in this period.</td></tr>
            )}
            {loading && (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading ledger…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};
