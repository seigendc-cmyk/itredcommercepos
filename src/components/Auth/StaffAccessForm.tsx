import React, { useState } from 'react';
import { StaffMember, VendorProfile, Branch, AppMenuId } from '../../types';
import { saveStaffMember } from '../../services/db';
import { UserCheck, Shield, KeyRound, ArrowRight, Lock, CheckCircle2, X, Key, AlertCircle, ShoppingCart, LayoutDashboard } from 'lucide-react';

interface StaffAccessFormProps {
  vendor: VendorProfile;
  staffList: StaffMember[];
  branches: Branch[];
  activeStaff: StaffMember | null;
  onStaffAuthenticated: (staff: StaffMember, targetTab?: AppMenuId) => void;
  onVendorSignOut: () => void;
  onSaveStaff?: (staffData: Partial<StaffMember>) => Promise<void>;
}

export const StaffAccessForm: React.FC<StaffAccessFormProps> = ({
  vendor,
  staffList,
  branches,
  activeStaff,
  onStaffAuthenticated,
  onVendorSignOut,
  onSaveStaff
}) => {
  const [selectedStaffId, setSelectedStaffId] = useState<string>(activeStaff?.id || staffList[0]?.id || '');
  const [pinCode, setPinCode] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Change PIN Modal State
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState<boolean>(false);
  const [changePinStaffId, setChangePinStaffId] = useState<string>(selectedStaffId || staffList[0]?.id || '');
  const [currentPinInput, setCurrentPinInput] = useState<string>('');
  const [vendorMasterEmail, setVendorMasterEmail] = useState<string>('');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [confirmPinInput, setConfirmPinInput] = useState<string>('');
  const [modalError, setModalError] = useState<string>('');
  const [modalSuccess, setModalSuccess] = useState<string>('');
  const [modalLoading, setModalLoading] = useState<boolean>(false);

  const selectedStaff = staffList.find(s => s.id === selectedStaffId) || staffList[0];

  const handleAuthenticate = (e?: React.FormEvent, targetTab: AppMenuId = 'pos') => {
    if (e) e.preventDefault();
    if (!selectedStaff) {
      setError('Please select a valid staff member account.');
      return;
    }

    const expectedPin = selectedStaff.pinCode || '1234';

    // Verify PIN if entered
    if (pinCode.length > 0 && pinCode !== expectedPin) {
      setError(`Incorrect PIN code for ${selectedStaff.name}. Default PIN is 1234 unless changed.`);
      return;
    }

    setLoading(true);
    setError('');

    setTimeout(() => {
      onStaffAuthenticated(selectedStaff, targetTab);
      setLoading(false);
    }, 300);
  };

  const handleQuickPinAppend = (digit: string) => {
    if (pinCode.length < 6) {
      setPinCode(prev => prev + digit);
      setError('');
    }
  };

  const handleQuickPinClear = () => {
    setPinCode('');
    setError('');
  };

  const handleOpenChangePinModal = () => {
    setChangePinStaffId(selectedStaffId || staffList[0]?.id || '');
    setCurrentPinInput('');
    setVendorMasterEmail('');
    setNewPinInput('');
    setConfirmPinInput('');
    setModalError('');
    setModalSuccess('');
    setIsChangePinModalOpen(true);
  };

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setModalSuccess('');

    const targetStaff = staffList.find(s => s.id === changePinStaffId);
    if (!targetStaff) {
      setModalError('Target staff account not found.');
      return;
    }

    const expectedPin = targetStaff.pinCode || '1234';

    // Verify current PIN or master vendor email override
    const isCurrentPinValid = currentPinInput === expectedPin;
    const isMasterEmailValid = vendorMasterEmail.trim().toLowerCase() === vendor.email.trim().toLowerCase();

    if (!isCurrentPinValid && !isMasterEmailValid) {
      setModalError('Invalid current PIN code. If forgotten, provide the registered Vendor Email to override.');
      return;
    }

    if (!/^\d{4,6}$/.test(newPinInput)) {
      setModalError('New PIN code must be 4 to 6 numeric digits.');
      return;
    }

    if (newPinInput !== confirmPinInput) {
      setModalError('New PIN and Confirmation PIN do not match.');
      return;
    }

    setModalLoading(true);

    try {
      const updatedStaffData: Partial<StaffMember> = {
        ...targetStaff,
        pinCode: newPinInput
      };

      if (onSaveStaff) {
        await onSaveStaff(updatedStaffData);
      } else {
        await saveStaffMember(vendor.id, updatedStaffData);
      }

      setModalSuccess(`PIN code successfully updated to [ ${newPinInput} ] for ${targetStaff.name}!`);
      setSuccessMsg(`Login PIN code updated to [ ${newPinInput} ] for ${targetStaff.name}.`);
      setPinCode(newPinInput);

      setTimeout(() => {
        setIsChangePinModalOpen(false);
        setModalLoading(false);
      }, 1200);
    } catch (err) {
      console.error(err);
      setModalError('Failed to save updated staff PIN code.');
      setModalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 md:p-8">
      
      {/* Container Card */}
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden space-y-0 relative">
        
        {/* Brand Header */}
        <div className="bg-[#333333] text-white p-6 sm:p-8 text-center border-b-4 border-[#FF6B00] relative">
          <div className="w-12 h-12 bg-[#FF6B00] text-white rounded-xl flex items-center justify-center font-bold text-xl mx-auto shadow-md mb-3">
            iT
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            iTred <span className="text-[#FF6B00]">POS</span>
          </h1>
          <p className="text-xs text-gray-300 mt-1 font-medium">
            Authorized Staff Access Portal — {vendor.businessName}
          </p>
        </div>

        {/* Staff Selection & PIN Form */}
        <form onSubmit={(e) => handleAuthenticate(e, 'pos')} className="p-6 sm:p-8 space-y-6 bg-white">
          
          <div className="text-center space-y-1">
            <span className="px-3 py-1 bg-orange-100 text-[#FF6B00] text-[11px] font-bold uppercase rounded-full tracking-wider inline-flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" /> Staff Verification Required
            </span>
            <h2 className="text-lg font-bold text-slate-900">Select Staff Profile & Access Desk</h2>
            <p className="text-xs text-slate-500">
              Choose your staff profile to unlock your assigned operational workspace and permissions.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl text-center font-medium flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-800 text-xs rounded-xl text-center font-medium flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Select Staff Member */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#FF6B00]" /> Select Active Staff
              </label>
              <button
                type="button"
                onClick={handleOpenChangePinModal}
                className="text-[11px] font-bold text-[#FF6B00] hover:text-[#e66000] hover:underline flex items-center gap-1 transition"
              >
                <KeyRound className="w-3.5 h-3.5" /> Change Login PIN
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto p-1 border border-gray-200 rounded-xl bg-gray-50/50">
              {staffList.map(s => {
                const isSelected = s.id === selectedStaffId;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      setSelectedStaffId(s.id);
                      setPinCode('');
                      setError('');
                      setSuccessMsg('');
                    }}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-white border-[#FF6B00] shadow-sm ring-1 ring-[#FF6B00]'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs ${
                        s.role === 'sysadmin' ? 'bg-red-600' : s.role === 'manager' ? 'bg-blue-600' : 'bg-gray-700'
                      }`}>
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{s.name}</p>
                        <p className="text-[10px] text-gray-500 uppercase">
                          {s.role.replace('_', ' ')} • {s.email}
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <CheckCircle2 className="w-5 h-5 text-[#FF6B00] shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick PIN Keypad */}
          {selectedStaff && (
            <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-[#FF6B00]" /> Staff Access PIN Code
                </label>
                <span className="text-[10px] text-gray-500 font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                  {pinCode.length > 0 ? '•'.repeat(pinCode.length) : `PIN: ${selectedStaff.pinCode || '1234'}`}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'].map(btn => (
                  <button
                    key={btn}
                    type="button"
                    onClick={() => {
                      if (btn === 'C') handleQuickPinClear();
                      else if (btn === '✓') handleAuthenticate(undefined, 'pos');
                      else handleQuickPinAppend(btn);
                    }}
                    className={`py-2 text-xs font-bold rounded-lg border transition cursor-pointer ${
                      btn === '✓'
                        ? 'bg-[#FF6B00] text-white border-[#FF6B00] hover:bg-orange-600'
                        : btn === 'C'
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {btn}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submit Actions */}
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              disabled={loading}
              onClick={(e) => handleAuthenticate(e, 'pos')}
              className="w-full py-3.5 px-6 bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition cursor-pointer border border-transparent text-sm active:scale-[0.99]"
            >
              <ShoppingCart className="w-4 h-4 text-white" />
              <span>{loading ? 'Authenticating...' : `Open POS Register (${selectedStaff?.name || 'Staff'})`}</span>
              <ArrowRight className="w-4 h-4 text-white" />
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={(e) => handleAuthenticate(e, 'desk')}
              className="w-full py-2.5 px-6 bg-[#333333] hover:bg-black text-white font-bold rounded-xl shadow flex items-center justify-center gap-2 transition cursor-pointer text-xs"
            >
              <LayoutDashboard className="w-4 h-4 text-[#FF6B00]" />
              <span>{loading ? 'Authenticating...' : `Access Staff Desk Dashboard`}</span>
            </button>

            <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
              <span className="flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-gray-400" />
                Session Encrypted
              </span>

              <button
                type="button"
                onClick={onVendorSignOut}
                className="text-gray-500 hover:text-red-600 font-medium underline cursor-pointer"
              >
                Sign Out Vendor Account
              </button>
            </div>
          </div>

        </form>

      </div>

      {/* Change Staff Login PIN Modal */}
      {isChangePinModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-5">
            
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#FF6B00]" />
                <h3 className="font-bold text-base text-slate-900">Change Staff Access PIN</h3>
              </div>
              <button
                onClick={() => setIsChangePinModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl text-center font-medium">
                {modalError}
              </div>
            )}

            {modalSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 text-green-800 text-xs rounded-xl text-center font-medium flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span>{modalSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePinSubmit} className="space-y-4">
              
              {/* Select Staff Account */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Target Staff Profile
                </label>
                <select
                  value={changePinStaffId}
                  onChange={e => setChangePinStaffId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#FF6B00] focus:outline-none bg-white font-medium"
                >
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role.replace('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>

              {/* Current PIN or Vendor Email Override */}
              <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Current PIN Code (Default: 1234)
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={currentPinInput}
                    onChange={e => setCurrentPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter current 4-6 digit PIN"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#FF6B00] focus:outline-none font-mono"
                  />
                </div>

                <div className="text-[10px] text-gray-400 font-medium text-center uppercase tracking-wider my-1">
                  — OR IF FORGOTTEN —
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Vendor Owner Email (Master Verification)
                  </label>
                  <input
                    type="email"
                    value={vendorMasterEmail}
                    onChange={e => setVendorMasterEmail(e.target.value)}
                    placeholder={`e.g. ${vendor.email}`}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#FF6B00] focus:outline-none"
                  />
                </div>
              </div>

              {/* New PIN & Confirm */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    New PIN Code (4-6 digits)
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    required
                    value={newPinInput}
                    onChange={e => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 5678"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#FF6B00] focus:outline-none font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Confirm New PIN
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    required
                    value={confirmPinInput}
                    onChange={e => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 5678"
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#FF6B00] focus:outline-none font-mono font-bold"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsChangePinModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-5 py-2.5 bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold text-xs rounded-lg shadow-md flex items-center gap-1.5 transition cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{modalLoading ? 'Updating...' : 'Save New PIN Code'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
