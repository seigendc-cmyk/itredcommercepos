import React, { useState, useEffect } from 'react';
import { 
  VendorProfile, 
  StaffMember, 
  Branch, 
  AppMenuId, 
  HardwareSettings, 
  CustomRoleDefinition,
  StaffRole
} from '../../types';
import { 
  fetchHardwareSettings, 
  saveHardwareSettings, 
  fetchCustomRoles, 
  saveCustomRoles, 
  updateVendorProfile 
} from '../../services/db';
import { 
  Building2, 
  ShieldCheck, 
  Printer, 
  Sliders, 
  Save, 
  Plus, 
  Check, 
  X, 
  Users, 
  CheckSquare, 
  Barcode, 
  CreditCard, 
  Scale, 
  Monitor, 
  Receipt, 
  Sparkles,
  Info,
  DollarSign,
  Briefcase,
  Lock,
  UserPlus
} from 'lucide-react';

interface SettingsWorkspaceProps {
  vendor: VendorProfile;
  activeStaff: StaffMember;
  staffList: StaffMember[];
  branches: Branch[];
  onUpdateVendor: (updated: VendorProfile) => void;
  onSaveStaff: (staffData: Partial<StaffMember>) => Promise<void>;
  onLogBIEvent: (eventType: string, details: string, metadata?: Record<string, any>) => void;
}

const ALL_MENUS: { id: AppMenuId; label: string; description: string }[] = [
  { id: 'desk', label: 'Staff Desk', description: 'Personalized workspace & dashboard' },
  { id: 'pos', label: 'POS Register', description: 'Retail sales terminal & checkout' },
  { id: 'delivery', label: 'Delivery Services', description: 'Fleet appointment, vehicle management & live dispatches' },
  { id: 'warehouse', label: 'Central Warehouse', description: 'Supplier intake & inventory hub' },
  { id: 'transfers', label: 'Stock Transfers', description: 'Inter-branch stock logistics' },
  { id: 'branches', label: 'Branches & Terminals', description: 'Multi-store location management' },
  { id: 'products', label: 'Products Catalog', description: 'Master catalog & pricing setup' },
  { id: 'stock_matrix', label: 'Stock by Cost Center', description: 'Consolidated warehouse and branch stock matrix' },
  { id: 'managed_stocktake', label: 'User Managed Stocktake', description: 'Select products, record counts and submit adjustment reports' },
  { id: 'purchase_orders', label: 'Purchase Orders', description: 'Plan or accept BI purchasing recommendations and submit them for approval' },
  { id: 'reports', label: 'Sales & Reports', description: 'Financial analytics & order audits' },
  { id: 'approvals', label: 'Approvals & Workflows', description: 'Strict transaction authorization' },
  { id: 'staff', label: 'Staff & Roles', description: 'Sysadmin user permissions & desk config' },
  { id: 'bi_audit', label: 'BI Engine & Logs', description: 'Background intelligence & decision logs' },
  { id: 'billing', label: 'Billing & Subscriptions', description: 'Vendor subscription plans, auto-invoices & services' },
  { id: 'settings', label: 'POS Settings & Config', description: 'Business profile, hardware & role permissions' },
];

const SECTORS = [
  'General Retail & Supermarket',
  'Electronics & Technology',
  'Fashion & Apparel Boutique',
  'Pharmacy & Healthcare',
  'Food & Beverage / Cafe',
  'Hardware & Building Materials',
  'Automotive & Spare Parts',
  'Beauty & Cosmetics'
];

export function SettingsWorkspace({
  vendor,
  activeStaff,
  staffList,
  branches,
  onUpdateVendor,
  onSaveStaff,
  onLogBIEvent
}: SettingsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'roles' | 'hardware' | 'governance'>('profile');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Business Profile Form State
  const [businessName, setBusinessName] = useState(vendor.businessName || '');
  const [address, setAddress] = useState(vendor.address || '');
  const [phone, setPhone] = useState(vendor.phone || '');
  const [vatNumber, setVatNumber] = useState(vendor.vatNumber || '');
  const [businessRegNumber, setBusinessRegNumber] = useState(vendor.businessRegNumber || '');
  const [businessSector, setBusinessSector] = useState(vendor.businessSector || SECTORS[0]);
  const [currency, setCurrency] = useState(vendor.currency || '$');
  const [taxRate, setTaxRate] = useState(vendor.taxRate || 8);
  const [taxName, setTaxName] = useState(vendor.taxIdentificationName || 'VAT');
  const [receiptHeaderNotice, setReceiptHeaderNotice] = useState(vendor.receiptHeaderNotice || 'Welcome to ' + vendor.businessName);
  const [receiptFooterText, setReceiptFooterText] = useState(vendor.receiptFooterText || 'Thank you for shopping with us! Returns accepted within 14 days.');

  // Hardware Settings State
  const [hardware, setHardware] = useState<HardwareSettings>({
    printerType: 'thermal_80mm',
    printerName: 'Epson TM-T88VI Thermal POS Printer',
    autoPrintReceipt: true,
    barcodeScannerMode: 'usb_hid',
    cashDrawerAutoKick: true,
    cashDrawerKickPin: 'pin_2',
    customerPoleDisplay: true,
    customerPoleMessage: 'Thank you for shopping with us!',
    msrCardReaderEnabled: true,
    scaleIntegration: false,
  });

  // Custom Roles State
  const [roles, setRoles] = useState<CustomRoleDefinition[]>([]);
  const [selectedRole, setSelectedRole] = useState<CustomRoleDefinition | null>(null);
  
  // Create New Role Modal
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [newRoleMenus, setNewRoleMenus] = useState<AppMenuId[]>(['desk', 'pos', 'reports']);
  const [newRoleCanApprove, setNewRoleCanApprove] = useState(false);

  // Quick Staff Creation Modal
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffRole, setStaffRole] = useState<StaffRole>('cashier');
  const [staffAssignedBranch, setStaffAssignedBranch] = useState('');

  // Hardware Test Modals
  const [testReceiptOpen, setTestReceiptOpen] = useState(false);
  const [scannerTestInput, setScannerTestInput] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [pulseMessage, setPulseMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchHardwareSettings(vendor.id).then(h => setHardware(h));
    fetchCustomRoles(vendor.id).then(rList => {
      setRoles(rList);
      if (rList.length > 0) setSelectedRole(rList[0]);
    });
  }, [vendor.id]);

  const showToast = (msg: string) => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(null), 3500);
  };

  // Save Business Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await updateVendorProfile(vendor.id, {
      businessName,
      address,
      phone,
      vatNumber,
      businessRegNumber,
      businessSector,
      currency,
      taxRate: Number(taxRate),
      taxIdentificationName: taxName,
      receiptHeaderNotice,
      receiptFooterText,
    });

    onUpdateVendor(updated);
    onLogBIEvent('SETTINGS_UPDATE_PROFILE', `Business profile updated by ${activeStaff.name}`, { vatNumber, businessRegNumber, currency });
    showToast('Business & Company Profile saved successfully!');
  };

  // Save Hardware Settings
  const handleSaveHardware = async () => {
    await saveHardwareSettings(vendor.id, hardware);
    onLogBIEvent('SETTINGS_UPDATE_HARDWARE', `POS Hardware config saved by ${activeStaff.name}`, hardware);
    showToast('Hardware settings applied successfully!');
  };

  // Toggle Menu Permission for Role
  const handleToggleRoleMenu = (menuId: AppMenuId) => {
    if (!selectedRole) return;
    const currentMenus = selectedRole.defaultGrantedMenuIds;
    const updatedMenus = currentMenus.includes(menuId)
      ? currentMenus.filter(m => m !== menuId)
      : [...currentMenus, menuId];

    const updatedRole: CustomRoleDefinition = {
      ...selectedRole,
      defaultGrantedMenuIds: updatedMenus
    };

    setSelectedRole(updatedRole);
    const updatedList = roles.map(r => r.roleKey === selectedRole.roleKey ? updatedRole : r);
    setRoles(updatedList);
    saveCustomRoles(vendor.id, updatedList);
    showToast(`Permissions updated for role: ${selectedRole.roleName}`);
  };

  // Create New Custom Role
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;

    const roleKey = `role_${Date.now()}`;
    const newRoleObj: CustomRoleDefinition = {
      roleKey,
      roleName: newRoleName.trim(),
      description: newRoleDescription.trim() || 'Custom staff role profile',
      defaultGrantedMenuIds: newRoleMenus,
      canApproveTransactions: newRoleCanApprove,
      isSystemRole: false
    };

    const updatedList = [...roles, newRoleObj];
    setRoles(updatedList);
    setSelectedRole(newRoleObj);
    await saveCustomRoles(vendor.id, updatedList);

    onLogBIEvent('SETTINGS_CREATE_ROLE', `Created new custom role: ${newRoleName}`, { roleKey });
    setIsRoleModalOpen(false);
    setNewRoleName('');
    setNewRoleDescription('');
    showToast(`Role "${newRoleName}" created!`);
  };

  // Save Quick Staff Profile
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName || !staffEmail) return;

    // find default menus for assigned role
    const matchedRole = roles.find(r => r.roleKey === staffRole);
    const grantedMenuIds = matchedRole ? matchedRole.defaultGrantedMenuIds : ['desk', 'pos', 'reports'];

    await onSaveStaff({
      name: staffName,
      email: staffEmail,
      phone: staffPhone,
      role: staffRole,
      assignedBranchId: staffAssignedBranch || (branches[0]?.id || ''),
      grantedMenuIds,
      status: 'active'
    });

    setIsStaffModalOpen(false);
    setStaffName('');
    setStaffEmail('');
    setStaffPhone('');
    showToast(`Staff profile for ${staffName} created!`);
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {saveStatus && (
        <div className="fixed top-20 right-6 z-50 bg-[#333333] text-white px-4 py-3 rounded-lg shadow-xl border-l-4 border-[#FF6B00] flex items-center gap-3 animate-bounce">
          <Sparkles className="w-5 h-5 text-[#FF6B00]" />
          <span className="text-sm font-semibold">{saveStatus}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-[#333333] text-white p-6 rounded-lg shadow-sm border-l-4 border-[#FF6B00] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-6 h-6 text-[#FF6B00]" />
            <h1 className="text-2xl font-bold tracking-tight">POS System Settings</h1>
            <span className="px-2.5 py-0.5 bg-orange-500/20 text-[#FF6B00] border border-[#FF6B00]/40 rounded text-[10px] font-bold uppercase tracking-wider">
              Sysadmin Control
            </span>
          </div>
          <p className="text-xs text-gray-300 mt-1">
            Configure business VAT/registration profile, staff security roles, menu grants, and physical POS hardware integration.
          </p>
        </div>

        {/* Quick Nav Tabs */}
        <div className="flex items-center gap-1 bg-black/30 p-1 rounded-lg border border-gray-700">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'profile' ? 'bg-[#FF6B00] text-white shadow' : 'text-gray-300 hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" /> Company Profile
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'roles' ? 'bg-[#FF6B00] text-white shadow' : 'text-gray-300 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Roles & Menus
          </button>
          <button
            onClick={() => setActiveTab('hardware')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'hardware' ? 'bg-[#FF6B00] text-white shadow' : 'text-gray-300 hover:text-white'
            }`}
          >
            <Printer className="w-3.5 h-3.5" /> System Hardware
          </button>
          <button
            onClick={() => setActiveTab('governance')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'governance' ? 'bg-[#FF6B00] text-white shadow' : 'text-gray-300 hover:text-white'
            }`}
          >
            <Lock className="w-3.5 h-3.5" /> Tax & Rules
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: BUSINESS & COMPANY PROFILE */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#FF6B00]" /> Company & Business Registration Details
                </h2>
                <p className="text-xs text-slate-500">
                  Update VAT number, registration credentials, business category, and tax rates printed on customer receipts.
                </p>
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-[#FF6B00] hover:bg-orange-600 text-white rounded-lg text-xs font-bold shadow flex items-center gap-2 transition"
              >
                <Save className="w-4 h-4" /> Save Company Profile
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Legal Business Name *</label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none"
                  placeholder="e.g. iTred Retail Stores HQ Ltd"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">VAT / Tax Identification No.</label>
                <input
                  type="text"
                  value={vatNumber}
                  onChange={e => setVatNumber(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none font-mono"
                  placeholder="e.g. VAT-982173491-TX"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Business Registration No.</label>
                <input
                  type="text"
                  value={businessRegNumber}
                  onChange={e => setBusinessRegNumber(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none font-mono"
                  placeholder="e.g. RC-2026-908123"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Business Sector / Industry</label>
                <select
                  value={businessSector}
                  onChange={e => setBusinessSector(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none bg-white"
                >
                  {SECTORS.map(sec => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Operating Currency</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none bg-white font-bold"
                >
                  <option value="$">$ (USD - United States Dollar)</option>
                  <option value="€">€ (EUR - Euro)</option>
                  <option value="£">£ (GBP - British Pound)</option>
                  <option value="₦">₦ (NGN - Nigerian Naira)</option>
                  <option value="R">R (ZAR - South African Rand)</option>
                  <option value="₹">₹ (INR - Indian Rupee)</option>
                  <option value="AED">AED (Emirati Dirham)</option>
                  <option value="KSh">KSh (Kenyan Shilling)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tax System Name & Rate (%)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={taxName}
                    onChange={e => setTaxName(e.target.value)}
                    className="w-1/2 text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none"
                    placeholder="e.g. VAT / GST"
                  />
                  <div className="relative w-1/2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={taxRate}
                      onChange={e => setTaxRate(Number(e.target.value))}
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none pr-6"
                    />
                    <span className="absolute right-2.5 top-2.5 text-xs text-slate-400">%</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Official Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none"
                  placeholder="e.g. 742 Evergreen Terrace, Commerce Hub"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Telephone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none"
                  placeholder="e.g. +1 (555) 019-2831"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company Contact Email</label>
                <input
                  type="email"
                  disabled
                  value={vendor.email}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Receipt Notice Configurations */}
            <div className="border-t border-slate-100 pt-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#FF6B00]" /> Customer Receipt Header & Footer Customization
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt Header Greeting</label>
                  <input
                    type="text"
                    value={receiptHeaderNotice}
                    onChange={e => setReceiptHeaderNotice(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none"
                    placeholder="Welcome Message at the top of the thermal receipt"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt Footer Disclaimer</label>
                  <input
                    type="text"
                    value={receiptFooterText}
                    onChange={e => setReceiptFooterText(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none"
                    placeholder="Return policy or thank you note at bottom"
                  />
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* SUB-TAB 2: ROLES & MENU ACCESS */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Roles Selection Sidebar */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#FF6B00]" /> Configured Staff Roles
                </h3>
                <button
                  onClick={() => setIsRoleModalOpen(true)}
                  className="px-2.5 py-1 bg-[#FF6B00] text-white rounded text-[11px] font-bold flex items-center gap-1 hover:bg-orange-600 transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Create Role
                </button>
              </div>

              <div className="space-y-2">
                {roles.map(r => (
                  <div
                    key={r.roleKey}
                    onClick={() => setSelectedRole(r)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedRole?.roleKey === r.roleKey
                        ? 'border-[#FF6B00] bg-orange-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{r.roleName}</span>
                      {r.isSystemRole && (
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded text-[9px] font-bold">
                          System Default
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{r.description}</p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                      <span>{r.defaultGrantedMenuIds.length} Menus Granted</span>
                      <span className={r.canApproveTransactions ? 'text-green-600 font-bold' : 'text-slate-400'}>
                        {r.canApproveTransactions ? 'Can Approve' : 'No Approval'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Staff Member Quick Creation Button */}
              <div className="border-t border-slate-100 pt-4">
                <button
                  onClick={() => setIsStaffModalOpen(true)}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold shadow flex items-center justify-center gap-2 transition"
                >
                  <UserPlus className="w-4 h-4 text-[#FF6B00]" /> Add New Staff Profile
                </button>
              </div>
            </div>

            {/* Menu Matrix & Access Controls */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-6">
              {selectedRole ? (
                <>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-slate-800">{selectedRole.roleName} Menu Access Matrix</h2>
                        <span className="px-2 py-0.5 bg-orange-100 text-[#FF6B00] rounded text-[10px] font-bold uppercase">
                          {selectedRole.roleKey}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{selectedRole.description}</p>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <input
                        type="checkbox"
                        id="canApprove"
                        checked={selectedRole.canApproveTransactions}
                        onChange={e => {
                          const updatedRole = { ...selectedRole, canApproveTransactions: e.target.checked };
                          setSelectedRole(updatedRole);
                          const updatedList = roles.map(r => r.roleKey === selectedRole.roleKey ? updatedRole : r);
                          setRoles(updatedList);
                          saveCustomRoles(vendor.id, updatedList);
                        }}
                        className="w-4 h-4 text-[#FF6B00] rounded focus:ring-[#FF6B00]"
                      />
                      <label htmlFor="canApprove" className="text-xs font-bold text-slate-700 cursor-pointer">
                        Can Approve Discounts / Stock Adjustments
                      </label>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                      Granted Navigation Menus ({selectedRole.defaultGrantedMenuIds.length} Enabled)
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {ALL_MENUS.map(m => {
                        const isChecked = selectedRole.defaultGrantedMenuIds.includes(m.id);
                        return (
                          <div
                            key={m.id}
                            onClick={() => handleToggleRoleMenu(m.id)}
                            className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3 ${
                              isChecked
                                ? 'border-[#FF6B00] bg-orange-50/40 text-slate-900'
                                : 'border-slate-200 bg-slate-50/50 text-slate-400 hover:border-slate-300'
                            }`}
                          >
                            <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border transition ${
                              isChecked ? 'bg-[#FF6B00] border-[#FF6B00] text-white' : 'border-slate-300 bg-white'
                            }`}>
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <div>
                              <p className="text-xs font-bold">{m.label}</p>
                              <p className="text-[11px] text-slate-500">{m.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Staff Profiles assigned to this Role */}
                  <div className="border-t border-slate-100 pt-5 space-y-3">
                    <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center justify-between">
                      <span>Assigned Staff Accounts ({staffList.filter(s => s.role === selectedRole.roleKey).length})</span>
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {staffList.filter(s => s.role === selectedRole.roleKey).map(st => (
                        <div key={st.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-slate-800">{st.name}</p>
                            <p className="text-[10px] text-slate-500">{st.email}</p>
                          </div>
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">
                            Active
                          </span>
                        </div>
                      ))}
                      {staffList.filter(s => s.role === selectedRole.roleKey).length === 0 && (
                        <p className="text-xs text-slate-400 italic">No staff profiles currently assigned to this role.</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center text-slate-400">Select a role on the left to configure permissions.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: SYSTEM HARDWARE CONFIGURATION */}
      {activeTab === 'hardware' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Printer className="w-5 h-5 text-[#FF6B00]" /> Physical POS Hardware Devices Setup
                </h2>
                <p className="text-xs text-slate-500">
                  Connect thermal receipt printers, USB/Serial barcode scanners, cash drawer RJ11 kick pulses, and VFD pole displays.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveHardware}
                className="px-4 py-2 bg-[#FF6B00] hover:bg-orange-600 text-white rounded-lg text-xs font-bold shadow flex items-center gap-2 transition"
              >
                <Save className="w-4 h-4" /> Save Hardware Config
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* 1. Thermal Receipt Printer */}
              <div className="p-4 border border-slate-200 rounded-lg space-y-3 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-[#FF6B00]" /> Thermal Receipt Printer
                  </h3>
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">
                    Connected
                  </span>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Printer Type & Paper Width</label>
                    <select
                      value={hardware.printerType}
                      onChange={e => setHardware({ ...hardware, printerType: e.target.value as any })}
                      className="w-full text-xs p-2 border border-slate-300 rounded bg-white"
                    >
                      <option value="thermal_80mm">Thermal 80mm Standard POS (ESC/POS)</option>
                      <option value="thermal_58mm">Thermal 58mm Compact Receipt Printer</option>
                      <option value="standard_a4">Standard A4 / Laser Document Printer</option>
                      <option value="pdf_only">Digital Receipt / PDF Export Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Device Driver Name</label>
                    <input
                      type="text"
                      value={hardware.printerName}
                      onChange={e => setHardware({ ...hardware, printerName: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-300 rounded bg-white"
                      placeholder="e.g. Epson TM-T88VI"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="text-xs font-semibold text-slate-700">Auto-Print Receipt on Payment</label>
                    <input
                      type="checkbox"
                      checked={hardware.autoPrintReceipt}
                      onChange={e => setHardware({ ...hardware, autoPrintReceipt: e.target.checked })}
                      className="w-4 h-4 text-[#FF6B00] rounded focus:ring-[#FF6B00]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setTestReceiptOpen(true)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded transition flex items-center justify-center gap-2"
                  >
                    <Printer className="w-3.5 h-3.5" /> Test Print Sample Receipt
                  </button>
                </div>
              </div>

              {/* 2. Barcode Scanner */}
              <div className="p-4 border border-slate-200 rounded-lg space-y-3 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Barcode className="w-4 h-4 text-[#FF6B00]" /> Barcode Scanner Integration
                  </h3>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded">
                    USB / Bluetooth
                  </span>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Scanner Connection Mode</label>
                    <select
                      value={hardware.barcodeScannerMode}
                      onChange={e => setHardware({ ...hardware, barcodeScannerMode: e.target.value as any })}
                      className="w-full text-xs p-2 border border-slate-300 rounded bg-white"
                    >
                      <option value="usb_hid">USB HID Keyboard Emulation Mode (Recommended)</option>
                      <option value="camera_scan">Device Camera / Web Scanner</option>
                      <option value="serial_com">Serial COM / Virtual Port Scanner</option>
                      <option value="manual_only">Manual SKU Entry Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Live Scanner Test Input</label>
                    <input
                      type="text"
                      value={scannerTestInput}
                      onChange={e => {
                        setScannerTestInput(e.target.value);
                        if (e.target.value.length >= 8) {
                          setScannedBarcode(e.target.value);
                        }
                      }}
                      className="w-full text-xs p-2 border border-slate-300 rounded bg-white font-mono text-[#FF6B00]"
                      placeholder="Scan a physical barcode or type here..."
                    />
                  </div>

                  {scannedBarcode && (
                    <div className="p-2 bg-green-50 border border-green-200 rounded text-[11px] text-green-800 font-mono flex items-center justify-between">
                      <span>Scanned: {scannedBarcode}</span>
                      <Check className="w-3.5 h-3.5 text-green-600" />
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Cash Drawer Kick */}
              <div className="p-4 border border-slate-200 rounded-lg space-y-3 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-[#FF6B00]" /> RJ11 Cash Drawer Kick Out
                  </h3>
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">
                    RJ11 Port Ready
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">Auto Open Drawer on Cash Checkout</label>
                    <input
                      type="checkbox"
                      checked={hardware.cashDrawerAutoKick}
                      onChange={e => setHardware({ ...hardware, cashDrawerAutoKick: e.target.checked })}
                      className="w-4 h-4 text-[#FF6B00] rounded focus:ring-[#FF6B00]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kick Pin Signal</label>
                    <select
                      value={hardware.cashDrawerKickPin}
                      onChange={e => setHardware({ ...hardware, cashDrawerKickPin: e.target.value as any })}
                      className="w-full text-xs p-2 border border-slate-300 rounded bg-white"
                    >
                      <option value="pin_2">Pin 2 (Standard Epson ESC/POS Kick Signal)</option>
                      <option value="pin_5">Pin 5 (Alternative Drawer Solenoid Pin)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPulseMessage('RJ11 Voltage Pulse Sent: Cash Drawer Triggered!');
                      setTimeout(() => setPulseMessage(null), 3000);
                    }}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded transition flex items-center justify-center gap-2"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-[#FF6B00]" /> Send Pulse to Test Cash Drawer
                  </button>

                  {pulseMessage && (
                    <p className="text-[11px] font-bold text-green-600 text-center animate-pulse">{pulseMessage}</p>
                  )}
                </div>
              </div>

              {/* 4. Customer Pole Display VFD */}
              <div className="p-4 border border-slate-200 rounded-lg space-y-3 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-[#FF6B00]" /> VFD Customer Pole Display
                  </h3>
                  <span className="px-2 py-0.5 bg-orange-100 text-[#FF6B00] text-[10px] font-bold rounded">
                    2x20 Character LED
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">Enable Customer Pole Display</label>
                    <input
                      type="checkbox"
                      checked={hardware.customerPoleDisplay}
                      onChange={e => setHardware({ ...hardware, customerPoleDisplay: e.target.checked })}
                      className="w-4 h-4 text-[#FF6B00] rounded focus:ring-[#FF6B00]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Standby Banner Text</label>
                    <input
                      type="text"
                      maxLength={20}
                      value={hardware.customerPoleMessage}
                      onChange={e => setHardware({ ...hardware, customerPoleMessage: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-300 rounded bg-white"
                    />
                  </div>

                  {/* VFD Screen Simulation */}
                  <div className="p-3 bg-slate-900 text-green-400 font-mono text-center rounded border-2 border-slate-700 shadow-inner">
                    <p className="text-[11px] tracking-widest uppercase">{hardware.customerPoleMessage || 'WELCOME'}</p>
                    <p className="text-[10px] text-green-500/70 mt-1">TOTAL: $0.00 DUE</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: TAX & GOVERNANCE RULES */}
      {activeTab === 'governance' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Lock className="w-5 h-5 text-[#FF6B00]" /> Financial Governance & Approval Triggers
              </h2>
              <p className="text-xs text-slate-500">
                Set transaction limits requiring manager authorization for refunds, discounts, and inventory write-offs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => showToast('Governance rules updated!')}
              className="px-4 py-2 bg-[#FF6B00] hover:bg-orange-600 text-white rounded-lg text-xs font-bold shadow flex items-center gap-2 transition"
            >
              <Save className="w-4 h-4" /> Save Governance Rules
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 border border-slate-200 rounded-lg space-y-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-[#FF6B00]" /> Cashier Discount Authorization Limit
              </h3>
              <p className="text-xs text-slate-500">
                Discounts exceeding this percentage will automatically prompt for manager override or create an approval ticket.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  defaultValue={10}
                  className="w-24 text-xs p-2.5 border border-slate-300 rounded-lg font-bold"
                />
                <span className="text-xs text-slate-600">% Max Unapproved Cashier Discount</span>
              </div>
            </div>

            <div className="p-4 border border-slate-200 rounded-lg space-y-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Scale className="w-4 h-4 text-[#FF6B00]" /> Stock Adjustment Valuation Threshold
              </h3>
              <p className="text-xs text-slate-500">
                Stock shrinkage or recount adjustments above this total cost value will freeze until a manager approves.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  defaultValue={100}
                  className="w-24 text-xs p-2.5 border border-slate-300 rounded-lg font-bold"
                />
                <span className="text-xs text-slate-600">{vendor.currency} Value Threshold</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CUSTOM ROLE MODAL */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#FF6B00]" />
                <h3 className="text-base font-bold text-slate-800">Create Custom Role Template</h3>
              </div>
              <button onClick={() => setIsRoleModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Role Title *</label>
                <input
                  type="text"
                  required
                  value={newRoleName}
                  onChange={e => setNewRoleName(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none"
                  placeholder="e.g. Shift Supervisor / Head Auditor"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Role Description</label>
                <textarea
                  value={newRoleDescription}
                  onChange={e => setNewRoleDescription(e.target.value)}
                  rows={2}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none"
                  placeholder="Describe role responsibilities..."
                />
              </div>

              <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  id="newRoleApprove"
                  checked={newRoleCanApprove}
                  onChange={e => setNewRoleCanApprove(e.target.checked)}
                  className="w-4 h-4 text-[#FF6B00] rounded focus:ring-[#FF6B00]"
                />
                <label htmlFor="newRoleApprove" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Grant Approval Authority (Refunds & Stock Adjustments)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#FF6B00] hover:bg-orange-600 text-white rounded-lg text-xs font-bold shadow"
                >
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK STAFF CREATION MODAL */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#FF6B00]" />
                <h3 className="text-base font-bold text-slate-800">Add New Staff Account</h3>
              </div>
              <button onClick={() => setIsStaffModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={staffName}
                  onChange={e => setStaffName(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none"
                  placeholder="e.g. Jordan Miller"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={staffEmail}
                  onChange={e => setStaffEmail(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none"
                  placeholder="jordan.miller@itred.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Role</label>
                  <select
                    value={staffRole}
                    onChange={e => setStaffRole(e.target.value as StaffRole)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none bg-white"
                  >
                    {roles.map(r => (
                      <option key={r.roleKey} value={r.roleKey}>{r.roleName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Branch</label>
                  <select
                    value={staffAssignedBranch}
                    onChange={e => setStaffAssignedBranch(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] outline-none bg-white"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#FF6B00] hover:bg-orange-600 text-white rounded-lg text-xs font-bold shadow"
                >
                  Create Staff Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SAMPLE RECEIPT TEST MODAL */}
      {testReceiptOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#FF6B00]" /> Thermal Receipt Preview
              </h3>
              <button onClick={() => setTestReceiptOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Simulated Thermal Receipt Card */}
            <div className="bg-amber-50/50 border border-amber-200 p-4 font-mono text-xs text-slate-800 space-y-2 rounded shadow-inner">
              <div className="text-center space-y-1">
                <p className="font-bold text-sm">{vendor.businessName}</p>
                <p className="text-[10px] text-slate-600">{vendor.address}</p>
                <p className="text-[10px] text-slate-600">VAT Reg: {vendor.vatNumber || 'VAT-982173491-TX'}</p>
                <p className="text-[10px] font-bold text-orange-600">{receiptHeaderNotice}</p>
              </div>

              <div className="border-t border-b border-dashed border-slate-400 py-2 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>1x Wireless Ergonomic Mouse</span>
                  <span>$25.00</span>
                </div>
                <div className="flex justify-between">
                  <span>2x USB-C Fast Charger Cable</span>
                  <span>$24.00</span>
                </div>
              </div>

              <div className="space-y-1 text-right text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>$49.00</span>
                </div>
                <div className="flex justify-between">
                  <span>{taxName} ({vendor.taxRate}%):</span>
                  <span>${((49 * vendor.taxRate) / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-300">
                  <span>TOTAL PAID:</span>
                  <span>${(49 + (49 * vendor.taxRate) / 100).toFixed(2)}</span>
                </div>
              </div>

              <div className="text-center text-[10px] text-slate-500 pt-3 border-t border-dashed border-slate-300">
                <p>{receiptFooterText}</p>
                <p className="mt-1 text-[9px] font-mono">*** POS TEST PRINT COMPLETED ***</p>
              </div>
            </div>

            <button
              onClick={() => {
                window.print();
                setTestReceiptOpen(false);
              }}
              className="w-full py-2 bg-[#FF6B00] hover:bg-orange-600 text-white rounded text-xs font-bold flex items-center justify-center gap-2 shadow"
            >
              <Printer className="w-4 h-4" /> Trigger Browser Print
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
