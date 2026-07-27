import React, { useState, useEffect } from 'react';
import { BillingPlan } from '../../types';
import { getBaseResourceAllowance } from '../../services/resourceEntitlements';
import {
  X,
  Plus,
  Trash2,
  Save,
  Sliders,
  Sparkles,
  Layers,
  Calendar,
  DollarSign,
  Store,
  Users
} from 'lucide-react';

interface ConsolePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingPlan: BillingPlan | null;
  onSavePlan: (plan: BillingPlan) => Promise<void>;
}

export const ConsolePlanModal: React.FC<ConsolePlanModalProps> = ({
  isOpen,
  onClose,
  editingPlan,
  onSavePlan
}) => {
  const [name, setName] = useState('');
  const [priceMonthly, setPriceMonthly] = useState<number>(49);
  const [billingPeriodMonths, setBillingPeriodMonths] = useState<number>(1);
  const [currency, setCurrency] = useState('$');
  const [description, setDescription] = useState('');
  const [features, setFeatures] = useState<string[]>([]);
  const [newFeatureText, setNewFeatureText] = useState('');
  const [maxWarehouses, setMaxWarehouses] = useState<number>(1);
  const [maxBranches, setMaxBranches] = useState<number>(3);
  const [maxTerminals, setMaxTerminals] = useState<number>(3);
  const [maxStaff, setMaxStaff] = useState<number>(10);
  const [isPopular, setIsPopular] = useState(false);
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (editingPlan) {
      setName(editingPlan.name);
      setPriceMonthly(editingPlan.priceMonthly);
      setBillingPeriodMonths(editingPlan.billingPeriodMonths || 1);
      setCurrency(editingPlan.currency || '$');
      setDescription(editingPlan.description);
      setFeatures(editingPlan.features || []);
      setMaxWarehouses(getBaseResourceAllowance(editingPlan, 'warehouse'));
      setMaxBranches(editingPlan.maxBranches);
      setMaxTerminals(getBaseResourceAllowance(editingPlan, 'terminal'));
      setMaxStaff(editingPlan.maxStaff);
      setIsPopular(!!editingPlan.isPopular);
      setStatus(editingPlan.status);
    } else {
      setName('');
      setPriceMonthly(49);
      setBillingPeriodMonths(1);
      setCurrency('$');
      setDescription('');
      setFeatures([
        'Up to 3 Active Branches',
        'Unlimited POS Terminals',
        '7-Day Advance Auto-Invoicing'
      ]);
      setMaxWarehouses(1);
      setMaxBranches(3);
      setMaxTerminals(3);
      setMaxStaff(10);
      setIsPopular(false);
      setStatus('active');
    }
  }, [editingPlan, isOpen]);

  if (!isOpen) return null;

  const handleAddFeature = () => {
    if (!newFeatureText.trim()) return;
    setFeatures([...features, newFeatureText.trim()]);
    setNewFeatureText('');
  };

  const handleRemoveFeature = (index: number) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Plan name is required');
      return;
    }

    setIsSaving(true);
    try {
      const planToSave: BillingPlan = {
        id: editingPlan?.id || `plan_${Date.now()}`,
        name: name.trim(),
        priceMonthly: Number(priceMonthly),
        billingPeriodMonths: Number(billingPeriodMonths),
        currency,
        description: description.trim(),
        features,
        maxWarehouses: Number(maxWarehouses),
        maxBranches: Number(maxBranches),
        maxTerminals: Number(maxTerminals),
        maxStaff: Number(maxStaff),
        isPopular,
        status,
        createdAt: editingPlan?.createdAt || new Date().toISOString()
      };

      await onSavePlan(planToSave);
      setIsSaving(false);
      onClose();
    } catch (err) {
      setIsSaving(false);
      alert('Failed to save plan in console.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-[#1F242D] text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#FF6B00]/20 border border-[#FF6B00]/40 rounded-xl text-[#FF6B00]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-white">
                {editingPlan ? `Edit Console Plan: ${editingPlan.name}` : 'Create New Subscription Plan'}
              </h3>
              <p className="text-xs text-slate-400 font-medium">Platform Console Admin Control Panel</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs font-medium text-slate-700">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-900 block mb-1">Plan Title / Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Pro Commerce POS"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-900 block mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as 'active' | 'archived')}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none"
              >
                <option value="active">Active (Visible to Vendors)</option>
                <option value="archived">Archived (Hidden)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-900 block mb-1">Monthly Price ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={priceMonthly}
                  onChange={e => setPriceMonthly(Number(e.target.value))}
                  className="w-full pl-7 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-900 block mb-1">Expiry Period (Months)</label>
              <select
                value={billingPeriodMonths}
                onChange={e => setBillingPeriodMonths(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none"
              >
                <option value={1}>1 Month (Monthly)</option>
                <option value={3}>3 Months (Quarterly)</option>
                <option value={6}>6 Months (Semi-Annual)</option>
                <option value={12}>12 Months (Annual)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-900 block mb-1">Popular Badge?</label>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPopular}
                  onChange={e => setIsPopular(e.target.checked)}
                  className="w-4 h-4 text-[#FF6B00] rounded focus:ring-[#FF6B00]"
                />
                <span className="text-xs font-bold text-slate-800">Highlight Badge</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-900 block mb-1">Plan Description</label>
            <textarea
              rows={2}
              placeholder="Short summary of what this plan includes..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-900 block mb-1">Max Warehouses</label>
              <input
                type="number"
                min="1"
                max="999"
                value={maxWarehouses}
                onChange={e => setMaxWarehouses(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-900 block mb-1">Max Branches Limit</label>
              <input
                type="number"
                min="1"
                max="999"
                value={maxBranches}
                onChange={e => setMaxBranches(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-900 block mb-1">Max POS Terminals</label>
              <input
                type="number"
                min="1"
                max="999"
                value={maxTerminals}
                onChange={e => setMaxTerminals(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-900 block mb-1">Max Staff Limit</label>
              <input
                type="number"
                min="1"
                max="999"
                value={maxStaff}
                onChange={e => setMaxStaff(Number(e.target.value))}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none"
              />
            </div>
          </div>

          {/* Features Bullets Manager */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="text-[11px] font-bold text-slate-900 block">Plan Feature List Bullet Points</label>
            
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 7-Day advance auto-invoice generation"
                value={newFeatureText}
                onChange={e => setNewFeatureText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddFeature();
                  }
                }}
                className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddFeature}
                className="px-3 py-2 bg-[#FF6B00] text-white font-bold rounded-xl text-xs hover:bg-[#e66000] transition-all flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1">
              {features.map((feat, idx) => (
                <div key={idx} className="p-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-800">• {feat}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFeature(idx)}
                    className="p-1 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-[#FF6B00] hover:bg-[#e66000] text-white font-black rounded-xl text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving Plan...' : 'Save Console Plan'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
