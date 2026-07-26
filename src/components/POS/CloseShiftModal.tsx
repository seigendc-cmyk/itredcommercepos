import React, { useState } from 'react';
import { Modal } from '../Common/Modal';
import { VendorProfile, TerminalShift } from '../../types';
import {
  DollarSign,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  ArrowRight,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Receipt
} from 'lucide-react';

interface CloseShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: VendorProfile;
  shift: TerminalShift | null;
  onConfirmCloseShift: (closingCash: number, closingNotes?: string) => Promise<TerminalShift>;
}

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({
  isOpen,
  onClose,
  vendor,
  shift,
  onConfirmCloseShift
}) => {
  if (!shift) return null;

  const currency = vendor.currency || '$';
  const expectedCash = shift.openingCash + shift.cashSales;

  const [actualCash, setActualCash] = useState<string>(expectedCash.toFixed(2));
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [showDenominations, setShowDenominations] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);

  // Denomination counts
  const [denom, setDenom] = useState<{ [key: string]: number }>({
    '100': 0,
    '50': 0,
    '20': 0,
    '10': 0,
    '5': 0,
    '1': 0,
    'coins': 0
  });

  const handleDenomChange = (key: string, count: number) => {
    const updated = { ...denom, [key]: Math.max(0, count) };
    setDenom(updated);

    const calculatedTotal =
      (updated['100'] * 100) +
      (updated['50'] * 50) +
      (updated['20'] * 20) +
      (updated['10'] * 10) +
      (updated['5'] * 5) +
      (updated['1'] * 1) +
      (updated['coins'] || 0);

    setActualCash(calculatedTotal.toFixed(2));
  };

  const actualVal = parseFloat(actualCash) || 0;
  const discrepancy = actualVal - expectedCash;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(actualVal) || actualVal < 0) {
      alert('Please enter a valid cash amount counted in drawer.');
      return;
    }

    setLoading(true);
    try {
      await onConfirmCloseShift(actualVal, closingNotes);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to close shift. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="End of Day (EOD) Shift Reconciliation"
      subtitle="Verify physical cash in register drawer against calculated shift sales"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        
        {/* Shift Financial Overview Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900 text-white p-4 rounded-xl">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Opening Float</span>
            <p className="text-sm font-black text-slate-100">{currency}{shift.openingCash.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cash Sales</span>
            <p className="text-sm font-black text-emerald-400">+{currency}{shift.cashSales.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Card / Mobile</span>
            <p className="text-sm font-black text-sky-400">+{currency}{(shift.cardSales + shift.mobileSales).toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Expected Cash</span>
            <p className="text-base font-black text-[#FF6B00]">{currency}{expectedCash.toFixed(2)}</p>
          </div>
        </div>

        {/* Sales Stats Summary Bar */}
        <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 p-3 rounded-xl">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-slate-500" />
            <span className="font-bold text-slate-700">Total Shift Gross Revenue:</span>
            <span className="font-black text-slate-900 text-sm">{currency}{shift.totalSales.toFixed(2)}</span>
          </div>
          <span className="bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded text-[11px]">
            {shift.transactionCount} Orders Processed
          </span>
        </div>

        {/* Cash Drawer Count Input */}
        <div className="bg-white border border-slate-200 p-4 rounded-2xl space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-xs font-bold text-slate-900">
                Actual Physical Cash Counted in Drawer <span className="text-red-500">*</span>
              </label>
              <p className="text-[11px] text-slate-500">Count physical bills & coins in the cash register drawer</p>
            </div>

            <button
              type="button"
              onClick={() => setShowDenominations(!showDenominations)}
              className="text-xs font-bold text-[#FF6B00] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>{showDenominations ? 'Hide Denomination Counter' : 'Denomination Calculator'}</span>
              {showDenominations ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-xl">
              {currency}
            </div>
            <input
              type="number"
              step="0.01"
              required
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xl font-black text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none transition-all"
            />
          </div>

          {/* Optional Denomination Breakdown Tool */}
          {showDenominations && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <span className="font-bold text-slate-700 block">Denomination Bill & Coin Breakdown:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: '$100 Bills', key: '100' },
                  { label: '$50 Bills', key: '50' },
                  { label: '$20 Bills', key: '20' },
                  { label: '$10 Bills', key: '10' },
                  { label: '$5 Bills', key: '5' },
                  { label: '$1 Bills', key: '1' },
                ].map((d) => (
                  <div key={d.key} className="space-y-1">
                    <span className="text-[10px] text-slate-500 font-medium">{d.label}</span>
                    <input
                      type="number"
                      min="0"
                      value={denom[d.key]}
                      onChange={(e) => handleDenomChange(d.key, parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold"
                    />
                  </div>
                ))}
                <div className="space-y-1 col-span-2">
                  <span className="text-[10px] text-slate-500 font-medium">Loose Coins ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={denom['coins']}
                    onChange={(e) => handleDenomChange('coins', parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Reconciliation Discrepancy Indicator */}
          <div className={`p-3 rounded-xl border text-xs flex items-center justify-between font-bold ${
            Math.abs(discrepancy) < 0.01
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : discrepancy < 0
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <div className="flex items-center gap-2">
              {Math.abs(discrepancy) < 0.01 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              )}
              <div>
                <p className="font-extrabold">
                  {Math.abs(discrepancy) < 0.01
                    ? 'Perfect Match (Balanced Register)'
                    : discrepancy < 0
                    ? `Cash Shortage Detected`
                    : `Cash Overage Detected`}
                </p>
                <p className="text-[11px] font-normal opacity-90">
                  Expected: {currency}{expectedCash.toFixed(2)} | Counted: {currency}{actualVal.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-mono block text-slate-500">Variance</span>
              <span className="text-base font-black">
                {discrepancy >= 0 ? '+' : ''}{currency}{discrepancy.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Closing Notes */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">Reconciliation / End-of-Day Notes</label>
          <input
            type="text"
            value={closingNotes}
            onChange={(e) => setClosingNotes(e.target.value)}
            placeholder="e.g. Regular EOD closeout. Shift balanced perfectly."
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-1 focus:ring-[#FF6B00] focus:outline-none"
          />
        </div>

        {/* Submit Actions */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-[#1F242D] hover:bg-black text-white font-bold rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 border border-slate-800"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#FF6B00]" />
            <span>{loading ? 'Closing Shift...' : 'Close Shift & Generate EOD Report'}</span>
          </button>
        </div>

      </form>
    </Modal>
  );
};
