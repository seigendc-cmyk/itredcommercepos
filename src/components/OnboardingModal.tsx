import React, { useState } from 'react';
import { Building2, MapPin, Phone, Store, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { onboardVendor } from '../services/db';
import { VendorProfile } from '../types';
import { Button, Field, Notice, Surface } from './Common/ui';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--itred-color-charcoal)]/80 p-3 backdrop-blur-sm sm:p-5">
      {/* Floating High Density Onboarding Modal */}
      <Surface className="w-[520px] max-w-full overflow-hidden border-t-4 border-t-[var(--itred-color-primary)] shadow-[var(--itred-shadow-floating)]">
        
        {/* Header Area */}
        <div className="border-b border-[var(--itred-color-border)] p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-[var(--itred-radius-sm)] bg-[var(--itred-color-primary)] text-base font-bold text-white">
                iT
              </div>
              <div>
                <h1 className="text-xl font-bold text-[var(--itred-color-charcoal)] sm:text-2xl">Business onboarding</h1>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-[var(--itred-radius-sm)] border border-green-200 bg-green-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-green-700">
              <ShieldCheck className="w-3 h-3" /> Authenticated
            </span>
          </div>

          <p className="text-sm text-[var(--itred-color-text-muted)]">
            Welcome, <span className="font-semibold text-[var(--itred-color-text)]">{userEmail}</span>. Complete your profile to access the POS terminal.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-5 bg-white p-5 sm:p-6">
          <Notice className="flex items-start gap-2.5 text-xs">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--itred-color-primary)]" />
            <div>
              <p className="font-bold text-[var(--itred-color-text)]">Automatic setup provisioning</p>
              <p className="mt-0.5 text-[11px] text-[var(--itred-color-text-muted)]">
                Upon saving, 1 Central Warehouse, 1 Main Branch, and 1 POS Terminal will be created automatically.
              </p>
            </div>
          </Notice>

          {error && (
            <Notice tone="error">{error}</Notice>
          )}

          <div className="space-y-4">
            <Field label="Business name" type="text" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. iTred Commerce" />
            <Field label="Physical address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Commerce Avenue, Tech District" />
            <Field label="Phone number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+263 00 000 0000" />
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[10px] text-gray-400 leading-tight">
              Default entities (Warehouse, Branch, Terminal) <br />will be created automatically.
            </div>
            <Button
              type="submit"
              loading={isSubmitting}
              className="w-full sm:w-auto"
            >
              {!isSubmitting && (
                <>
                  <span>Complete Setup</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
              {isSubmitting && <span>Setting up...</span>}
            </Button>
          </div>
        </form>

        <div className="flex justify-center border-t border-[var(--itred-color-border)] bg-[var(--itred-color-surface-subtle)] p-3">
          <p className="text-[10px] text-gray-400 italic">Securely connected to iTred Firebase Environment</p>
        </div>
      </Surface>
    </div>
  );
};
