import React from 'react';
import { StaffMember, AppMenuId, AppMenuDefinition, Branch, Terminal } from '../../types';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Warehouse, 
  ArrowLeftRight, 
  Store, 
  Package, 
  BarChart3, 
  CheckSquare, 
  Users, 
  BrainCircuit, 
  Clock, 
  ShieldCheck, 
  ArrowRight,
  Sparkles,
  Truck,
  Settings,
  CreditCard,
  Landmark,
  TableProperties,
  ClipboardCheck
} from 'lucide-react';

interface StaffDeskProps {
  staff: StaffMember;
  activeBranch: Branch | null;
  activeTerminal: Terminal | null;
  pendingApprovalsCount: number;
  onNavigate: (tab: string) => void;
}

const MENU_DEFINITIONS: Record<AppMenuId, AppMenuDefinition> = {
  desk: { id: 'desk', label: 'Staff Desk', description: 'Personal workspace & dashboard', category: 'operations' },
  pos: { id: 'pos', label: 'POS Register', description: 'Point of Sale retail terminal & checkout', category: 'operations' },
  delivery: { id: 'delivery', label: 'Delivery Logistics', description: 'Dispatch couriers & fleet management', category: 'operations' },
  warehouse: { id: 'warehouse', label: 'Central Warehouse', description: 'Supplier intake & central stock hub', category: 'inventory' },
  transfers: { id: 'transfers', label: 'Stock Transfers', description: 'Inter-branch stock movement logs', category: 'inventory' },
  branches: { id: 'branches', label: 'Branches & Terminals', description: 'Multi-store location & terminal config', category: 'management' },
  products: { id: 'products', label: 'Products Catalog', description: 'Master catalog & pricing setup', category: 'inventory' },
  stock_matrix: { id: 'stock_matrix', label: 'Stock by Cost Center', description: 'Warehouse and branch stock in one matrix', category: 'inventory' },
  managed_stocktake: { id: 'managed_stocktake', label: 'User Managed Stocktake', description: 'Select products and submit physical count adjustments', category: 'inventory' },
  purchase_orders: { id: 'purchase_orders', label: 'Purchase Orders', description: 'Plan and monitor supplier purchase orders', category: 'inventory' },
  customers: { id: 'customers', label: 'Customers', description: 'Customer profiles, accounts and purchase activity', category: 'management' },
  financial: { id: 'financial', label: 'Financial & Check Writer', description: 'Chart of accounts, protected COGS reserves & check writer', category: 'management' },
  reports: { id: 'reports', label: 'Sales & Reports', description: 'Financial analytics & order audits', category: 'management' },
  approvals: { id: 'approvals', label: 'Approvals & Workflows', description: 'Strict transaction review & authorization', category: 'governance' },
  staff: { id: 'staff', label: 'Staff & Roles', description: 'Sysadmin user permissions & desk config', category: 'governance' },
  bi_audit: { id: 'bi_audit', label: 'BI Engine & Logs', description: 'Background intelligence & decision logs', category: 'governance' },
  settings: { id: 'settings', label: 'POS Settings & Config', description: 'Business profile, hardware & role permissions', category: 'management' },
  billing: { id: 'billing', label: 'Vendor Billing & Subscriptions', description: 'Plan renewal, auto-invoices & organization services', category: 'management' },
};

const MENU_ICONS: Record<AppMenuId, React.ReactNode> = {
  desk: <LayoutDashboard className="w-5 h-5 text-[#FF6B00]" />,
  pos: <ShoppingCart className="w-5 h-5 text-[#FF6B00]" />,
  delivery: <Truck className="w-5 h-5 text-[#FF6B00]" />,
  warehouse: <Warehouse className="w-5 h-5 text-[#FF6B00]" />,
  transfers: <ArrowLeftRight className="w-5 h-5 text-[#FF6B00]" />,
  branches: <Store className="w-5 h-5 text-[#FF6B00]" />,
  products: <Package className="w-5 h-5 text-[#FF6B00]" />,
  stock_matrix: <TableProperties className="w-5 h-5 text-[#FF6B00]" />,
  managed_stocktake: <ClipboardCheck className="w-5 h-5 text-[#FF6B00]" />,
  purchase_orders: <ShoppingCart className="w-5 h-5 text-[#FF6B00]" />,
  customers: <Users className="w-5 h-5 text-[#FF6B00]" />,
  financial: <Landmark className="w-5 h-5 text-[#FF6B00]" />,
  reports: <BarChart3 className="w-5 h-5 text-[#FF6B00]" />,
  approvals: <CheckSquare className="w-5 h-5 text-[#FF6B00]" />,
  staff: <Users className="w-5 h-5 text-[#FF6B00]" />,
  bi_audit: <BrainCircuit className="w-5 h-5 text-[#FF6B00]" />,
  settings: <Settings className="w-5 h-5 text-[#FF6B00]" />,
  billing: <CreditCard className="w-5 h-5 text-[#FF6B00]" />,
};

export function StaffDesk({ staff, activeBranch, activeTerminal, pendingApprovalsCount, onNavigate }: StaffDeskProps) {
  const grantedMenus = staff.grantedMenuIds.map(id => MENU_DEFINITIONS[id]).filter(Boolean);

  return (
    <div className="space-y-6">
      
      {/* Staff Header Desk Banner */}
      <div className="bg-[#333333] text-white p-6 rounded-lg shadow-sm border-l-4 border-[#FF6B00] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FF6B00] text-white rounded-lg flex items-center justify-center font-bold text-lg shadow">
            {staff.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{staff.name}'s Desk</h1>
              <span className="px-2.5 py-0.5 bg-orange-500/20 text-[#FF6B00] border border-[#FF6B00]/40 rounded text-[10px] font-bold uppercase tracking-wider">
                {staff.role.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-gray-300 mt-1 flex items-center gap-2">
              <span>{staff.email}</span> â€¢ 
              <span className="text-gray-400">Location: {activeBranch?.name || 'Main HQ'} ({activeTerminal?.name || 'Terminal 01'})</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {pendingApprovalsCount > 0 && (staff.role === 'sysadmin' || staff.role === 'manager') && (
            <button
              onClick={() => onNavigate('approvals')}
              className="px-3 py-1.5 bg-orange-500/20 border border-[#FF6B00] text-white rounded text-xs font-bold flex items-center gap-2 hover:bg-[#FF6B00] transition-colors cursor-pointer"
            >
              <CheckSquare className="w-4 h-4 text-[#FF6B00]" />
              <span>{pendingApprovalsCount} Approvals Pending</span>
            </button>
          )}

          <div className="bg-white/10 px-3 py-1.5 rounded text-xs flex items-center gap-2 border border-white/10">
            <ShieldCheck className="w-4 h-4 text-green-400" />
            <span className="font-semibold text-gray-200">{grantedMenus.length} Menus Granted</span>
          </div>
        </div>
      </div>

      {/* Desk Feature Grid (Menus Granted by Sysadmin) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[#333333] uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#FF6B00]" />
            Your Authorized Workstations & Tools
          </h2>
          <span className="text-xs text-gray-400 font-medium">Configured by Sysadmin</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {grantedMenus.map(menu => {
            if (menu.id === 'desk') return null; // Skip desk itself inside desk grid
            return (
              <div
                key={menu.id}
                onClick={() => onNavigate(menu.id)}
                className="group bg-white p-5 rounded-lg border border-gray-100 shadow-sm hover:border-[#FF6B00] hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded bg-orange-50 group-hover:bg-[#FF6B00]/10 flex items-center justify-center transition-colors">
                      {MENU_ICONS[menu.id]}
                    </div>
                    {menu.id === 'approvals' && pendingApprovalsCount > 0 && (
                      <span className="bg-[#FF6B00] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                        {pendingApprovalsCount} Action Required
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-sm text-[#333333] group-hover:text-[#FF6B00] transition-colors">
                    {menu.label}
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {menu.description}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-gray-100 flex items-center justify-between text-xs font-bold text-[#FF6B00]">
                  <span>Open {menu.label}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Role Guidelines */}
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600 space-y-2">
        <div className="flex items-center gap-2 font-bold text-[#333333]">
          <Clock className="w-4 h-4 text-[#FF6B00]" />
          <span>System Security & Governance Status</span>
        </div>
        <p>
          All operations performed from your desk are tracked by the background Business Intelligence Engine. Critical operations like high-value inventory adjustments, supplier stock intakes, or discounts follow strict approval workflows.
        </p>
      </div>

    </div>
  );
}


