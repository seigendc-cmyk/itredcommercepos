import React, { useState, useEffect } from 'react';
import { 
  VendorProfile, 
  DeliveryCourier, 
  VehicleType, 
  Branch, 
  StaffMember,
  DeliveryDispatchMessage 
} from '../../types';
import { 
  fetchDeliveryCouriers, 
  saveDeliveryCourier, 
  deleteDeliveryCourier, 
  fetchDeliveryDispatches 
} from '../../services/db';
import { 
  Truck, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Phone, 
  Zap, 
  ShieldAlert, 
  Sparkles, 
  MapPin, 
  DollarSign, 
  Radio, 
  Send,
  Navigation,
  Car
} from 'lucide-react';

interface DeliveryFleetManagementProps {
  vendor: VendorProfile;
  branches: Branch[];
  activeStaff: StaffMember;
  onOpenUpgradeModal: () => void;
  onOpenDispatchModal: () => void;
  onLogBIEvent: (eventType: string, details: string, metadata?: Record<string, any>) => void;
}

export const DeliveryFleetManagement: React.FC<DeliveryFleetManagementProps> = ({
  vendor,
  branches,
  activeStaff,
  onOpenUpgradeModal,
  onOpenDispatchModal,
  onLogBIEvent
}) => {
  const [couriers, setCouriers] = useState<DeliveryCourier[]>([]);
  const [dispatches, setDispatches] = useState<DeliveryDispatchMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourier, setEditingCourier] = useState<DeliveryCourier | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('biker');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState<number>(5.00);
  const [assignedBranchId, setAssignedBranchId] = useState('');
  const [status, setStatus] = useState<'available' | 'on_delivery' | 'offline'>('available');

  const isPaidPlan = vendor?.subscriptionPlan === 'pro_delivery' || vendor?.subscriptionPlan === 'enterprise_fleet';

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchDeliveryCouriers(vendor.id);
      setCouriers(data);
      const dispData = await fetchDeliveryDispatches(vendor.id);
      setDispatches(dispData);
    } catch (e) {
      console.error('Error loading couriers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [vendor.id]);

  const handleOpenAdd = () => {
    if (!isPaidPlan) {
      onOpenUpgradeModal();
      return;
    }
    setEditingCourier(null);
    setName('');
    setPhone('');
    setVehicleType('biker');
    setVehiclePlate('');
    setDefaultDeliveryFee(5.00);
    setAssignedBranchId(branches[0]?.id || '');
    setStatus('available');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (courier: DeliveryCourier) => {
    setEditingCourier(courier);
    setName(courier.name);
    setPhone(courier.phone);
    setVehicleType(courier.vehicleType);
    setVehiclePlate(courier.vehiclePlate);
    setDefaultDeliveryFee(courier.defaultDeliveryFee);
    setAssignedBranchId(courier.assignedBranchId || branches[0]?.id || '');
    setStatus(courier.status);
    setIsModalOpen(true);
  };

  const handleSubmitCourier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Courier name is required');
      return;
    }

    const assignedBranch = branches.find(b => b.id === assignedBranchId);

    const payload: Partial<DeliveryCourier> = {
      id: editingCourier ? editingCourier.id : undefined,
      name: name.trim(),
      phone: phone.trim(),
      vehicleType,
      vehiclePlate: vehiclePlate.trim().toUpperCase(),
      defaultDeliveryFee: Number(defaultDeliveryFee) || 5.00,
      status,
      assignedBranchId,
      assignedBranchName: assignedBranch?.name || ''
    };

    try {
      const saved = await saveDeliveryCourier(vendor.id, payload);
      onLogBIEvent(
        'STAFF_MUTATED',
        `Delivery Courier ${editingCourier ? 'updated' : 'appointed'}: ${saved.name} (${saved.vehicleType} - ${saved.vehiclePlate})`,
        { courierId: saved.id, vehicleType: saved.vehicleType, vehiclePlate: saved.vehiclePlate }
      );
      setIsModalOpen(false);
      await loadData();
    } catch (e) {
      console.error(e);
      alert('Failed to save courier');
    }
  };

  const handleDelete = async (courierId: string, courierName: string) => {
    if (!confirm(`Are you sure you want to remove courier ${courierName}?`)) return;
    try {
      await deleteDeliveryCourier(vendor.id, courierId);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const filteredCouriers = couriers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.phone.includes(searchTerm);
    const matchesType = filterType === 'all' || c.vehicleType === filterType;
    return matchesSearch && matchesType;
  });

  const getVehicleBadge = (type: VehicleType) => {
    switch (type) {
      case 'biker':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold rounded-lg">
            <span>🛵</span>
            <span>Biker / Motorbike</span>
          </span>
        );
      case 'car':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold rounded-lg">
            <Car className="w-3.5 h-3.5 text-blue-600" />
            <span>Sedan / Car</span>
          </span>
        );
      case 'van':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold rounded-lg">
            <Truck className="w-3.5 h-3.5 text-purple-600" />
            <span>Delivery Van</span>
          </span>
        );
    }
  };

  const getStatusBadge = (st: 'available' | 'on_delivery' | 'offline') => {
    switch (st) {
      case 'available':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Available</span>
          </span>
        );
      case 'on_delivery':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-700 border border-orange-200 text-xs font-bold rounded-full">
            <Clock className="w-3 h-3 text-orange-500" />
            <span>On Delivery</span>
          </span>
        );
      case 'offline':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-500 border border-slate-200 text-xs font-semibold rounded-full">
            <XCircle className="w-3 h-3" />
            <span>Offline</span>
          </span>
        );
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">

      {/* Top Banner / Plan Gateway */}
      {!isPaidPlan ? (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-amber-500/30 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black rounded-full uppercase tracking-wider">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Paid Plan Required for Delivery Service</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Appoint Delivery Personnel & Dispatch POS Orders
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Your vendor account is currently on the <span className="text-amber-400 font-bold">Starter Free Plan</span>. Upgrade to <span className="text-[#FF6600] font-bold">Pro Delivery ($29/mo)</span> to add Bikers, Cars, and Vans to your fleet, automatically charge delivery fees on POS checkout, and send live terminal alerts!
            </p>
          </div>
          <button
            onClick={onOpenUpgradeModal}
            className="px-6 py-3.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-black rounded-2xl shadow-lg shadow-orange-500/20 text-sm flex items-center gap-2 shrink-0 transition-all cursor-pointer"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>Upgrade Vendor Plan Now</span>
          </button>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-[#1F242D] via-[#2A313E] to-[#1F242D] text-white p-6 rounded-3xl shadow-xl border border-emerald-500/30 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Delivery Fleet Active • Pro / Enterprise Plan</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Delivery Logistics & POS Terminal Dispatch Engine
            </h2>
            <p className="text-xs text-slate-300">
              Appoint delivery drivers (Bikers, Cars, Vans) to receive instant live messages on checkout.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onOpenDispatchModal}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 cursor-pointer transition-all"
            >
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>Live Terminal Feed ({dispatches.length})</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="px-5 py-2.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-black text-xs rounded-xl shadow-md shadow-orange-500/20 flex items-center gap-2 cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Appoint Delivery Person</span>
            </button>
          </div>
        </div>
      )}

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Total Fleet</span>
            <div className="p-2 bg-slate-100 rounded-xl text-slate-700">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{couriers.length}</p>
          <span className="text-[11px] text-slate-500 font-medium">Appointed Couriers</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Available Now</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2">
            {couriers.filter(c => c.status === 'available').length}
          </p>
          <span className="text-[11px] text-emerald-600 font-semibold">Ready for POS Dispatch</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">On Delivery</span>
            <div className="p-2 bg-orange-50 rounded-xl text-orange-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-[#FF6600] mt-2">
            {couriers.filter(c => c.status === 'on_delivery').length}
          </p>
          <span className="text-[11px] text-orange-600 font-semibold">In Transit</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Live POS Dispatches</span>
            <div className="p-2 bg-purple-50 rounded-xl text-purple-600">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{dispatches.length}</p>
          <span className="text-[11px] text-slate-500 font-medium">Recorded Messages</span>
        </div>
      </div>

      {/* Controls & Filter Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name, plate #, phone..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF6600]"
          />
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            {['all', 'biker', 'car', 'van'].map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 font-bold rounded-lg capitalize transition-all cursor-pointer ${
                  filterType === type
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {type === 'all' ? 'All Vehicles' : type}
              </button>
            ))}
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-[#FF6600] hover:bg-[#E65C00] text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Courier</span>
          </button>
        </div>
      </div>

      {/* Courier Cards List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-xs font-semibold">
          Loading delivery fleet registry...
        </div>
      ) : filteredCouriers.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
            <Truck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-slate-800">No Delivery Personnel Appointed</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Appoint bikers, cars, or van drivers to provide your shop with instant delivery services integrated into POS checkout.
          </p>
          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-[#FF6600] text-white font-bold text-xs rounded-xl cursor-pointer"
          >
            Appoint First Courier
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCouriers.map((courier) => (
            <div
              key={courier.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                
                {/* Top Title & Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <h3 className="text-base font-black text-slate-900 leading-tight">
                      {courier.name}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-mono">
                        {courier.vehiclePlate}
                      </span>
                    </div>
                  </div>
                  {getStatusBadge(courier.status)}
                </div>

                {/* Badges & Logistics Info */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {getVehicleBadge(courier.vehicleType)}
                  <span className="inline-flex items-center gap-1 text-xs font-black text-[#FF6600] bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>${courier.defaultDeliveryFee.toFixed(2)} Fee</span>
                  </span>
                </div>

                {/* Details list */}
                <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-800">{courier.phone || 'No phone provided'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Station: <strong className="text-slate-800">{courier.assignedBranchName || 'All Stores / Central'}</strong></span>
                  </div>
                </div>

              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleOpenEdit(courier)}
                  className="px-3 py-1.5 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Edit Details</span>
                </button>

                <button
                  onClick={() => handleDelete(courier.id, courier.name)}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  title="Remove Courier"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Courier Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in duration-150">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {editingCourier ? 'Edit Delivery Person' : 'Appoint New Delivery Person'}
                </h3>
                <p className="text-xs text-slate-500">
                  Configure biker, car, or van driver details for POS dispatching
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCourier} className="space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Full Name <span className="text-[#FF6600]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Michael Scott"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF6600]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Phone / Terminal WhatsApp <span className="text-[#FF6600]">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF6600]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Vehicle Type <span className="text-[#FF6600]">*</span>
                  </label>
                  <select
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF6600]"
                  >
                    <option value="biker">🛵 Biker / Motorcycle</option>
                    <option value="car">🚗 Sedan / Car</option>
                    <option value="van">🚐 Delivery Van / Truck</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Vehicle Plate / Reg #
                  </label>
                  <input
                    type="text"
                    required
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    placeholder="e.g. BK-902-NY"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF6600]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Default Delivery Fee ($)
                  </label>
                  <input
                    type="number"
                    step="0.50"
                    required
                    value={defaultDeliveryFee}
                    onChange={(e) => setDefaultDeliveryFee(parseFloat(e.target.value) || 0)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF6600]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Assigned Branch / Store
                  </label>
                  <select
                    value={assignedBranchId}
                    onChange={(e) => setAssignedBranchId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF6600]"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Initial Courier Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF6600]"
                  >
                    <option value="available">🟢 Available for Dispatch</option>
                    <option value="on_delivery">🟠 On Delivery</option>
                    <option value="offline">⚪ Offline / Off Duty</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#FF6600] hover:bg-[#E65C00] text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                >
                  {editingCourier ? 'Save Changes' : 'Appoint Courier'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
