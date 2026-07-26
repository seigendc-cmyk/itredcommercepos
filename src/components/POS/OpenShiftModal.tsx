import React, { useState } from 'react';
import { Modal } from '../Common/Modal';
import { VendorProfile, Branch, Terminal, StaffMember } from '../../types';
import { KeyRound, DollarSign, Store, Clock, ArrowRight, ShieldCheck } from 'lucide-react';

interface OpenShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: VendorProfile;
  activeBranch: Branch | null;
  activeTerminal: Terminal | null;
  activeStaff: StaffMember | null;
  onConfirmOpenShift: (openingCash: number, openingNotes?: string) => Promise<void>;
}

export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({
  isOpen,
  onClose,
  vendor,
  activeBranch,
  activeTerminal,
  activeStaff,
  onConfirmOpenShift
}) => {
  const [openingCash, setOpeningCash] = useState<string>('100.00');
  const [notes, setNotes] = useState<string>('Standard morning register float.');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(openingCash);
    if (isNaN(val) || val < 0) {
      alert('Please enter a valid non-negative opening cash amount.');
      return;
    }

    setLoading(true);
    try {
      await onConfirmOpenShift(val, notes);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to open shift. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const quickFloatOptions = [50, 100, 150, 200];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Open Terminal Register Shift"
      subtitle="Initialize cash drawer float before taking customer payments"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        
        {/* Terminal Info Badge */}
        <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-[#FF6B00]" />
              <span className="font-bold text-xs">{activeBranch?.name || 'Main Branch'}</span>
            </div>
            <span className="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300">
              {activeTerminal?.name || 'Terminal 01'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Cashier: <strong>{activeStaff?.name || 'Authorized Staff'}</strong> ({activeStaff?.role.toUpperCase()})
            </span>
            <span className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
              <Clock className="w-3 h-3" />
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {/* Opening Cash Input */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700">
            Opening Cash Float (In Cash Drawer) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-base">
              {vendor.currency || '$'}
            </div>
            <input
              type="number"
              step="0.01"
              required
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="100.00"
              className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none transition-all"
            />
          </div>

          {/* Quick Float Shortcuts */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-slate-500 font-medium">Quick Float:</span>
            {quickFloatOptions.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setOpeningCash(amount.toFixed(2))}
                className="px-2.5 py-1 bg-slate-100 hover:bg-orange-50 hover:text-[#FF6B00] hover:border-orange-200 border border-slate-200 text-xs font-bold rounded-lg transition-all cursor-pointer"
              >
                ${amount}
              </button>
            ))}
          </div>
        </div>

        {/* Opening Shift Notes */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">Opening Shift Notes (Optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Standard morning shift start change float"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-1 focus:ring-[#FF6B00] focus:outline-none"
          />
        </div>

        {/* Submit Action */}
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
            className="px-6 py-3 bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 disabled:opacity-50"
          >
            <span>{loading ? 'Opening Register...' : 'Confirm & Start Shift'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </form>
    </Modal>
  );
};
