import React, { useState } from 'react';
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
  Settings,
  PlusCircle,
  Tv2,
  LogOut,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Sparkles,
  Building2,
  Truck,
  CreditCard,
  Landmark
} from 'lucide-react';
import { VendorProfile, Branch, Terminal, Warehouse, StaffMember, AppMenuId } from '../types';

interface SidebarProps {
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
  pendingApprovalsCount: number;
  onOpenSupplierReceiveModal: () => void;
  onOpenTransferModal: () => void;
  onOpenStockAdjustmentModal: () => void;
  onLogout: () => void;
}

interface MenuCategoryGroup {
  id: string;
  title: string;
  items: {
    id: AppMenuId;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }[];
}

const MENU_GROUPS: MenuCategoryGroup[] = [
  {
    id: 'sales_desk',
    title: 'Front Office & Sales',
    items: [
      { id: 'desk', label: 'Staff Desk', icon: <LayoutDashboard className="w-4 h-4" /> },
      { id: 'pos', label: 'POS Register', icon: <ShoppingCart className="w-4 h-4" /> },
      { id: 'customers', label: 'Customers & CRM', icon: <UserCheck className="w-4 h-4" /> },
      { id: 'delivery', label: 'Delivery Services', icon: <Truck className="w-4 h-4" /> },
    ]
  },
  {
    id: 'inventory_logistics',
    title: 'Inventory & Stock Logistics',
    items: [
      { id: 'warehouse', label: 'Warehouse Hub', icon: <WarehouseIcon className="w-4 h-4" /> },
      { id: 'transfers', label: 'Stock Transfers', icon: <ArrowLeftRight className="w-4 h-4" /> },
      { id: 'products', label: 'Products & Stocktake', icon: <Package className="w-4 h-4" />, badge: 'Cycle Audit' },
    ]
  },
  {
    id: 'store_branch',
    title: 'Store & Staff Operations',
    items: [
      { id: 'branches', label: 'Branches & Terminals', icon: <Store className="w-4 h-4" /> },
      { id: 'staff', label: 'Staff & Role Access', icon: <Users className="w-4 h-4" /> },
    ]
  },
  {
    id: 'bi_governance',
    title: 'BI, Governance & Finance',
    items: [
      { id: 'financial', label: 'Financial & Check Writer', icon: <Landmark className="w-4 h-4" /> },
      { id: 'reports', label: 'Sales & Analytics', icon: <BarChart3 className="w-4 h-4" /> },
      { id: 'approvals', label: 'Approvals Queue', icon: <CheckSquare className="w-4 h-4" /> },
      { id: 'bi_audit', label: 'BI Engine & Loss Audit', icon: <BrainCircuit className="w-4 h-4" /> },
      { id: 'billing', label: 'Billing & Invoices', icon: <CreditCard className="w-4 h-4" /> },
      { id: 'settings', label: 'POS Settings', icon: <Settings className="w-4 h-4" /> },
    ]
  }
];

export function getVisibleSidebarMenuIds(grantedMenuIds: AppMenuId[]): AppMenuId[] {
  return MENU_GROUPS.flatMap(group => group.items)
    .filter(item => grantedMenuIds.includes(item.id))
    .map(item => item.id);
}

export const Sidebar: React.FC<SidebarProps> = ({
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Single active expanded category group ID (others remain collapsed until evoked)
  const findGroupIdForTab = (tabId: AppMenuId): string => {
    const found = MENU_GROUPS.find(g => g.items.some(i => i.id === tabId));
    return found ? found.id : MENU_GROUPS[0].id;
  };

  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(() => findGroupIdForTab(activeTab));

  // Keep single active group open when activeTab changes
  React.useEffect(() => {
    const targetGroup = findGroupIdForTab(activeTab);
    setExpandedCategoryId(targetGroup);
  }, [activeTab]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategoryId(prev => prev === categoryId ? null : categoryId);
  };

  const branchTerminals = terminals.filter(t => activeBranch ? t.branchId === activeBranch.id : true);

  const renderNavContent = () => (
    <div className="flex flex-col h-full bg-[#1E1E1E] text-white">
      
      {/* Brand Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 bg-[#FF6B00] rounded-lg flex items-center justify-center font-bold text-white text-base shadow shrink-0">
            iT
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm tracking-tight text-white truncate">
                iTred <span className="text-[#FF6B00]">POS</span>
              </span>
              <span className="text-[10px] text-green-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-ping"></span>
                BI Active
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1 text-gray-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Active Branch & Terminal Selectors */}
      {!isCollapsed ? (
        <div className="p-3 border-b border-gray-800 space-y-2 bg-black/20">
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider flex items-center gap-1 mb-1">
              <Store className="w-3 h-3 text-[#FF6B00]" /> Active Branch
            </label>
            <select
              value={activeBranch?.id || ''}
              onChange={(e) => {
                const b = branches.find(br => br.id === e.target.value);
                if (b) setActiveBranch(b);
              }}
              className="w-full text-xs bg-[#2A2A2A] text-white border border-gray-700 rounded p-1.5 focus:ring-1 focus:ring-[#FF6B00] outline-none font-medium"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider flex items-center gap-1 mb-1">
              <Tv2 className="w-3 h-3 text-[#FF6B00]" /> Active Terminal
            </label>
            <select
              value={activeTerminal?.id || ''}
              onChange={(e) => {
                const t = branchTerminals.find(term => term.id === e.target.value);
                if (t) setActiveTerminal(t);
              }}
              className="w-full text-xs bg-[#2A2A2A] text-white border border-gray-700 rounded p-1.5 focus:ring-1 focus:ring-[#FF6B00] outline-none font-medium"
            >
              {branchTerminals.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="p-2 border-b border-gray-800 text-center">
          <Store className="w-5 h-5 text-[#FF6B00] mx-auto" title={activeBranch?.name || 'Branch'} />
        </div>
      )}

      {/* Navigation List grouped by Category with Expand/Collapse */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {MENU_GROUPS.map(group => {
          // Check if staff has permission for at least 1 item in group
          const visibleItems = group.items.filter(item => activeStaff.grantedMenuIds.includes(item.id));
          if (visibleItems.length === 0) return null;

          const isExpanded = expandedCategoryId === group.id;
          const isGroupCollapsed = !isExpanded;

          return (
            <div key={group.id} className="space-y-1">
              
              {/* Category Accordion Header */}
              {!isCollapsed ? (
                <button
                  type="button"
                  onClick={() => toggleCategory(group.id)}
                  className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors cursor-pointer"
                >
                  <span className="truncate">{group.title}</span>
                  <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${isGroupCollapsed ? '-rotate-90' : ''}`} />
                </button>
              ) : (
                <div className="w-full border-t border-gray-800 my-1" />
              )}

              {/* Group Items */}
              {(!isGroupCollapsed || isCollapsed) && (
                <div className="space-y-0.5">
                  {visibleItems.map(item => {
                    const isActive = activeTab === item.id;
                    const isApprovals = item.id === 'approvals';

                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all group relative ${
                          isActive
                            ? 'bg-[#FF6B00] text-white shadow-md font-bold'
                            : 'text-gray-300 hover:bg-white/10 hover:text-white'
                        }`}
                        title={isCollapsed ? item.label : undefined}
                      >
                        <span className={`shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-[#FF6B00]'}`}>
                          {item.icon}
                        </span>

                        {!isCollapsed && (
                          <span className="truncate flex-1 text-left">{item.label}</span>
                        )}

                        {!isCollapsed && item.badge && !isActive && (
                          <span className="px-1.5 py-0.2 text-[9px] font-extrabold uppercase bg-orange-500/20 text-[#FF6B00] border border-orange-500/30 rounded">
                            {item.badge}
                          </span>
                        )}

                        {isApprovals && pendingApprovalsCount > 0 && (
                          <span className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full animate-pulse ${
                            isActive ? 'bg-white text-[#FF6B00]' : 'bg-[#FF6B00] text-white'
                          }`}>
                            {pendingApprovalsCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

            </div>
          );
        })}
      </div>

      {/* Quick Action Shortcuts */}
      {!isCollapsed && (
        <div className="p-3 border-t border-gray-800 space-y-1.5 bg-black/20">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Quick Actions</p>
          
          {activeStaff.grantedMenuIds.includes('warehouse') && (
            <button
              onClick={onOpenSupplierReceiveModal}
              className="w-full text-left px-2.5 py-1.5 bg-white/5 hover:bg-[#FF6B00] text-gray-200 hover:text-white rounded text-[11px] font-medium transition flex items-center gap-2 border border-gray-800"
            >
              <PlusCircle className="w-3.5 h-3.5 text-[#FF6B00]" />
              <span>Supplier Intake</span>
            </button>
          )}

          {activeStaff.grantedMenuIds.includes('transfers') && (
            <button
              onClick={onOpenTransferModal}
              className="w-full text-left px-2.5 py-1.5 bg-white/5 hover:bg-[#FF6B00] text-gray-200 hover:text-white rounded text-[11px] font-medium transition flex items-center gap-2 border border-gray-800"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-[#FF6B00]" />
              <span>Stock Transfer</span>
            </button>
          )}

          {activeStaff.grantedMenuIds.includes('branches') && (
            <button
              onClick={onOpenStockAdjustmentModal}
              className="w-full text-left px-2.5 py-1.5 bg-white/5 hover:bg-[#FF6B00] text-gray-200 hover:text-white rounded text-[11px] font-medium transition flex items-center gap-2 border border-gray-800"
            >
              <Store className="w-3.5 h-3.5 text-[#FF6B00]" />
              <span>Stock Adjustment</span>
            </button>
          )}
        </div>
      )}

      {/* Staff Account & Logout Footer */}
      <div className="p-3 border-t border-gray-800 bg-[#161616]">
        {!isCollapsed ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <UserCheck className="w-4 h-4 text-[#FF6B00] shrink-0" />
                <div className="min-w-0">
                  <select
                    value={activeStaff.id}
                    onChange={(e) => {
                      const s = staffList.find(st => st.id === e.target.value);
                      if (s) onSwitchStaff(s);
                    }}
                    className="w-full bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer truncate"
                  >
                    {staffList.map(st => (
                      <option key={st.id} value={st.id} className="bg-[#333333] text-white">
                        {st.name} ({st.role})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">{activeStaff.role.replace('_', ' ')}</p>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded transition"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <button
              onClick={onLogout}
              className="p-1.5 text-gray-400 hover:text-red-400 rounded transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4 mx-auto" />
            </button>
          </div>
        )}
      </div>

    </div>
  );

  return (
    <>
      {/* Mobile Top Bar Trigger */}
      <div className="lg:hidden bg-[#1E1E1E] text-white p-3 flex items-center justify-between border-b border-gray-800 sticky top-0 z-30">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 bg-white/10 rounded text-gray-200 hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#FF6B00] rounded flex items-center justify-center font-bold text-white text-xs">
            iT
          </div>
          <span className="font-bold text-sm">iTred <span className="text-[#FF6B00]">POS</span></span>
        </div>

        <button
          onClick={onLogout}
          className="p-1.5 text-gray-400 hover:text-white"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile Slide-over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 max-w-full bg-[#1E1E1E] h-full shadow-2xl z-10">
            {renderNavContent()}
          </div>
        </div>
      )}

      {/* Desktop Sidebar Dock */}
      <aside className={`hidden lg:block shrink-0 transition-all duration-300 border-r border-gray-800 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}>
        <div className="sticky top-0 h-screen">
          {renderNavContent()}
        </div>
      </aside>
    </>
  );
};
