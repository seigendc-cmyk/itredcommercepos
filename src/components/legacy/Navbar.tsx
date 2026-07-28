import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Warehouse as WarehouseIcon,
  ArrowLeftRight,
  Store,
  Package,
  BarChart3,
  CheckSquare,
  Users,
  BrainCircuit,
  PlusCircle,
  Tv2,
  LogOut,
  UserCheck,
  Truck,
  Settings,
  CreditCard,
  Landmark
} from 'lucide-react';
import { VendorProfile, Branch, Terminal, Warehouse, StaffMember, AppMenuId } from '../../types';

interface NavbarProps {
  vendor: VendorProfile;
  activeStaff: StaffMember;
  staffList: StaffMember[];
  onSwitchStaff: (staff: StaffMember) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  branches: Branch[];
  activeBranch: Branch | null;
  setActiveBranch: (branch: Branch) => void;
  terminals: Terminal[];
  activeTerminal: Terminal | null;
  setActiveTerminal: (terminal: Terminal) => void;
  warehouses: Warehouse[];
  pendingApprovalsCount: number;
  onOpenSupplierReceiveModal: () => void;
  onOpenTransferModal: () => void;
  onOpenStockAdjustmentModal: () => void;
  onLogout: () => void;
}

const TAB_CONFIG: Record<AppMenuId, { label: string; icon: React.ReactNode }> = {
  desk: { label: 'Staff Desk', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  pos: { label: 'POS Register', icon: <ShoppingCart className="w-3.5 h-3.5" /> },
  delivery: { label: 'Delivery Fleet', icon: <Truck className="w-3.5 h-3.5" /> },
  warehouse: { label: 'Warehouse', icon: <WarehouseIcon className="w-3.5 h-3.5" /> },
  transfers: { label: 'Transfers', icon: <ArrowLeftRight className="w-3.5 h-3.5" /> },
  branches: { label: 'Branches', icon: <Store className="w-3.5 h-3.5" /> },
  products: { label: 'Products', icon: <Package className="w-3.5 h-3.5" /> },
  customers: { label: 'Customers', icon: <UserCheck className="w-3.5 h-3.5" /> },
  financial: { label: 'Financial', icon: <Landmark className="w-3.5 h-3.5" /> },
  reports: { label: 'Reports', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  approvals: { label: 'Approvals', icon: <CheckSquare className="w-3.5 h-3.5" /> },
  staff: { label: 'Staff & Roles', icon: <Users className="w-3.5 h-3.5" /> },
  bi_audit: { label: 'BI Engine', icon: <BrainCircuit className="w-3.5 h-3.5" /> },
  billing: { label: 'Billing', icon: <CreditCard className="w-3.5 h-3.5" /> },
  settings: { label: 'Settings', icon: <Settings className="w-3.5 h-3.5" /> },
};

export const Navbar: React.FC<NavbarProps> = ({
  vendor,
  activeStaff,
  staffList,
  onSwitchStaff,
  activeTab,
  setActiveTab,
  branches,
  activeBranch,
  setActiveBranch,
  terminals,
  activeTerminal,
  setActiveTerminal,
  pendingApprovalsCount,
  onOpenSupplierReceiveModal,
  onOpenTransferModal,
  onOpenStockAdjustmentModal,
  onLogout
}) => {
  const branchTerminals = terminals.filter(t => activeBranch ? t.branchId === activeBranch.id : true);

  return (
    <header className="sticky top-0 z-40 bg-[#333333] text-white shadow-md border-b border-gray-700">
      {/* Header Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 bg-[#FF6B00] rounded flex items-center justify-center font-bold text-white text-sm shadow">
              iT
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-base sm:text-lg tracking-tight">
                iTred <span className="text-[#FF6B00]">POS</span>
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded uppercase tracking-wider border border-green-500/30">
                BI System Active
              </span>
            </div>
          </div>

          {/* Active Location & Terminal Switcher */}
          <div className="hidden lg:flex items-center gap-2 bg-black/20 border border-gray-700 rounded-lg p-1">
            {/* Branch Selector */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded text-xs font-medium">
              <Store className="w-3.5 h-3.5 text-[#FF6B00]" />
              <span className="text-gray-400">Branch:</span>
              <select
                value={activeBranch?.id || ''}
                onChange={(e) => {
                  const b = branches.find(br => br.id === e.target.value);
                  if (b) setActiveBranch(b);
                }}
                className="bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer pr-1"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id} className="bg-[#333333] text-white">
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Terminal Selector */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded text-xs font-medium">
              <Tv2 className="w-3.5 h-3.5 text-[#FF6B00]" />
              <span className="text-gray-400">Terminal:</span>
              <select
                value={activeTerminal?.id || ''}
                onChange={(e) => {
                  const t = branchTerminals.find(term => term.id === e.target.value);
                  if (t) setActiveTerminal(t);
                }}
                className="bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer pr-1"
              >
                {branchTerminals.map(t => (
                  <option key={t.id} value={t.id} className="bg-[#333333] text-white">
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Staff Switcher Dropdown */}
          <div className="flex items-center gap-2 bg-black/20 border border-gray-700 rounded-lg p-1">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded text-xs font-medium">
              <UserCheck className="w-3.5 h-3.5 text-[#FF6B00]" />
              <span className="text-gray-400 hidden sm:inline">Staff:</span>
              <select
                value={activeStaff.id}
                onChange={(e) => {
                  const s = staffList.find(st => st.id === e.target.value);
                  if (s) onSwitchStaff(s);
                }}
                className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer pr-1"
              >
                {staffList.map(st => (
                  <option key={st.id} value={st.id} className="bg-[#333333] text-white">
                    {st.name} ({st.role.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            <div className="hidden xl:flex items-center gap-2">
              {activeStaff.grantedMenuIds.includes('warehouse') && (
                <button
                  onClick={onOpenSupplierReceiveModal}
                  className="px-3 py-1.5 bg-white/10 hover:bg-[#FF6B00] text-white rounded text-xs font-medium transition-colors flex items-center gap-1.5 border border-gray-600"
                  title="Receive Stock from Supplier"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-[#FF6B00]" />
                  <span>Supplier Intake</span>
                </button>
              )}

              {activeStaff.grantedMenuIds.includes('transfers') && (
                <button
                  onClick={onOpenTransferModal}
                  className="px-3 py-1.5 bg-white/10 hover:bg-[#FF6B00] text-white rounded text-xs font-medium transition-colors flex items-center gap-1.5 border border-gray-600"
                  title="Transfer Stock between Warehouse and Branch"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-[#FF6B00]" />
                  <span>Transfers</span>
                </button>
              )}

              {activeStaff.grantedMenuIds.includes('branches') && (
                <button
                  onClick={onOpenStockAdjustmentModal}
                  className="px-3 py-1.5 bg-[#FF6B00] hover:bg-[#e66000] text-white rounded text-xs font-bold transition-colors flex items-center gap-1.5 shadow"
                  title="Adjust Branch Inventory"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Stock Adj.</span>
                </button>
              )}
            </div>

            {/* Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-gray-700">
              <button
                onClick={onLogout}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>

        {/* Dynamic Navigation Tabs Bar (FILTERED STRICTLY BY SYSADMIN GRANTED MENUS) */}
        <nav className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-none text-xs font-medium border-t border-gray-700 pt-2">
          {activeStaff.grantedMenuIds.map(menuId => {
            const cfg = TAB_CONFIG[menuId];
            if (!cfg) return null;

            const isActive = activeTab === menuId;
            const isApprovals = menuId === 'approvals';

            return (
              <button
                key={menuId}
                onClick={() => setActiveTab(menuId)}
                className={`px-3 py-1.5 rounded flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer relative ${
                  isActive
                    ? 'bg-[#FF6B00]/20 text-[#FF6B00] font-bold border-b-2 border-[#FF6B00]'
                    : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {cfg.icon}
                <span>{cfg.label}</span>

                {isApprovals && pendingApprovalsCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-[#FF6B00] text-white text-[10px] font-bold rounded-full animate-pulse">
                    {pendingApprovalsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

      </div>
    </header>
  );
};

