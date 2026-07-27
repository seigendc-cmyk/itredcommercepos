import React, { useState } from 'react';
import { MapPin, Warehouse as WarehouseIcon } from 'lucide-react';
import { createWarehouse } from '../../services/db';
import { ResourceEntitlementError } from '../../services/resourceEntitlements';
import { Modal } from '../Common/Modal';

interface AddWarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string;
  onSuccess: () => void;
}

export const AddWarehouseModal: React.FC<AddWarehouseModalProps> = ({
  isOpen,
  onClose,
  vendorId,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await createWarehouse(
        vendorId,
        name.trim(),
        location.trim() || 'Warehouse location',
      );
      setName('');
      setLocation('');
      await onSuccess();
      onClose();
    } catch (caught: unknown) {
      setError(
        caught instanceof ResourceEntitlementError
          ? `Upgrade required: ${caught.message}`
          : caught instanceof Error
            ? caught.message
            : 'Failed to create warehouse.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Warehouse"
      subtitle="Warehouse activation is checked against the active subscription"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-900 mb-1">Warehouse name</label>
          <div className="relative">
            <WarehouseIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              required
              value={name}
              onChange={event => setName(event.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
              placeholder="e.g. North Distribution Warehouse"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-900 mb-1">Location</label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={location}
              onChange={event => setLocation(event.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
              placeholder="Street address or site name"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-slate-600">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="px-6 py-2.5 rounded-xl bg-[#FF6600] text-white text-xs font-bold disabled:opacity-50"
          >
            {isSubmitting ? 'Checking entitlement...' : 'Create Warehouse'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
