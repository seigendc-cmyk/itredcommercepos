import React, { useState } from 'react';
import { Building2, MapPin, Phone, Store, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { onboardVendor } from '../services/db';
import { VendorProfile } from '../types';

interface OnboardingModalProps {
  isOpen: boolean;
  userEmail: string;
  vendorId: string;
  onComplete: (profile: VendorProfile) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  userEmail,
  vendorId,
  onComplete
}) => {
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setError('Please enter your business or store name.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const { profile } = await onboardVendor(vendorId, userEmail, {
        businessName: businessName.trim(),
        address: address.trim() || 'Headquarters Address',
        phone: phone.trim() || 'N/A'
      });
      onComplete(profile);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to complete onboarding. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#333333]/80 backdrop-blur-sm">
      {/* Floating High Density Onboarding Modal */}
      <div className="w-[520px] max-w-full bg-white rounded-xl shadow-2xl overflow-hidden border-t-8 border-[#FF6B00]">
        
        {/* Header Area */}
        <div className="p-6 sm:p-8 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#FF6B00] rounded flex items-center justify-center font-bold text-white text-base shadow">
                iT
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#333333]">Business Onboarding</h2>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 bg-green-50 text-green-600 rounded uppercase tracking-wider border border-green-200">
              <ShieldCheck className="w-3 h-3" /> Authenticated
            </span>
          </div>

          <p className="text-sm text-gray-500">
            Welcome, <span className="font-semibold text-[#333333]">{userEmail}</span>. Please complete your profile to access the POS terminal.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5 bg-white">
          <div className="p-3 bg-orange-50 border border-orange-200/80 rounded-lg text-xs text-slate-800 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#FF6B00] shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[#333333]">Automatic Setup Provisioning</p>
              <p className="mt-0.5 text-gray-600 text-[11px]">
                Upon saving, 1 Central Warehouse, 1 Main Branch, and 1 POS Terminal will be created automatically.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs font-medium">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Business Name <span className="text-[#FF6B00]">*</span>
              </label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. iTred Commerce"
                className="w-full px-4 py-3 rounded border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/20 focus:border-[#FF6B00]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Physical Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Commerce Avenue, Tech District"
                className="w-full px-4 py-3 rounded border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/20 focus:border-[#FF6B00]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full px-4 py-3 rounded border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/20 focus:border-[#FF6B00]"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between gap-4">
            <div className="text-[10px] text-gray-400 leading-tight">
              Default entities (Warehouse, Branch, Terminal) <br />will be created automatically.
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#FF6B00] text-white px-8 py-3 rounded-lg font-bold text-sm hover:bg-[#e66000] shadow-lg shadow-[#FF6B00]/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Setting up...</span>
              ) : (
                <>
                  <span>Complete Setup</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-center">
          <p className="text-[10px] text-gray-400 italic">Securely connected to iTred Firebase Environment</p>
        </div>
      </div>
    </div>
  );
};
