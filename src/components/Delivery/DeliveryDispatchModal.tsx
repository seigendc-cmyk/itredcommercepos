import React, { useState, useEffect } from 'react';
import { Modal } from '../Common/Modal';
import { VendorProfile, DeliveryDispatchMessage } from '../../types';
import { fetchDeliveryDispatches, updateDispatchStatus } from '../../services/db';
import { Radio, Truck, Phone, MapPin, CheckCircle2, Clock, Send, DollarSign, PackageCheck, Navigation } from 'lucide-react';

interface DeliveryDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: VendorProfile;
}

export const DeliveryDispatchModal: React.FC<DeliveryDispatchModalProps> = ({
  isOpen,
  onClose,
  vendor
}) => {
  const [dispatches, setDispatches] = useState<DeliveryDispatchMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDispatches = async () => {
    setLoading(true);
    try {
      const data = await fetchDeliveryDispatches(vendor.id);
      setDispatches(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDispatches();
    }
  }, [isOpen, vendor.id]);

  const handleUpdateStatus = async (
    dispatchId: string, 
    status: 'dispatched' | 'collected' | 'in_transit' | 'delivered'
  ) => {
    try {
      await updateDispatchStatus(vendor.id, dispatchId, status);
      await loadDispatches();
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusBadge = (st: 'dispatched' | 'collected' | 'in_transit' | 'delivered') => {
    switch (st) {
      case 'dispatched':
        return (
          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold rounded-full flex items-center gap-1">
            <Radio className="w-3 h-3 animate-ping text-amber-500" />
            <span>Terminal Alert Dispatched</span>
          </span>
        );
      case 'collected':
        return (
          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold rounded-full flex items-center gap-1">
            <PackageCheck className="w-3 h-3 text-blue-600" />
            <span>Order Collected at Store</span>
          </span>
        );
      case 'in_transit':
        return (
          <span className="px-2.5 py-1 bg-orange-50 text-orange-700 border border-orange-200 text-[11px] font-bold rounded-full flex items-center gap-1">
            <Navigation className="w-3 h-3 text-orange-500 animate-spin" />
            <span>In Transit to Customer</span>
          </span>
        );
      case 'delivered':
        return (
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Delivered</span>
          </span>
        );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="POS Live Delivery Dispatch Terminal Feed"
      subtitle="Real-time alert log & status updates broadcasted to courier devices"
      maxWidth="3xl"
    >
      <div className="space-y-4">

        {/* Info Header */}
        <div className="bg-[#1F242D] text-white p-4 rounded-2xl border border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wide">Live Dispatch Terminal Feed</p>
              <p className="text-sm font-black text-white">Active Messages Broadcasted to Couriers</p>
            </div>
          </div>
          <button
            onClick={loadDispatches}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-bold rounded-lg border border-slate-600 cursor-pointer transition-colors"
          >
            Refresh Feed
          </button>
        </div>

        {/* Dispatches List */}
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs font-semibold">
            Fetching live terminal messages...
          </div>
        ) : dispatches.length === 0 ? (
          <div className="p-12 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-2">
            <Truck className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No active delivery dispatches yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              When a cashier completes a sale with Delivery Service selected on POS checkout, live dispatch messages will stream here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {dispatches.map((disp) => (
              <div
                key={disp.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3 hover:border-slate-300 transition-all"
              >
                {/* Header line */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900 font-mono bg-slate-100 px-2 py-0.5 rounded-md">
                      #{disp.orderNumber}
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      Collection: <strong className="text-slate-900">{disp.branchName}</strong>
                    </span>
                  </div>
                  {getStatusBadge(disp.status)}
                </div>

                {/* Broadcast Message Box */}
                <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                    <span className="flex items-center gap-1">
                      <Send className="w-3 h-3 text-[#FF6600]" />
                      <span>Live Terminal Alert to Courier:</span>
                    </span>
                    <span className="text-slate-500 font-normal">{new Date(disp.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs font-semibold text-amber-950 leading-relaxed font-sans">
                    "Attention <strong className="text-[#FF6600]">{disp.courierName}</strong> ({disp.vehicleType} - {disp.vehiclePlate}): Order #{disp.orderNumber} is ready for collection at {disp.branchName}. Delivery Fee: ${disp.deliveryFee.toFixed(2)}. Deliver to {disp.customerName} at {disp.deliveryAddress} ({disp.customerPhone})."
                  </p>
                </div>

                {/* Order & Address Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Customer: <strong className="text-slate-800">{disp.customerName || 'Walk-in'}</strong> ({disp.customerPhone || 'N/A'})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#FF6600] shrink-0" />
                    <span>Destination: <strong className="text-slate-800">{disp.deliveryAddress || 'Store Pickup'}</strong></span>
                  </div>
                </div>

                {/* Status Action Buttons */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-500 font-medium">
                    Order Total: <strong className="text-slate-900">${disp.orderTotal.toFixed(2)}</strong> (Fee: ${disp.deliveryFee.toFixed(2)})
                  </div>

                  <div className="flex items-center gap-1.5">
                    {disp.status === 'dispatched' && (
                      <button
                        onClick={() => handleUpdateStatus(disp.id, 'collected')}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
                      >
                        Mark Collected
                      </button>
                    )}
                    {disp.status === 'collected' && (
                      <button
                        onClick={() => handleUpdateStatus(disp.id, 'in_transit')}
                        className="px-3 py-1.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
                      >
                        Mark In Transit
                      </button>
                    )}
                    {disp.status === 'in_transit' && (
                      <button
                        onClick={() => handleUpdateStatus(disp.id, 'delivered')}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
                      >
                        Mark Delivered
                      </button>
                    )}
                    {disp.status === 'delivered' && (
                      <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Completed</span>
                      </span>
                    )}
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

      </div>
    </Modal>
  );
};
