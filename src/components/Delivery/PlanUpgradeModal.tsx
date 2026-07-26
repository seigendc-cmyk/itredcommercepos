import React, { useState } from 'react';
import { Modal } from '../Common/Modal';
import { VendorProfile, SubscriptionPlanType } from '../../types';
import { Truck, CheckCircle2, Zap, Shield, Sparkles, Star, ArrowRight } from 'lucide-react';

interface PlanUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: VendorProfile;
  onUpgradePlan: (plan: SubscriptionPlanType) => Promise<void>;
}

export const PlanUpgradeModal: React.FC<PlanUpgradeModalProps> = ({
  isOpen,
  onClose,
  vendor,
  onUpgradePlan
}) => {
  const [loadingPlan, setLoadingPlan] = useState<SubscriptionPlanType | null>(null);

  const handleSelectPlan = async (plan: SubscriptionPlanType) => {
    setLoadingPlan(plan);
    try {
      await onUpgradePlan(plan);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPlan(null);
    }
  };

  const currentPlan = vendor?.subscriptionPlan || 'starter_free';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upgrade Vendor Subscription Plan"
      subtitle="Unlock Delivery Service Dispatch, Biker/Car/Van Fleet Management & Live POS Terminal Alerts"
      maxWidth="3xl"
    >
      <div className="space-y-6">

        {/* Feature Banner */}
        <div className="bg-gradient-to-r from-[#1F242D] via-[#2A313E] to-[#1F242D] p-5 rounded-2xl text-white border border-amber-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
          <div className="space-y-1 max-w-lg">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold rounded-full">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Paid Delivery Feature Gateway</span>
            </div>
            <h3 className="text-lg font-black tracking-tight text-white">
              Appoint Bikers, Cars & Vans for Store Deliveries
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Enable dispatch directly from POS cashier terminal to your delivery couriers with auto-calculated delivery fees charged to customer cart.
            </p>
          </div>
          <div className="shrink-0 flex items-center justify-center w-16 h-16 bg-[#FF6600]/10 border-2 border-[#FF6600]/40 rounded-2xl text-[#FF6600]">
            <Truck className="w-8 h-8 animate-bounce" />
          </div>
        </div>

        {/* Plan Comparison Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Starter Free Plan */}
          <div className={`p-5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
            currentPlan === 'starter_free'
              ? 'border-slate-300 bg-slate-50 opacity-90'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Starter Plan</span>
                {currentPlan === 'starter_free' && (
                  <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-black rounded-md">
                    Current Plan
                  </span>
                )}
              </div>
              <p className="text-2xl font-black text-slate-900">$0 <span className="text-xs text-slate-500 font-normal">/mo</span></p>
              <p className="text-xs text-slate-500 mt-1 mb-4">Basic POS register, catalog & inventory management.</p>
              
              <ul className="space-y-2 text-xs text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Single POS Terminal Register</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Basic Product Catalog</span>
                </li>
                <li className="flex items-center gap-2 text-slate-400">
                  <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[10px] flex items-center justify-center font-bold">✕</span>
                  <span className="line-through">Delivery Courier Fleet</span>
                </li>
                <li className="flex items-center gap-2 text-slate-400">
                  <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[10px] flex items-center justify-center font-bold">✕</span>
                  <span className="line-through">POS Cart Delivery Fees</span>
                </li>
              </ul>
            </div>

            <div className="mt-6">
              {currentPlan === 'starter_free' ? (
                <button
                  disabled
                  className="w-full py-2.5 bg-slate-200 text-slate-600 font-bold rounded-xl text-xs cursor-not-allowed"
                >
                  Active Starter Plan
                </button>
              ) : (
                <button
                  onClick={() => handleSelectPlan('starter_free')}
                  disabled={loadingPlan !== null}
                  className="w-full py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Downgrade to Free
                </button>
              )}
            </div>
          </div>

          {/* Pro Delivery Plan (RECOMMENDED) */}
          <div className={`p-5 rounded-2xl border-2 transition-all relative flex flex-col justify-between ${
            currentPlan === 'pro_delivery'
              ? 'border-[#FF6600] bg-orange-50/30 shadow-lg shadow-orange-500/10'
              : 'border-[#FF6600] bg-white hover:shadow-md'
          }`}>
            <div className="absolute -top-3 right-4 px-3 py-0.5 bg-[#FF6600] text-white text-[10px] font-black uppercase rounded-full shadow-sm flex items-center gap-1">
              <Star className="w-3 h-3 fill-current" />
              <span>Recommended</span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#FF6600]">Pro Delivery</span>
                {currentPlan === 'pro_delivery' && (
                  <span className="px-2 py-0.5 bg-[#FF6600] text-white text-[10px] font-black rounded-md">
                    Active Plan
                  </span>
                )}
              </div>
              <p className="text-2xl font-black text-slate-900">$29 <span className="text-xs text-slate-500 font-normal">/mo</span></p>
              <p className="text-xs text-slate-600 mt-1 mb-4">Complete Bikers/Cars/Vans fleet dispatch & live terminal messages.</p>
              
              <ul className="space-y-2 text-xs text-slate-700">
                <li className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Unlimited Bikers, Cars & Vans</span>
                </li>
                <li className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Auto Delivery Fee Charged to Cart</span>
                </li>
                <li className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Live POS Dispatch Messages to Courier</span>
                </li>
                <li className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Real-time Order Collection Tracking</span>
                </li>
              </ul>
            </div>

            <div className="mt-6">
              <button
                onClick={() => handleSelectPlan('pro_delivery')}
                disabled={loadingPlan !== null || currentPlan === 'pro_delivery'}
                className={`w-full py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  currentPlan === 'pro_delivery'
                    ? 'bg-emerald-600 text-white cursor-default'
                    : 'bg-[#FF6600] hover:bg-[#E65C00] text-white shadow-md shadow-orange-500/20'
                }`}
              >
                {loadingPlan === 'pro_delivery' ? (
                  <span>Activating Pro Plan...</span>
                ) : currentPlan === 'pro_delivery' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Plan Active</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>Upgrade to Pro ($29/mo)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Enterprise Fleet Plan */}
          <div className={`p-5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
            currentPlan === 'enterprise_fleet'
              ? 'border-indigo-600 bg-indigo-50/30'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Enterprise Fleet</span>
                {currentPlan === 'enterprise_fleet' && (
                  <span className="px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-black rounded-md">
                    Active Plan
                  </span>
                )}
              </div>
              <p className="text-2xl font-black text-slate-900">$79 <span className="text-xs text-slate-500 font-normal">/mo</span></p>
              <p className="text-xs text-slate-500 mt-1 mb-4">Multi-branch routing, priority dispatches & dedicated SLA.</p>
              
              <ul className="space-y-2 text-xs text-slate-700">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Everything in Pro Delivery</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Multi-Branch Logistics Network</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Dedicated Driver Mobile App Gateway</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>24/7 Priority Logistics SLA Support</span>
                </li>
              </ul>
            </div>

            <div className="mt-6">
              <button
                onClick={() => handleSelectPlan('enterprise_fleet')}
                disabled={loadingPlan !== null || currentPlan === 'enterprise_fleet'}
                className={`w-full py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  currentPlan === 'enterprise_fleet'
                    ? 'bg-indigo-600 text-white cursor-default'
                    : 'bg-indigo-900 hover:bg-slate-900 text-white shadow-md'
                }`}
              >
                {loadingPlan === 'enterprise_fleet' ? (
                  <span>Activating Enterprise...</span>
                ) : currentPlan === 'enterprise_fleet' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Plan Active</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 text-indigo-400" />
                    <span>Upgrade Enterprise ($79/mo)</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </div>

        {/* Note */}
        <div className="bg-slate-100 p-3.5 rounded-xl text-center text-xs text-slate-600 border border-slate-200">
          💡 <span className="font-semibold">Instant Activation:</span> Selecting Pro or Enterprise plan instantly unlocks the Delivery Service module across all POS terminals in your vendor account!
        </div>

      </div>
    </Modal>
  );
};
