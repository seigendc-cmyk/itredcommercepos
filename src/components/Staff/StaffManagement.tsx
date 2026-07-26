import React, { useState } from 'react';
import { StaffMember, StaffRole, AppMenuId, Branch } from '../../types';
import { 
  Users, 
  Plus, 
  ShieldCheck, 
  Check, 
  X, 
  UserCheck, 
  CheckSquare, 
  Key, 
  Lock, 
  Sparkles,
  Store,
  Mail,
  Phone
} from 'lucide-react';

interface StaffManagementProps {
  vendorId: string;
  staffList: StaffMember[];
  branches: Branch[];
  activeStaff: StaffMember;
  onSwitchStaff: (staff: StaffMember) => void;
  onSaveStaff: (staffData: Partial<StaffMember>) => Promise<void>;
}

const ALL_MENUS: { id: AppMenuId; label: string; description: string }[] = [
  { id: 'desk', label: 'Staff Desk', description: 'Personalized dashboard' },
  { id: 'pos', label: 'POS Register', description: 'Retail terminal checkout' },
  { id: 'delivery', label: 'Delivery Services', description: 'Biker, car & van fleet appointment & dispatch' },
  { id: 'warehouse', label: 'Central Warehouse', description: 'Supplier stock intake & central hub' },
  { id: 'transfers', label: 'Stock Transfers', description: 'Warehouse-to-branch logistics' },
  { id: 'branches', label: 'Branches & Terminals', description: 'Branch store location setup' },
  { id: 'products', label: 'Products Catalog', description: 'Master product item list' },
  { id: 'financial', label: 'Financial & Check Writer', description: 'Chart of accounts, protected COGS reserves & check writer' },
  { id: 'reports', label: 'Sales & Reports', description: 'Order history & analytics' },
  { id: 'approvals', label: 'Approvals & Workflows', description: 'Strict transaction authorization' },
  { id: 'staff', label: 'Staff Management', description: 'Sysadmin user permissions & roles' },
  { id: 'bi_audit', label: 'BI Engine & Logs', description: 'Background intelligence audit logs' },
  { id: 'billing', label: 'Billing & Subscriptions', description: 'Vendor subscription plans, auto-invoices & services' },
  { id: 'settings', label: 'POS Settings & Hardware', description: 'Business profile, tax, hardware & roles' },
];

export function StaffManagement({
  vendorId,
  staffList,
  branches,
  activeStaff,
  onSwitchStaff,
  onSaveStaff,
}: StaffManagementProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>('cashier');
  const [assignedBranchId, setAssignedBranchId] = useState('');
  const [pinCode, setPinCode] = useState('1234');
  const [selectedMenus, setSelectedMenus] = useState<AppMenuId[]>(['desk', 'pos', 'reports']);

  const handleOpenAddModal = () => {
    setEditingStaff(null);
    setName('');
    setEmail('');
    setPhone('');
    setRole('cashier');
    setAssignedBranchId(branches[0]?.id || '');
    setPinCode('1234');
    setSelectedMenus(['desk', 'pos', 'reports']);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (staff: StaffMember) => {
    setEditingStaff(staff);
    setName(staff.name);
    setEmail(staff.email);
    setPhone(staff.phone || '');
    setRole(staff.role);
    setAssignedBranchId(staff.assignedBranchId || '');
    setPinCode(staff.pinCode || '1234');
    setSelectedMenus([...staff.grantedMenuIds]);
    setIsModalOpen(true);
  };

  const handleRoleChange = (newRole: StaffRole) => {
    setRole(newRole);
    // Apply default presets for the role
    if (newRole === 'sysadmin') {
      setSelectedMenus(ALL_MENUS.map(m => m.id));
    } else if (newRole === 'manager') {
      setSelectedMenus(['desk', 'pos', 'warehouse', 'transfers', 'branches', 'products', 'reports', 'approvals']);
    } else if (newRole === 'cashier') {
      setSelectedMenus(['desk', 'pos', 'reports']);
    } else if (newRole === 'warehouse_staff') {
      setSelectedMenus(['desk', 'warehouse', 'transfers', 'products', 'approvals']);
    }
  };

  const toggleMenuPermission = (menuId: AppMenuId) => {
    if (selectedMenus.includes(menuId)) {
      setSelectedMenus(selectedMenus.filter(m => m !== menuId));
    } else {
      setSelectedMenus([...selectedMenus, menuId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) {
      alert('Please fill in required fields.');
      return;
    }

    const assignedBranch = branches.find(b => b.id === assignedBranchId);

    await onSaveStaff({
      id: editingStaff?.id,
      vendorId,
      name,
      email,
      phone,
      role,
      assignedBranchId,
      assignedBranchName: assignedBranch?.name,
      grantedMenuIds: selectedMenus.length > 0 ? selectedMenus : ['desk'],
      status: 'active',
      pinCode: pinCode || '1234',
    });

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#FF6B00]" />
            <h1 className="text-lg font-bold text-[#333333]">Staff & Permissions Management</h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Sysadmin control panel to provision staff accounts and customize individual desk menu access.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2 bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold text-xs rounded-lg shadow flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Staff Member</span>
        </button>
      </div>

      {/* Profile Switcher Quick Bar */}
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#FF6B00]" />
            <span className="text-xs font-bold text-[#333333] uppercase tracking-wider">Active Staff Desk Switcher</span>
          </div>
          <span className="text-[11px] text-gray-500 font-medium">Click to simulate operating as a staff member</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {staffList.map(s => {
            const isCurrent = activeStaff.id === s.id;
            return (
              <div
                key={s.id}
                onClick={() => onSwitchStaff(s)}
                className={`p-3 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                  isCurrent
                    ? 'bg-white border-[#FF6B00] shadow-sm ring-1 ring-[#FF6B00]/30'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div>
                  <p className="font-bold text-[#333333] flex items-center gap-1.5">
                    {s.name}
                    {isCurrent && <span className="w-2 h-2 rounded-full bg-[#FF6B00]"></span>}
                  </p>
                  <p className="text-[10px] text-gray-500 capitalize">{s.role.replace('_', ' ')} • {s.grantedMenuIds.length} Menus</p>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isCurrent ? 'bg-orange-50 text-[#FF6B00]' : 'bg-gray-100 text-gray-600'
                }`}>
                  {isCurrent ? 'Active' : 'Switch'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xs font-bold text-[#333333] uppercase tracking-wider">Staff Accounts & Menu Grants</h2>
          <span className="text-xs font-medium text-gray-400">{staffList.length} Active Staff</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Staff Name & Contact</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Assigned Location</th>
                <th className="py-3 px-4">Granted Menus</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staffList.map(s => (
                <tr key={s.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="py-3 px-4">
                    <p className="font-bold text-[#333333]">{s.name}</p>
                    <p className="text-[11px] text-gray-400 flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {s.email}</span>
                      {s.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {s.phone}</span>}
                      <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 border border-slate-200">
                        <Lock className="w-2.5 h-2.5 text-[#FF6B00]" /> PIN: {s.pinCode || '1234'}
                      </span>
                    </p>
                  </td>

                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      s.role === 'sysadmin' 
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : s.role === 'manager'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : s.role === 'warehouse_staff'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-green-50 text-green-700 border border-green-200'
                    }`}>
                      {s.role.replace('_', ' ')}
                    </span>
                  </td>

                  <td className="py-3 px-4 font-medium text-gray-700">
                    {s.assignedBranchName || 'All Outlets (HQ)'}
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1 max-w-md">
                      {s.grantedMenuIds.map(mId => (
                        <span key={mId} className="bg-gray-100 text-gray-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                          {mId}
                        </span>
                      ))}
                    </div>
                  </td>

                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      onClick={() => handleOpenEditModal(s)}
                      className="px-2.5 py-1 text-xs font-bold text-[#FF6B00] hover:bg-orange-50 rounded transition-colors cursor-pointer"
                    >
                      Edit Grants
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Staff Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-xl rounded-lg shadow-xl border border-gray-100 p-6 space-y-5">
            
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#FF6B00]" />
                <h3 className="font-bold text-sm text-[#333333]">
                  {editingStaff ? `Modify Grants: ${editingStaff.name}` : 'Provision Staff Account'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. David Miller"
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-[#FF6B00] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="e.g. david@itred-retail.com"
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-[#FF6B00] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Staff System Role</label>
                  <select
                    value={role}
                    onChange={e => handleRoleChange(e.target.value as StaffRole)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-[#FF6B00] focus:outline-none bg-white font-medium"
                  >
                    <option value="cashier">Cashier</option>
                    <option value="warehouse_staff">Warehouse Officer</option>
                    <option value="manager">Store Manager</option>
                    <option value="sysadmin">System Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Assigned Branch Outlet</label>
                  <select
                    value={assignedBranchId}
                    onChange={e => setAssignedBranchId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-[#FF6B00] focus:outline-none bg-white font-medium"
                  >
                    <option value="">All Branches / Central HQ</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-[#FF6B00]" /> Access PIN (4-6 Digits)
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={pinCode}
                    onChange={e => setPinCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 1234"
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-[#FF6B00] focus:outline-none font-mono font-bold"
                  />
                </div>
              </div>

              {/* Individual Menu Grant Checks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-[#333333] uppercase tracking-wider flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-[#FF6B00]" />
                    Granted Desk Menus & Access Modules
                  </label>
                  <span className="text-[10px] text-gray-400">Sysadmin Permission Toggles</span>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded border border-gray-200 max-h-48 overflow-y-auto">
                  {ALL_MENUS.map(m => {
                    const isChecked = selectedMenus.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        onClick={() => toggleMenuPermission(m.id)}
                        className={`flex items-start gap-2 p-2 rounded border text-xs cursor-pointer select-none transition-colors ${
                          isChecked
                            ? 'bg-white border-[#FF6B00] shadow-xs'
                            : 'bg-white/50 border-gray-200 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent container click
                          className="mt-0.5 rounded text-[#FF6B00] focus:ring-[#FF6B00]"
                        />
                        <div>
                          <p className="font-bold text-[#333333]">{m.label}</p>
                          <p className="text-[10px] text-gray-500 leading-snug">{m.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-600 font-bold text-xs rounded transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold text-xs rounded shadow transition-colors cursor-pointer"
                >
                  Save Staff & Permissions
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
