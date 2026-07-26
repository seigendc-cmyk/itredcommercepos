import React, { useState, useEffect } from 'react';
import { Modal } from '../Common/Modal';
import { CartItem, Order, VendorProfile, DeliveryCourier } from '../../types';
import { Banknote, CreditCard, Smartphone, User, CheckCircle2, DollarSign, Truck, MapPin, Lock, Zap, ShieldAlert } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  branchName: string;
  terminalName: string;
  vendor: VendorProfile;
  couriers: DeliveryCourier[];
  onOpenUpgradeModal: () => void;
  onConfirmPayment: (paymentDetails: {
    method: 'cash' | 'card' | 'mobile_money' | 'split';
    cashGiven?: number;
    changeDue?: number;
    cardRef?: string;
    mobileProvider?: string;
    mobileRef?: string;
    customerName?: string;
    customerPhone?: string;
    deliveryDetails?: {
      courierId: string;
      courierName: string;
      courierPhone: string;
      vehicleType: 'biker' | 'car' | 'van';
      vehiclePlate: string;
      deliveryFee: number;
      deliveryAddress: string;
    };
  }) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  cartItems,
  subtotal,
  taxAmount,
  discountAmount,
  totalAmount: initialTotal,
  branchName,
  terminalName,
  vendor,
  couriers,
  onOpenUpgradeModal,
  onConfirmPayment
}) => {
  const [method, setMethod] = useState<'cash' | 'card' | 'mobile_money'>('cash');
  const [cardRef, setCardRef] = useState('');
  const [mobileProvider, setMobileProvider] = useState('M-Pesa');
  const [mobileRef, setMobileRef] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Delivery Service State
  const [isDelivery, setIsDelivery] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  const isPaidPlan = vendor?.subscriptionPlan === 'pro_delivery' || vendor?.subscriptionPlan === 'enterprise_fleet';

  // Find active courier
  const selectedCourier = couriers.find(c => c.id === selectedCourierId) || couriers[0];
  const deliveryFee = isDelivery && selectedCourier ? selectedCourier.defaultDeliveryFee : 0;

  const finalTotal = initialTotal + deliveryFee;

  const [cashGiven, setCashGiven] = useState<string>(Math.ceil(finalTotal).toString());

  useEffect(() => {
    setCashGiven(Math.ceil(finalTotal).toString());
  }, [finalTotal]);

  useEffect(() => {
    if (couriers.length > 0 && !selectedCourierId) {
      setSelectedCourierId(couriers[0].id);
    }
  }, [couriers]);

  const cashNum = parseFloat(cashGiven) || 0;
  const changeDue = Math.max(0, cashNum - finalTotal);

  const handleComplete = (e: React.FormEvent) => {
    e.preventDefault();
    if (method === 'cash' && cashNum < finalTotal) {
      alert(`Amount tendered ($${cashNum}) is less than total bill ($${finalTotal.toFixed(2)})`);
      return;
    }

    if (isDelivery && !isPaidPlan) {
      alert('Delivery service requires a paid vendor plan (Pro or Enterprise). Please upgrade your subscription.');
      onOpenUpgradeModal();
      return;
    }

    if (isDelivery && !selectedCourier) {
      alert('Please select an active delivery courier.');
      return;
    }

    if (isDelivery && !deliveryAddress.trim()) {
      alert('Please enter customer delivery address.');
      return;
    }

    onConfirmPayment({
      method,
      cashGiven: method === 'cash' ? cashNum : finalTotal,
      changeDue: method === 'cash' ? changeDue : 0,
      cardRef,
      mobileProvider,
      mobileRef,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryDetails: isDelivery && selectedCourier ? {
        courierId: selectedCourier.id,
        courierName: selectedCourier.name,
        courierPhone: selectedCourier.phone,
        vehicleType: selectedCourier.vehicleType,
        vehiclePlate: selectedCourier.vehiclePlate,
        deliveryFee,
        deliveryAddress: deliveryAddress.trim()
      } : undefined
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Complete Sale Payment"
      subtitle={`${branchName} • ${terminalName}`}
      maxWidth="xl"
    >
      <form onSubmit={handleComplete} className="space-y-5">
        
        {/* Bill Summary Banner */}
        <div className="bg-[#1F242D] text-white p-4 rounded-2xl flex items-center justify-between border-2 border-[#FF6600]">
          <div>
            <p className="text-xs uppercase font-bold text-slate-300">Total Payable Amount</p>
            <p className="text-2xl sm:text-3xl font-black text-[#FF6600] mt-0.5">
              ${finalTotal.toFixed(2)}
            </p>
          </div>
          <div className="text-right text-xs text-slate-300 space-y-0.5">
            <p>Cart Subtotal: ${subtotal.toFixed(2)}</p>
            <p>Tax (8%): +${taxAmount.toFixed(2)}</p>
            {discountAmount > 0 && <p className="text-orange-400">Discount: -${discountAmount.toFixed(2)}</p>}
            {isDelivery && (
              <p className="text-amber-400 font-bold">Delivery Fee: +${deliveryFee.toFixed(2)}</p>
            )}
          </div>
        </div>

        {/* Delivery Service Section */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isDelivery}
                onChange={(e) => setIsDelivery(e.target.checked)}
                className="w-4 h-4 text-[#FF6600] rounded focus:ring-[#FF6600]"
              />
              <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-[#FF6600]" />
                <span>Deliver Order via Biker / Car / Van Courier</span>
              </span>
            </label>

            {!isPaidPlan ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full border border-amber-300">
                <Lock className="w-3 h-3 text-amber-600" />
                <span>Paid Plan Required</span>
              </span>
            ) : (
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                Live POS Dispatch Active
              </span>
            )}
          </div>

          {!isPaidPlan && isDelivery && (
            <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 flex items-center justify-between text-xs gap-3">
              <div className="flex items-center gap-2 text-amber-900">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Delivery service requires a Pro or Enterprise Plan.</span>
              </div>
              <button
                type="button"
                onClick={onOpenUpgradeModal}
                className="px-3 py-1.5 bg-[#FF6600] text-white text-xs font-bold rounded-lg shrink-0 flex items-center gap-1 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Upgrade Plan</span>
              </button>
            </div>
          )}

          {isDelivery && isPaidPlan && (
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Select Appointed Courier <span className="text-[#FF6600]">*</span>
                  </label>
                  <select
                    value={selectedCourierId}
                    onChange={(e) => setSelectedCourierId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                  >
                    {couriers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.vehicleType.toUpperCase()} - {c.vehiclePlate}) — Fee: ${c.defaultDeliveryFee.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Delivery Address / Customer Instructions <span className="text-[#FF6600]">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-[#FF6600] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required={isDelivery}
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="e.g. 102 Market St, Apt 4B"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                    />
                  </div>
                </div>
              </div>

              {selectedCourier && (
                <div className="bg-orange-50/60 p-2.5 rounded-xl border border-orange-200 flex items-center justify-between text-xs text-slate-800">
                  <span className="font-medium">
                    Courier: <strong className="text-slate-900">{selectedCourier.name}</strong> ({selectedCourier.vehicleType} - {selectedCourier.vehiclePlate}) • Phone: <strong>{selectedCourier.phone}</strong>
                  </span>
                  <span className="font-black text-[#FF6600]">
                    +${selectedCourier.defaultDeliveryFee.toFixed(2)} Delivery Fee
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Payment Method Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-900 mb-2">
            Select Payment Method <span className="text-[#FF6600]">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => setMethod('cash')}
              className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                method === 'cash'
                  ? 'border-[#FF6600] bg-orange-50/50 text-slate-900 font-bold shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <Banknote className="w-6 h-6 text-[#FF6600]" />
              <span className="text-xs">Cash</span>
            </button>

            <button
              type="button"
              onClick={() => setMethod('card')}
              className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                method === 'card'
                  ? 'border-[#FF6600] bg-orange-50/50 text-slate-900 font-bold shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <CreditCard className="w-6 h-6 text-[#FF6600]" />
              <span className="text-xs">Debit / Credit</span>
            </button>

            <button
              type="button"
              onClick={() => setMethod('mobile_money')}
              className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                method === 'mobile_money'
                  ? 'border-[#FF6600] bg-orange-50/50 text-slate-900 font-bold shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <Smartphone className="w-6 h-6 text-[#FF6600]" />
              <span className="text-xs">Mobile Money</span>
            </button>
          </div>
        </div>

        {/* Method Specific Inputs */}
        {method === 'cash' && (
          <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">
                Amount Tendered ($)
              </label>
              <div className="relative">
                <DollarSign className="w-5 h-5 text-[#FF6600] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="0.01"
                  required
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-lg font-black text-slate-900 focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
                />
              </div>
            </div>

            {/* Quick cash shortcut buttons */}
            <div className="flex gap-2">
              {[finalTotal, Math.ceil(finalTotal), 20, 50, 100].map((amount, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCashGiven(amount.toFixed(2))}
                  className="px-2.5 py-1 bg-white hover:bg-orange-50 border border-slate-200 hover:border-[#FF6600] text-slate-800 text-xs font-bold rounded-lg transition-colors"
                >
                  ${amount.toFixed(0)}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-600">Change Due to Customer:</span>
              <span className="text-xl font-black text-emerald-600">${changeDue.toFixed(2)}</span>
            </div>
          </div>
        )}

        {method === 'card' && (
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Card POS Approval Code / Reference #
            </label>
            <input
              type="text"
              value={cardRef}
              onChange={(e) => setCardRef(e.target.value)}
              placeholder="e.g. AUTH-882910"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-[#FF6600]"
            />
          </div>
        )}

        {method === 'mobile_money' && (
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">Provider</label>
              <select
                value={mobileProvider}
                onChange={(e) => setMobileProvider(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
              >
                <option value="M-Pesa">M-Pesa</option>
                <option value="Airtel Money">Airtel Money</option>
                <option value="MTN MoMo">MTN MoMo</option>
                <option value="Orange Money">Orange Money</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-900 mb-1">Txn Ref #</label>
              <input
                type="text"
                value={mobileRef}
                onChange={(e) => setMobileRef(e.target.value)}
                placeholder="e.g. QKH89120"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
              />
            </div>
          </div>
        )}

        {/* Optional Customer info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Customer Name (Optional)</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Walk-in Customer"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-1 focus:ring-[#FF6600]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Customer Phone (Optional)</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+1..."
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-1 focus:ring-[#FF6600]"
            />
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            type="submit"
            className="w-full py-3.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-black rounded-2xl shadow-lg shadow-orange-500/20 text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Process Sale (${finalTotal.toFixed(2)})</span>
          </button>
        </div>

      </form>
    </Modal>
  );
};
