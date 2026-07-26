import React, { useState } from 'react';
import { BillingServiceAddon, VendorProfile, Branch } from '../../types';
import {
  X,
  Sparkles,
  Calendar,
  MapPin,
  CheckCircle2,
  DollarSign,
  FileText,
  Send,
  HelpCircle
} from 'lucide-react';

interface ServiceOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: BillingServiceAddon | null;
  vendor: VendorProfile | null;
  branches: Branch[];
  onRequestService: (service: BillingServiceAddon, targetBranchId: string, preferredDate: string, notes: string) => Promise<void>;
}

export const ServiceOrderModal: React.FC<ServiceOrderModalProps> = ({
  isOpen,
  onClose,
  service,
  vendor,
  branches,
  onRequestService
}) => {
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id || '');
  const [preferredDate, setPreferredDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !service) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onRequestService(service, selectedBranchId, preferredDate, notes);
      setIsSubmitting(false);
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      alert('Failed to request service. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col my-auto max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-[#1F242D] text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#FF6B00]/20 border border-[#FF6B00]/40 rounded-xl text-[#FF6B00]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-white">Book Organization Service</h3>
              <p className="text-xs text-slate-400 font-medium">Provided directly by our POS Specialist Team</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs font-medium text-slate-700">
          
          {/* Service Banner */}
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl space-y-2">
            <div className="flex justify-between items-start">
              <h4 className="font-black text-sm text-slate-900">{service.title}</h4>
              <span className="px-2.5 py-1 bg-[#FF6B00] text-white font-black rounded-lg text-xs font-mono">
                ${service.price} {service.priceType === 'monthly' ? '/ mo' : 'one-time'}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{service.description}</p>
          </div>

          {/* Deliverables List */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-900 block">Service Scope & Deliverables:</label>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
              {service.deliverables.map((deliv, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs text-slate-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{deliv}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Target Branch */}
          <div>
            <label className="text-[11px] font-bold text-slate-900 block mb-1">Target Store Branch / Location *</label>
            <select
              value={selectedBranchId}
              onChange={e => setSelectedBranchId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.address})
                </option>
              ))}
            </select>
          </div>

          {/* Preferred Date */}
          <div>
            <label className="text-[11px] font-bold text-slate-900 block mb-1">Preferred Onsite / Session Date *</label>
            <input
              type="date"
              required
              min={new Date().toISOString().slice(0, 10)}
              value={preferredDate}
              onChange={e => setPreferredDate(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none"
            />
          </div>

          {/* Special Notes */}
          <div>
            <label className="text-[11px] font-bold text-slate-900 block mb-1">Special Instructions or Hardware Notes</label>
            <textarea
              rows={2}
              placeholder="e.g. Need after-hours stocktake at 8:00 PM; printer model EPSON TM-T20III..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:outline-none"
            />
          </div>

          {/* Notice */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] flex gap-2">
            <FileText className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              Submitting this service order automatically generates an official service invoice for <strong>${service.price}</strong>. Our specialist team will contact you within 2 hours to confirm scheduling.
            </p>
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-[#FF6B00] hover:bg-[#e66000] text-white font-black rounded-xl text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Generating Invoice...' : `Order Service ($${service.price})`}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
