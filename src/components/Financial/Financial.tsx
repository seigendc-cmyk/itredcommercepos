import React, { useState, useEffect } from 'react';
import { 
  VendorProfile, 
  ChartOfAccount, 
  IssuedCheck, 
  AccountType, 
  StaffMember 
} from '../../types';
import { 
  fetchChartOfAccounts, 
  saveChartOfAccount, 
  fetchIssuedChecks, 
  createIssuedCheck, 
  updateCheckStatus 
} from '../../services/db';
import { 
  Landmark, 
  PlusCircle, 
  Printer, 
  ShieldCheck, 
  Wallet, 
  DollarSign, 
  CheckCircle2, 
  X, 
  Search, 
  Filter, 
  FileText, 
  Lock, 
  Building2, 
  AlertCircle,
  HelpCircle,
  ArrowUpRight,
  TrendingUp,
  RefreshCw
} from 'lucide-react';

interface FinancialProps {
  vendor: VendorProfile;
  activeStaff: StaffMember;
}

function numberToWords(amount: number): string {
  if (isNaN(amount) || amount <= 0) return 'Zero Dollars and 00/100';
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  const dollars = Math.floor(amount);
  const cents = Math.round((amount - dollars) * 100);

  function convertGroup(n: number): string {
    let str = '';
    if (n >= 100) {
      str += units[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + (n % 10 ? ' ' + units[n % 10] : '');
    } else if (n > 0) {
      str += units[n];
    }
    return str.trim();
  }

  let result = '';
  if (dollars >= 1000000) {
    const millions = Math.floor(dollars / 1000000);
    result += convertGroup(millions) + ' Million ';
    const remainder = dollars % 1000000;
    if (remainder >= 1000) {
      const thousands = Math.floor(remainder / 1000);
      result += convertGroup(thousands) + ' Thousand ';
      const hundreds = remainder % 1000;
      if (hundreds > 0) result += convertGroup(hundreds) + ' ';
    } else if (remainder > 0) {
      result += convertGroup(remainder) + ' ';
    }
  } else if (dollars >= 1000) {
    const thousands = Math.floor(dollars / 1000);
    result += convertGroup(thousands) + ' Thousand ';
    const hundreds = dollars % 1000;
    if (hundreds > 0) result += convertGroup(hundreds) + ' ';
  } else {
    result = convertGroup(dollars) + ' ';
  }

  const centsStr = cents.toString().padStart(2, '0');
  return `${result.trim()} Dollars and ${centsStr}/100`;
}

export const Financial: React.FC<FinancialProps> = ({ vendor, activeStaff }) => {
  const [activeTab, setActiveTab] = useState<'coa' | 'check_writer' | 'check_register' | 'cogs_protection'>('coa');
  
  // Data States
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [checks, setChecks] = useState<IssuedCheck[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters & Search
  const [coaSearch, setCoaSearch] = useState<string>('');
  const [coaTypeFilter, setCoaTypeFilter] = useState<string>('ALL');

  // Modal States
  const [isAddAccountOpen, setIsAddAccountOpen] = useState<boolean>(false);
  const [selectedCheckForPrint, setSelectedCheckForPrint] = useState<IssuedCheck | null>(null);

  // COA Form State
  const [newAccountCode, setNewAccountCode] = useState<string>('');
  const [newAccountName, setNewAccountName] = useState<string>('');
  const [newAccountType, setNewAccountType] = useState<AccountType>('asset');
  const [newCategory, setNewCategory] = useState<string>('Current Assets');
  const [newBalance, setNewBalance] = useState<number>(0);
  const [newDescription, setNewDescription] = useState<string>('');
  const [isBankOrCash, setIsBankOrCash] = useState<boolean>(false);
  const [isCogsReserve, setIsCogsReserve] = useState<boolean>(false);
  const [bankName, setBankName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [routingNumber, setRoutingNumber] = useState<string>('');

  // Check Writer Form State
  const [checkSourceAccountId, setCheckSourceAccountId] = useState<string>('');
  const [checkPayeeName, setCheckPayeeName] = useState<string>('');
  const [checkAmount, setCheckAmount] = useState<string>('');
  const [checkAmountInWords, setCheckAmountInWords] = useState<string>('');
  const [checkDate, setCheckDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [checkMemo, setCheckMemo] = useState<string>('');
  const [checkCategoryAccountId, setCheckCategoryAccountId] = useState<string>('');
  const [checkNumber, setCheckNumber] = useState<string>('CHK-1003');
  const [checkAuthorizedBy, setCheckAuthorizedBy] = useState<string>(activeStaff?.name || 'Chief Financial Officer');

  // Success Message
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Load Data
  const loadFinancialData = async () => {
    setLoading(true);
    try {
      const coaList = await fetchChartOfAccounts(vendor.id);
      const checkList = await fetchIssuedChecks(vendor.id);
      setAccounts(coaList);
      setChecks(checkList);

      // Default Check Source Account to Main Cashbook or COGS Reserve
      const mainBank = coaList.find(a => a.accountName.toLowerCase().includes('main cashbook')) || coaList.find(a => a.isBankOrCash);
      if (mainBank && !checkSourceAccountId) {
        setCheckSourceAccountId(mainBank.id);
      }

      // Default Check Category to Accounts Payable
      const apAccount = coaList.find(a => a.accountType === 'liability' || a.accountName.toLowerCase().includes('payable'));
      if (apAccount && !checkCategoryAccountId) {
        setCheckCategoryAccountId(apAccount.id);
      }

      // Set Check Number
      const nextNum = checkList.length + 1001;
      setCheckNumber(`CHK-${nextNum}`);

    } catch (err) {
      console.error('Error loading financial data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinancialData();
  }, [vendor.id]);

  // Update Amount in Words when Check Amount changes
  useEffect(() => {
    const num = parseFloat(checkAmount);
    if (!isNaN(num) && num > 0) {
      setCheckAmountInWords(numberToWords(num));
    } else {
      setCheckAmountInWords('');
    }
  }, [checkAmount]);

  // Calculate Key Financial Metrics
  const bankAndCashAccounts = accounts.filter(a => a.isBankOrCash);
  const totalLiquidity = bankAndCashAccounts.reduce((acc, a) => acc + a.balance, 0);

  const cashDrawerAcc = accounts.find(a => a.accountName.toLowerCase().includes('cash drawer') || a.accountCode === '1010');
  const cogsReserveAcc = accounts.find(a => a.isCOGSReserve || a.accountCode === '1020');
  const mainCashbookAcc = accounts.find(a => a.accountName.toLowerCase().includes('main cashbook') || a.accountCode === '1000');
  const accountsPayableAcc = accounts.find(a => a.accountType === 'liability');

  // Handle Save New COA Account
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountCode || !newAccountName) return;

    try {
      await saveChartOfAccount(vendor.id, {
        accountCode: newAccountCode,
        accountName: newAccountName,
        accountType: newAccountType,
        category: newCategory,
        balance: Number(newBalance) || 0,
        description: newDescription,
        isDefault: false,
        isBankOrCash,
        isCOGSReserve: isCogsReserve,
        bankDetails: isBankOrCash ? { bankName, accountNumber, routingNumber } : undefined
      });

      setActionSuccess(`Successfully added account ${newAccountCode} - ${newAccountName} to Chart of Accounts`);
      setIsAddAccountOpen(false);
      resetAccountForm();
      loadFinancialData();

      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error('Error saving account:', err);
    }
  };

  const resetAccountForm = () => {
    setNewAccountCode('');
    setNewAccountName('');
    setNewAccountType('asset');
    setNewCategory('Current Assets');
    setNewBalance(0);
    setNewDescription('');
    setIsBankOrCash(false);
    setIsCogsReserve(false);
    setBankName('');
    setAccountNumber('');
    setRoutingNumber('');
  };

  // Handle Issue Check
  const handleIssueCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(checkAmount);
    if (!checkPayeeName || isNaN(amountVal) || amountVal <= 0 || !checkSourceAccountId) {
      alert('Please fill in all required check details, payee name, and a valid amount.');
      return;
    }

    const sourceAcc = accounts.find(a => a.id === checkSourceAccountId);
    if (!sourceAcc) return;

    if (sourceAcc.balance < amountVal) {
      if (!confirm(`Warning: Selected source account balance ($${sourceAcc.balance.toFixed(2)}) is lower than check amount ($${amountVal.toFixed(2)}). Issue check anyway?`)) {
        return;
      }
    }

    const categoryAcc = accounts.find(a => a.id === checkCategoryAccountId);

    try {
      const issued = await createIssuedCheck(vendor.id, {
        vendorId: vendor.id,
        checkNumber,
        sourceAccountId: sourceAcc.id,
        sourceAccountName: sourceAcc.accountName,
        payeeName: checkPayeeName,
        amount: amountVal,
        amountInWords: checkAmountInWords || numberToWords(amountVal),
        date: checkDate,
        memo: checkMemo || 'Vendor / Creditor Payment',
        categoryAccountId: categoryAcc?.id,
        categoryAccountName: categoryAcc?.accountName,
        authorizedBy: checkAuthorizedBy,
        status: 'issued'
      });

      setActionSuccess(`Check ${checkNumber} for $${amountVal.toFixed(2)} issued successfully from ${sourceAcc.accountName}!`);
      setSelectedCheckForPrint(issued);
      
      // Reset check form
      setCheckPayeeName('');
      setCheckAmount('');
      setCheckMemo('');
      loadFinancialData();

      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err) {
      console.error('Error issuing check:', err);
    }
  };

  // Handle Void Check
  const handleVoidCheck = async (checkId: string) => {
    if (!confirm('Are you sure you want to void this check? The check amount will be credited back to the source cash/bank account.')) {
      return;
    }
    try {
      await updateCheckStatus(vendor.id, checkId, 'voided');
      setActionSuccess('Check voided and balance refunded to source account.');
      loadFinancialData();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error('Error voiding check:', err);
    }
  };

  // Filtered COA Accounts
  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch = acc.accountName.toLowerCase().includes(coaSearch.toLowerCase()) ||
                          acc.accountCode.toLowerCase().includes(coaSearch.toLowerCase()) ||
                          acc.category.toLowerCase().includes(coaSearch.toLowerCase());
    const matchesType = coaTypeFilter === 'ALL' || acc.accountType === coaTypeFilter.toLowerCase();
    return matchesSearch && matchesType;
  });

  const selectedSourceAccountObj = accounts.find(a => a.id === checkSourceAccountId);

  return (
    <div className="min-h-screen bg-slate-100/70 p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF6600] to-orange-600 flex items-center justify-center text-white shadow-lg shrink-0">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">Financial & Treasury Management</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Live Ledger
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Chart of Accounts (COA), Protected COGS Reserves, CASH Drawer Tills & Automated Check Writer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { resetAccountForm(); setIsAddAccountOpen(true); }}
            className="px-4 py-2.5 bg-[#FF6600] hover:bg-orange-600 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create & Add COA Account</span>
          </button>
        </div>
      </div>

      {/* Global Success Notification */}
      {actionSuccess && (
        <div className="bg-emerald-500 text-white p-4 rounded-xl shadow-md flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="text-xs sm:text-sm font-bold">{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Financial Metrics Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Liquidity */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">Total Cash & Bank Holdings</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            ${totalLiquidity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Sum of Cash Drawer, Bank Cashbook & COGS Reserves</p>
        </div>

        {/* CASH Drawer */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">CASH Drawer Till</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            ${cashDrawerAcc ? cashDrawerAcc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
          </div>
          <p className="text-[11px] text-blue-600 font-bold mt-1">Code {cashDrawerAcc?.accountCode || '1010'} • Active POS Register Float</p>
        </div>

        {/* COGS Reserves Account */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-5 rounded-2xl border border-orange-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-orange-950 tracking-wider">COGS Reserves Account</span>
            <div className="p-2 bg-orange-500 text-white rounded-xl shadow-xs">
              <Lock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-orange-950 mt-2">
            ${cogsReserveAcc ? cogsReserveAcc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
            <span className="text-[10px] font-black uppercase text-orange-800">Protected for Restock & Creditors</span>
          </div>
        </div>

        {/* Main Cashbook */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">Main Cashbook</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
            ${mainCashbookAcc ? mainCashbookAcc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
          </div>
          <p className="text-[11px] text-indigo-600 font-bold mt-1">{mainCashbookAcc?.bankDetails?.bankName || 'Operating Bank'}</p>
        </div>

      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveTab('coa')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'coa'
              ? 'bg-slate-900 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/80'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Chart of Accounts (COA)</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-200 font-mono">
            {accounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('check_writer')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'check_writer'
              ? 'bg-[#FF6600] text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/80'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>Check Writer (Bank & Cash)</span>
        </button>

        <button
          onClick={() => setActiveTab('check_register')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'check_register'
              ? 'bg-slate-900 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/80'
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>Check Register & Audit</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-200 font-mono">
            {checks.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('cogs_protection')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'cogs_protection'
              ? 'bg-orange-600 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/80'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>COGS Reserve Protection Engine</span>
        </button>
      </div>

      {/* TAB 1: CHART OF ACCOUNTS (COA) */}
      {activeTab === 'coa' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden space-y-4 p-5">
          
          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={coaSearch}
                onChange={(e) => setCoaSearch(e.target.value)}
                placeholder="Search Chart of Accounts by code, name, or category..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold w-full md:w-auto">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-500">Type:</span>
                <select
                  value={coaTypeFilter}
                  onChange={(e) => setCoaTypeFilter(e.target.value)}
                  className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Account Types</option>
                  <option value="ASSET">Assets</option>
                  <option value="LIABILITY">Liabilities</option>
                  <option value="EQUITY">Equity</option>
                  <option value="REVENUE">Revenue</option>
                  <option value="EXPENSE">Expenses</option>
                </select>
              </div>

              <button
                onClick={() => { resetAccountForm(); setIsAddAccountOpen(true); }}
                className="px-4 py-2 bg-[#FF6600] hover:bg-orange-600 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>New Account</span>
              </button>
            </div>
          </div>

          {/* COA Accounts Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase font-black text-[10px] tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">Account Code</th>
                  <th className="py-3 px-4">Account Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Current Balance ($)</th>
                  <th className="py-3 px-4">Protection & Flags</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredAccounts.map(account => {
                  const isCashDrawer = account.accountName.toLowerCase().includes('cash drawer') || account.accountCode === '1010';
                  const isCogsRes = account.isCOGSReserve || account.accountCode === '1020';
                  const isMainCash = account.accountName.toLowerCase().includes('main cashbook') || account.accountCode === '1000';

                  let typeColor = 'bg-slate-100 text-slate-700';
                  if (account.accountType === 'asset') typeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  if (account.accountType === 'liability') typeColor = 'bg-amber-50 text-amber-700 border-amber-200';
                  if (account.accountType === 'revenue') typeColor = 'bg-blue-50 text-blue-700 border-blue-200';
                  if (account.accountType === 'expense') typeColor = 'bg-rose-50 text-rose-700 border-rose-200';

                  return (
                    <tr key={account.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {account.accountCode}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{account.accountName}</div>
                        {account.description && (
                          <div className="text-[11px] text-slate-500 truncate max-w-xs">{account.description}</div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase border ${typeColor}`}>
                          {account.accountType}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 font-semibold">
                        {account.category}
                      </td>

                      <td className="py-3.5 px-4 text-right font-black text-sm text-slate-900">
                        ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isCashDrawer && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[10px] border border-blue-200">
                              💵 CASH Drawer
                            </span>
                          )}

                          {isCogsRes && (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-950 rounded font-black text-[10px] border border-orange-300 flex items-center gap-1">
                              <Lock className="w-3 h-3 text-orange-600" />
                              <span>COGS Reserve Protected</span>
                            </span>
                          )}

                          {isMainCash && (
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-900 rounded font-bold text-[10px] border border-indigo-200">
                              🏦 Main Cashbook
                            </span>
                          )}

                          {account.isBankOrCash && !isCashDrawer && !isCogsRes && !isMainCash && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-bold text-[10px]">
                              Eligible Bank/Cash
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {account.isBankOrCash ? (
                          <button
                            onClick={() => {
                              setCheckSourceAccountId(account.id);
                              setActiveTab('check_writer');
                            }}
                            className="px-3 py-1 bg-slate-900 hover:bg-[#FF6600] text-white font-bold rounded-lg text-[11px] transition-all cursor-pointer"
                          >
                            Write Check
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* TAB 2: CHECK WRITER (CASH & BANK ACCOUNTS) */}
      {activeTab === 'check_writer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Check Writer Form */}
          <div className="lg:col-span-5 bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-[#FF6600]" />
                <h2 className="font-black text-slate-900 text-base">Issue Check From Account</h2>
              </div>
              <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                {checkNumber}
              </span>
            </div>

            <form onSubmit={handleIssueCheck} className="space-y-4">
              
              {/* Source Account Selection */}
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Pay From Source Account (Cash / Bank) *
                </label>
                <select
                  value={checkSourceAccountId}
                  onChange={(e) => setCheckSourceAccountId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                  required
                >
                  {bankAndCashAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.accountName} ({acc.accountCode}) — Balance: ${acc.balance.toFixed(2)}
                      {acc.isCOGSReserve ? ' [PROTECTED RESERVES]' : ''}
                    </option>
                  ))}
                </select>
                {selectedSourceAccountObj && (
                  <p className="text-[10px] text-slate-500 mt-1 font-medium">
                    Available balance: <strong className="text-slate-900">${selectedSourceAccountObj.balance.toFixed(2)}</strong>
                  </p>
                )}
              </div>

              {/* Payee Name */}
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Pay to the Order of (Payee Name) *
                </label>
                <input
                  type="text"
                  value={checkPayeeName}
                  onChange={(e) => setCheckPayeeName(e.target.value)}
                  placeholder="e.g. Global Wholesale Distributors Ltd"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                  required
                />
              </div>

              {/* Amount ($) & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Check Amount ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={checkAmount}
                    onChange={(e) => setCheckAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-black text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Issue Date *
                  </label>
                  <input
                    type="date"
                    value={checkDate}
                    onChange={(e) => setCheckDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                    required
                  />
                </div>
              </div>

              {/* Amount in Words */}
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Amount in Words (Auto-Formatted)
                </label>
                <input
                  type="text"
                  value={checkAmountInWords}
                  onChange={(e) => setCheckAmountInWords(e.target.value)}
                  placeholder="e.g. One Thousand Dollars and 00/100"
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-serif font-bold text-slate-800"
                />
              </div>

              {/* Category / Ledger Allocation */}
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Category / Ledger Account Allocation
                </label>
                <select
                  value={checkCategoryAccountId}
                  onChange={(e) => setCheckCategoryAccountId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                >
                  <option value="">Select Target Payable / Expense Account</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.accountCode} - {acc.accountName} ({acc.accountType.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Memo & Authorized Signatory */}
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Memo / Payment Description
                </label>
                <input
                  type="text"
                  value={checkMemo}
                  onChange={(e) => setCheckMemo(e.target.value)}
                  placeholder="e.g. Supplier Invoice #INV-8834 Restock Settlement"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Authorized Signatory Name
                </label>
                <input
                  type="text"
                  value={checkAuthorizedBy}
                  onChange={(e) => setCheckAuthorizedBy(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-[#FF6600] hover:bg-orange-600 text-white font-extrabold text-sm rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Issue & Post Check to Ledger</span>
              </button>

            </form>
          </div>

          {/* Interactive Check Preview Canvas */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-slate-900 text-white p-4 rounded-t-2xl flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">Live Bank Check Canvas Preview</span>
              <span className="text-[10px] font-mono bg-slate-800 text-orange-400 px-2 py-0.5 rounded border border-slate-700">
                MICR Security Standard
              </span>
            </div>

            {/* Bank Check Card Styling */}
            <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 p-6 sm:p-8 rounded-2xl border-2 border-emerald-300 shadow-xl relative overflow-hidden text-slate-900 space-y-6">
              
              {/* Security Background Pattern Watermark overlay */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:12px_12px]" />

              {/* Check Header Line */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-300/80 pb-4">
                <div>
                  <div className="text-base sm:text-lg font-black uppercase tracking-tight text-slate-900">
                    {vendor.businessName || 'ENTERPRISE RETAIL GROUP LTD'}
                  </div>
                  <div className="text-[10px] text-slate-600 font-bold uppercase">
                    {selectedSourceAccountObj?.bankDetails?.bankName || selectedSourceAccountObj?.accountName || 'FIRST NATIONAL COMMERCE BANK'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Routing: {selectedSourceAccountObj?.bankDetails?.routingNumber || '021000021'} • Account: {selectedSourceAccountObj?.bankDetails?.accountNumber || '**** 8842'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-black font-mono text-slate-800">
                    CHECK NO. {checkNumber}
                  </div>
                  <div className="text-xs font-bold text-slate-700 mt-1 border-b border-slate-400 px-3 py-0.5 inline-block min-w-[120px] bg-white/60">
                    DATE: {checkDate || '2026-07-25'}
                  </div>
                </div>
              </div>

              {/* Payee & Amount Row */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700 shrink-0">PAY TO THE ORDER OF</span>
                  <div className="flex-1 border-b-2 border-slate-800 text-sm sm:text-base font-black text-slate-900 px-2 py-0.5 bg-white/40">
                    {checkPayeeName || '________________________________________________'}
                  </div>
                  <div className="bg-white border-2 border-slate-800 px-3 py-1 font-black text-base sm:text-lg text-slate-900 shrink-0 shadow-2xs">
                    ${checkAmount ? parseFloat(checkAmount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                  </div>
                </div>

                {/* Amount in Words Row */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 border-b-2 border-slate-800 text-xs sm:text-sm font-serif font-bold text-slate-900 px-2 py-1 bg-white/40 uppercase tracking-tight">
                    {checkAmountInWords || 'ZERO DOLLARS AND 00/100 __________________________________________'}
                  </div>
                  <span className="text-xs font-black text-slate-800 shrink-0">DOLLARS</span>
                </div>
              </div>

              {/* Memo & Authorized Signature Footer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 items-end">
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-500 block mb-0.5">MEMO / PURPOSE</span>
                  <div className="border-b border-slate-700 text-xs font-bold text-slate-800 px-2 py-0.5 bg-white/30 truncate">
                    {checkMemo || 'Vendor Inventory Restock Settlement'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="border-b-2 border-slate-800 font-serif italic font-extrabold text-base sm:text-lg text-slate-900 px-2 py-0.5 bg-white/30">
                    {checkAuthorizedBy || activeStaff?.name}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mt-0.5">
                    AUTHORIZED SIGNATURE
                  </span>
                </div>
              </div>

              {/* Bottom MICR Font Strip */}
              <div className="pt-2 text-center border-t border-slate-300/80 font-mono text-xs tracking-widest text-slate-800 font-bold">
                ⑆021000021⑆ 88421003⑈ {checkNumber.replace('CHK-', '')}
              </div>

            </div>

            {/* Quick Print Banner for Issued Check */}
            {selectedCheckForPrint && (
              <div className="p-4 bg-slate-900 text-white rounded-2xl flex items-center justify-between border border-slate-800">
                <div>
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Check {selectedCheckForPrint.checkNumber} Ready for Print</span>
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">
                    ${selectedCheckForPrint.amount.toFixed(2)} to {selectedCheckForPrint.payeeName}
                  </div>
                </div>

                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Check Now</span>
                </button>
              </div>
            )}

          </div>

        </div>
      )}

      {/* TAB 3: CHECK REGISTER & AUDIT HISTORY */}
      {activeTab === 'check_register' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden space-y-4 p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="font-black text-slate-900 text-base">Issued Checks Register & Treasury Audit Log</h2>
              <p className="text-xs text-slate-500">History of all issued, cleared, and voided bank & cash drawer checks</p>
            </div>
            <button
              onClick={() => setActiveTab('check_writer')}
              className="px-3.5 py-2 bg-[#FF6600] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Issue New Check</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase font-black text-[10px] tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">Check No.</th>
                  <th className="py-3 px-4">Issue Date</th>
                  <th className="py-3 px-4">Payee Name</th>
                  <th className="py-3 px-4">Source Account</th>
                  <th className="py-3 px-4">Memo / Category</th>
                  <th className="py-3 px-4 text-right">Amount ($)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {checks.map(chk => {
                  const isVoided = chk.status === 'voided';
                  const isCleared = chk.status === 'cleared';

                  return (
                    <tr key={chk.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-black text-slate-900">
                        {chk.checkNumber}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600">
                        {chk.date}
                      </td>

                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {chk.payeeName}
                      </td>

                      <td className="py-3.5 px-4 text-slate-700">
                        {chk.sourceAccountName}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 truncate max-w-xs">
                        {chk.memo}
                      </td>

                      <td className="py-3.5 px-4 text-right font-black text-slate-900 text-sm">
                        ${chk.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase ${
                          isVoided
                            ? 'bg-rose-100 text-rose-800'
                            : isCleared
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {chk.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right space-x-1">
                        <button
                          onClick={() => setSelectedCheckForPrint(chk)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-[11px] transition-all cursor-pointer"
                        >
                          View / Print
                        </button>
                        {!isVoided && (
                          <button
                            onClick={() => handleVoidCheck(chk.id)}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-[11px] transition-all cursor-pointer"
                          >
                            Void
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: COGS RESERVE PROTECTION ENGINE EXPLAINER */}
      {activeTab === 'cogs_protection' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Protected COGS Reserve Account Mechanics</h2>
              <p className="text-xs text-slate-500">Automated capital preservation for inventory restocking and creditor liabilities</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs">1</div>
              <h3 className="font-bold text-sm text-slate-900">1. POS Sale COGS Splitting</h3>
              <p className="text-xs text-slate-600">
                When a sale is completed at the register, the system splits gross receipts: profit margin goes to operating earnings, while exact product cost (COGS) is directed to the COGS Reserve Account.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center font-black text-xs">2</div>
              <h3 className="font-bold text-sm text-slate-900">2. Capital Protection Lock</h3>
              <p className="text-xs text-slate-600">
                The COGS Reserve Account (Code 1020) is locked from general administrative overhead. Capital cannot be depleted by unapproved expense spending.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs">3</div>
              <h3 className="font-bold text-sm text-slate-900">3. Creditor Check Disbursement</h3>
              <p className="text-xs text-slate-600">
                When supplier invoices or purchase orders come due, checks are written directly from the COGS Reserve Account to creditors, guaranteeing 100% liquidity for trade liabilities.
              </p>
            </div>
          </div>

          {/* Reserve Health Box */}
          <div className="p-5 bg-orange-50/80 rounded-2xl border border-orange-200 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase text-orange-950 tracking-wider">Current COGS Reserve Capital Protection</div>
              <div className="text-2xl font-black text-orange-950 mt-1">
                ${cogsReserveAcc ? cogsReserveAcc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
              </div>
              <p className="text-xs text-orange-800 mt-1">
                Protected liquidity available to cover trade supplier purchase orders and Accounts Payable liabilities.
              </p>
            </div>

            <button
              onClick={() => {
                if (cogsReserveAcc) setCheckSourceAccountId(cogsReserveAcc.id);
                setActiveTab('check_writer');
              }}
              className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all shrink-0 cursor-pointer flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>Issue Creditor Check From Reserve</span>
            </button>
          </div>
        </div>
      )}

      {/* CREATE & ADD CHART OF ACCOUNTS MODAL */}
      {isAddAccountOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#FF6600] text-white rounded-lg">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Create & Add Account to COA</h3>
                  <p className="text-xs text-slate-400">Add a custom ledger account to the Chart of Accounts</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddAccountOpen(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="p-6 space-y-4">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Account Code *
                  </label>
                  <input
                    type="text"
                    value={newAccountCode}
                    onChange={(e) => setNewAccountCode(e.target.value)}
                    placeholder="e.g. 1030, 2020"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                    Account Type *
                  </label>
                  <select
                    value={newAccountType}
                    onChange={(e) => setNewAccountType(e.target.value as AccountType)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                  >
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                    <option value="equity">Equity</option>
                    <option value="revenue">Revenue</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Account Name *
                </label>
                <input
                  type="text"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="e.g. Petty Cash Float, Equipment Asset"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Category Classification
                </label>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="e.g. Current Assets, Bank Accounts, Operating Expenses"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Opening Balance ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newBalance}
                  onChange={(e) => setNewBalance(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Purpose of this account..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
                />
              </div>

              {/* Special Flags */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isBankOrCash}
                    onChange={(e) => setIsBankOrCash(e.target.checked)}
                    className="w-4 h-4 text-[#FF6600] rounded border-slate-300 focus:ring-[#FF6600]"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Is Bank or Cash Account (Eligible for Check Issuance)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCogsReserve}
                    onChange={(e) => setIsCogsReserve(e.target.checked)}
                    className="w-4 h-4 text-[#FF6600] rounded border-slate-300 focus:ring-[#FF6600]"
                  />
                  <span className="text-xs font-bold text-orange-900">
                    Mark as Protected COGS Reserve Account
                  </span>
                </label>
              </div>

              {isBankOrCash && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <span className="font-bold text-slate-700 block">Bank Account Details (Optional)</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Bank Name"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg p-2 font-medium"
                    />
                    <input
                      type="text"
                      placeholder="Account Number"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg p-2 font-medium"
                    />
                  </div>
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddAccountOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#FF6600] hover:bg-orange-600 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                >
                  Save Account
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
