import React, { useState } from 'react';
import { Modal } from '../Common/Modal';
import { Branch } from '../../types';
import { createBranch, createTerminal } from '../../services/db';
import { Store, Tv2, MapPin, Phone } from 'lucide-react';

interface AddBranchTerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string;
  branches: Branch[];
  onSuccess: () => void;
}

export const AddBranchTerminalModal: React.FC<AddBranchTerminalModalProps> = ({
  isOpen,
  onClose,
  vendorId,
  branches,
  onSuccess
}) => {
  const [mode, setMode] = useState<'branch' | 'terminal'>('branch');
  
  // Branch fields
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');

  // Terminal fields
  const [targetBranchId, setTargetBranchId] = useState(branches[0]?.id || '');
  const [terminalName, setTerminalName] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (mode === 'branch') {
        if (!branchName.trim()) {
          setError('Please enter a branch name.');
          setIsSubmitting(false);
          return;
        }
        await createBranch(
          vendorId,
          branchName.trim(),
          branchAddress.trim() || 'Retail Address',
          branchPhone.trim() || 'N/A'
        );
      } else {
        if (!terminalName.trim()) {
          setError('Please enter a terminal name.');
          setIsSubmitting(false);
          return;
        }
        await createTerminal(
          vendorId,
          targetBranchId || branches[0]?.id,
          terminalName.trim()
        );
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create entity.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'branch' ? 'Add New Retail Branch' : 'Add New POS Terminal'}
      subtitle="Expand your retail footprint under iTred POS"
      maxWidth="lg"
    >
      {/* Mode Switcher */}
      <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
        <button
          type="button"
          onClick={() => setMode('branch')}
          className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            mode === 'branch' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Store className="w-4 h-4 text-[#FF6600]" />
          New Branch
        </button>
        <button
          type="button"
          onClick={() => setMode('terminal')}
          className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            mode === 'terminal' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Tv2 className="w-4 h-4 text-[#FF6600]" />
          New Terminal
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl font-medium">
            {error}
          </div>
        )}

        {mode === 'branch' ? (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">
                Branch Name <span className="text-[#FF6600]">*</span>
              </label>
              <input
                type="text"
                required
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g. Downtown Outlet Branch"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">
                Branch Address
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                  placeholder="e.g. 450 Grand Ave, Floor 1"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">
                Branch Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={branchPhone}
                  onChange={(e) => setBranchPhone(e.target.value)}
                  placeholder="e.g. +1 (555) 302-8821"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">
                Assign to Retail Branch <span className="text-[#FF6600]">*</span>
              </label>
              <select
                value={targetBranchId}
                onChange={(e) => setTargetBranchId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">
                Terminal Name / Counter ID <span className="text-[#FF6600]">*</span>
              </label>
              <input
                type="text"
                required
                value={terminalName}
                onChange={(e) => setTerminalName(e.target.value)}
                placeholder="e.g. Terminal 02 / Express Register"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
              />
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-bold rounded-xl text-xs sm:text-sm shadow-md transition-all cursor-pointer"
          >
            {isSubmitting ? 'Saving...' : mode === 'branch' ? 'Create Branch' : 'Create Terminal'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
