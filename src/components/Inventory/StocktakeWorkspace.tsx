import React, { useState, useMemo } from 'react';
import { Product, Warehouse, Branch, StaffMember, ApprovalRequest } from '../../types';
import { BILossPreventionModal } from './BILossPreventionModal';
import { buildProductLocationStockView } from '../../features/inventory/productLocationStockView';
import { 
  Boxes, 
  Calendar, 
  Layers, 
  Search, 
  Plus, 
  Minus, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  ShieldAlert, 
  Zap, 
  Filter, 
  Building, 
  Warehouse as WarehouseIcon,
  FileCheck,
  TrendingDown,
  ArrowRight
} from 'lucide-react';

interface StocktakeWorkspaceProps {
  products: Product[];
  warehouses: Warehouse[];
  branches: Branch[];
  warehouseStock: Record<string, number>;
  branchStock: Record<string, number>;
  activeStaff: StaffMember;
  vendorId: string;
  currency?: string;
  onSubmitStocktakeApproval: (approvalPayload: any) => Promise<void>;
  onNavigateToApprovals?: () => void;
  onStockLocationChange?: (type: 'warehouse' | 'branch', id: string) => Promise<void>;
}

export const StocktakeWorkspace: React.FC<StocktakeWorkspaceProps> = ({
  products,
  warehouses,
  branches,
  warehouseStock,
  branchStock,
  activeStaff,
  vendorId,
  currency = '$',
  onSubmitStocktakeApproval,
  onNavigateToApprovals,
  onStockLocationChange
}) => {
  // Location state
  const [selectedLocationType, setSelectedLocationType] = useState<'warehouse' | 'branch'>('warehouse');
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    warehouses[0]?.id || branches[0]?.id || ''
  );

  // Calculate 26 working days schedule of current month (Mon - Sat, excluding Sundays & official holidays)
  const workingDaysInfo = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    // Standard public holidays list
    const holidays = ['01-01', '05-01', '12-25', '12-26'];

    const workingDaysList: { dayNum: number; dateStr: string; dayOfWeekStr: string; dateObj: Date }[] = [];
    let currentWorkingCount = 0;
    let todayWorkingDayIndex = 1;

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const dayOfWeek = dateObj.getDay(); // 0 is Sunday
      const monthDayStr = `${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      const isSunday = dayOfWeek === 0;
      const isHoliday = holidays.includes(monthDayStr);

      if (!isSunday && !isHoliday) {
        currentWorkingCount++;
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        workingDaysList.push({
          dayNum: currentWorkingCount,
          dateStr: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          dayOfWeekStr: dayNames[dayOfWeek],
          dateObj
        });

        if (d <= now.getDate() && currentWorkingCount <= 26) {
          todayWorkingDayIndex = currentWorkingCount;
        }
      }
    }

    const activeTodayIndex = Math.min(26, Math.max(1, todayWorkingDayIndex));
    const isTodaySundayOrHoliday = now.getDay() === 0;

    return {
      workingDaysList,
      totalWorkingDaysInMonth: currentWorkingCount,
      activeTodayIndex,
      isTodaySundayOrHoliday
    };
  }, []);

  const defaultWorkingDay = workingDaysInfo.activeTodayIndex;

  const [activeCycleDay, setActiveCycleDay] = useState<number>(defaultWorkingDay);
  const [activeShelfFilter, setActiveShelfFilter] = useState<string>('ALL');
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>('ALL');
  const [selectedBIFilter, setSelectedBIFilter] = useState<string>('ALL');

  // Stocktake counted values: productId -> counted quantity
  const [countedQuantities, setCountedQuantities] = useState<Record<string, number>>({});
  const [varianceReasons, setVarianceReasons] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showDiscrepancyOnly, setShowDiscrepancyOnly] = useState(false);

  // Modal & Submission states
  const [isBILossModalOpen, setIsBILossModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);

  // Extract unique departments & shelves
  const allDepartments = useMemo(() => {
    return ['ALL', ...Array.from(new Set(products.filter(p => (p.productType || 'INVENTORY') === 'INVENTORY' && p.status !== 'archived').map(p => p.category)))];
  }, [products]);

  // Extract and organize shelves across products
  const allShelves = useMemo(() => {
    const shelvesSet = new Set<string>();
    products.forEach((p) => {
      const shelfName = p.shelf || '';
      if (shelfName) shelvesSet.add(shelfName);
    });
    return Array.from(shelvesSet).sort();
  }, [products]);

  // Calculate 26 Working Days Shelf Distribution
  // Total shelves divided over 26 days
  const shelvesDistribution = useMemo(() => {
    const totalShelves = allShelves.length;
    const shelvesPerDay = Math.max(1, Math.ceil(totalShelves / 26));

    const schedule: Record<number, string[]> = {};
    for (let day = 1; day <= 26; day++) {
      const startIndex = (day - 1) * shelvesPerDay;
      const dayShelves = allShelves.slice(startIndex, startIndex + shelvesPerDay);
      schedule[day] = dayShelves;
    }

    return {
      totalShelves,
      shelvesPerDay,
      schedule
    };
  }, [allShelves]);

  // Today's scheduled shelves
  const todayAssignedShelves = shelvesDistribution.schedule[activeCycleDay] || [];

  // Active stock balances for chosen location
  const currentStockMap = useMemo(() => {
    return selectedLocationType === 'warehouse' ? warehouseStock : branchStock;
  }, [selectedLocationType, warehouseStock, branchStock]);

  const currentLocationName = useMemo(() => {
    if (selectedLocationType === 'warehouse') {
      return warehouses.find(w => w.id === selectedLocationId)?.name || 'Central Warehouse';
    } else {
      return branches.find(b => b.id === selectedLocationId)?.name || 'Store Branch';
    }
  }, [selectedLocationType, selectedLocationId, warehouses, branches]);

  // Filter products by search, department, shelf, or BI anomaly
  const displayedProducts = useMemo(() => {
    return products.filter((p) => {
      if ((p.productType || 'INVENTORY') !== 'INVENTORY' || p.status === 'archived') return false;
      const pShelf = p.shelf || '';
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            pShelf.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesShelf = activeShelfFilter === 'ALL' || pShelf === activeShelfFilter;
      const matchesDepartment = selectedDepartmentFilter === 'ALL' || p.category === selectedDepartmentFilter;

      const systemQty = currentStockMap[p.id] || 0;
      const countedQty = countedQuantities[p.id] !== undefined ? countedQuantities[p.id] : systemQty;
      const isDiscrepancy = countedQty !== systemQty;

      const matchesDiscrepancyFilter = !showDiscrepancyOnly || isDiscrepancy;

      // BI Anomaly check
      let matchesBI = true;
      if (selectedBIFilter === 'HIGH_VALUE_EXPOSURE') {
        matchesBI = (p.sellingPrice || p.costPrice || 0) >= 100;
      } else if (selectedBIFilter !== 'ALL') {
        matchesBI = false;
      }

      return matchesSearch && matchesShelf && matchesDepartment && matchesDiscrepancyFilter && matchesBI;
    });
  }, [products, searchTerm, activeShelfFilter, selectedDepartmentFilter, selectedBIFilter, currentStockMap, countedQuantities, showDiscrepancyOnly]);

  // Load Today's Scheduled Shelves into form
  const handleLoadScheduledShelves = () => {
    if (todayAssignedShelves.length > 0) {
      setActiveShelfFilter(todayAssignedShelves[0]);
    } else {
      setActiveShelfFilter('ALL');
    }
  };

  // Pre-fill quantities from BI Flagged items modal
  const handleLoadFlaggedItemsToForm = (flaggedProducts: Product[]) => {
    setActiveShelfFilter('ALL');
    setShowDiscrepancyOnly(false);
    // Expand search or focus on flagged items
    const newCounts = { ...countedQuantities };
    flaggedProducts.forEach(p => {
      if (newCounts[p.id] === undefined) {
        newCounts[p.id] = currentStockMap[p.id] || 0;
      }
    });
    setCountedQuantities(newCounts);
  };

  // Update item count
  const handleCountChange = (productId: string, val: number) => {
    setCountedQuantities(prev => ({
      ...prev,
      [productId]: Math.max(0, val)
    }));
  };

  const handleReasonChange = (productId: string, reason: string) => {
    setVarianceReasons(prev => ({
      ...prev,
      [productId]: reason
    }));
  };

  // Reset all counts back to system defaults
  const handleResetCounts = () => {
    if (window.confirm('Reset all counted values back to current system stock?')) {
      setCountedQuantities({});
      setVarianceReasons({});
    }
  };

  // Stocktake Summary Metrics
  const summaryMetrics = useMemo(() => {
    let totalItems = 0;
    let countedItemsCount = 0;
    let matchingCount = 0;
    let discrepancyCount = 0;
    let totalShrinkageValue = 0;
    let totalSurplusValue = 0;

    products.filter(p => (p.productType || 'INVENTORY') === 'INVENTORY' && p.status !== 'archived').forEach(p => {
      totalItems++;
      const sysQty = currentStockMap[p.id] || 0;
      const cntQty = countedQuantities[p.id] !== undefined ? countedQuantities[p.id] : sysQty;
      
      if (countedQuantities[p.id] !== undefined) {
        countedItemsCount++;
      }

      const diff = cntQty - sysQty;
      const unitCost = p.costPrice || 0;

      if (diff === 0) {
        matchingCount++;
      } else if (diff < 0) {
        discrepancyCount++;
        totalShrinkageValue += Math.abs(diff) * unitCost;
      } else {
        discrepancyCount++;
        totalSurplusValue += diff * unitCost;
      }
    });

    const netVarianceValue = totalSurplusValue - totalShrinkageValue;

    return {
      totalItems,
      countedItemsCount,
      matchingCount,
      discrepancyCount,
      totalShrinkageValue,
      totalSurplusValue,
      netVarianceValue
    };
  }, [products, currentStockMap, countedQuantities]);

  // Submit Stocktake Approval
  const handleSubmitApproval = async () => {
    // Collect all items where count was explicitly entered or differs from system
    const adjustmentItems: {
      productId: string;
      productName: string;
      systemQty: number;
      countedQty: number;
      quantityDelta: number;
      costPrice: number;
      reason: string;
    }[] = [];

    products.filter(p => (p.productType || 'INVENTORY') === 'INVENTORY' && p.status !== 'archived').forEach((p) => {
      const sysQty = currentStockMap[p.id] || 0;
      const cntQty = countedQuantities[p.id] !== undefined ? countedQuantities[p.id] : sysQty;
      const delta = cntQty - sysQty;

      if (delta !== 0) {
        const defaultReason = delta < 0 ? 'Suspected Theft / Physical Shrinkage' : 'Surplus Intake / Recount Match';
        adjustmentItems.push({
          productId: p.id,
          productName: p.name,
          systemQty: sysQty,
          countedQty: cntQty,
          quantityDelta: delta,
          costPrice: p.costPrice || 0,
          reason: varianceReasons[p.id] || defaultReason
        });
      }
    });

    if (adjustmentItems.length === 0) {
      alert('No inventory variances recorded. All physical counts match live system balances.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: `Stocktake Physical Audit Adjustment (${currentLocationName})`,
        description: `Physical stock audit conducted for ${currentLocationName} (Day ${activeCycleDay}/26 Cycle). ${adjustmentItems.length} SKU variance adjustments submitted for authorization.`,
        dataPayload: {
          locationType: selectedLocationType,
          locationId: selectedLocationId,
          locationName: currentLocationName,
          stocktakeDay: activeCycleDay,
          totalVariances: adjustmentItems.length,
          netValuation: summaryMetrics.netVarianceValue,
          items: adjustmentItems
        }
      };

      await onSubmitStocktakeApproval(payload);
      setSubmissionSuccess(`Stocktake audit submitted successfully! ${adjustmentItems.length} inventory variance requests are now pending Manager approval in the Approvals workspace.`);
    } catch (err) {
      console.error(err);
      alert('Error submitting stocktake request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#FF6600]/20 text-[#FF6600] border border-[#FF6600]/30 flex items-center justify-center font-extrabold shadow-inner shrink-0">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold text-white">Stocktake & Physical Audit Workspace</h1>
              <span className="bg-[#FF6600] text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                26-Day Cycle Schedule
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Conduct daily shelf counts, trigger immediate BI loss checks, and submit inventory quantity adjustments for manager approval.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setIsBILossModalOpen(true)}
            className="flex-1 md:flex-initial px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer animate-bounce-subtle"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>⚡ BI Loss & Theft Checks</span>
          </button>

          {onNavigateToApprovals && (
            <button
              onClick={onNavigateToApprovals}
              className="flex-1 md:flex-initial px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs sm:text-sm border border-slate-700 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <FileCheck className="w-4 h-4 text-[#FF6600]" />
              <span>Approvals Queue</span>
            </button>
          )}
        </div>
      </div>

      {/* Location Selector & 26-Day Cycle Calculator Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Card: Location & Audit Scope */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-[#FF6600]" />
              <h2 className="text-sm font-bold text-slate-900">Audit Location Scope</h2>
            </div>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-bold uppercase">
              Target
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Select Location Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setSelectedLocationType('warehouse');
                    if (warehouses[0]) { setSelectedLocationId(warehouses[0].id); await onStockLocationChange?.('warehouse', warehouses[0].id); }
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    selectedLocationType === 'warehouse'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <WarehouseIcon className="w-4 h-4 text-[#FF6600]" />
                  <span>Central Depot</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    setSelectedLocationType('branch');
                    if (branches[0]) { setSelectedLocationId(branches[0].id); await onStockLocationChange?.('branch', branches[0].id); }
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    selectedLocationType === 'branch'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Building className="w-4 h-4 text-[#FF6600]" />
                  <span>Store Branch</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                {selectedLocationType === 'warehouse' ? 'Select Warehouse Depot' : 'Select Retail Branch'}
              </label>
              <select
                value={selectedLocationId}
                onChange={async (e) => { setSelectedLocationId(e.target.value); await onStockLocationChange?.(selectedLocationType, e.target.value); }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6600]"
              >
                {selectedLocationType === 'warehouse' ? (
                  warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.location})</option>
                  ))
                ) : (
                  branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.address})</option>
                  ))
                )}
              </select>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Governance Rule:</strong>
                <span>Stock adjustments submitted from this form will NOT alter stock immediately. They enter the Manager Approval workflow for review.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Middle & Right: 26 Working Days Shelf Schedule Calculator */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#FF6600]" />
              <h2 className="text-sm font-bold text-slate-900">26 Working Days Cycle Count Calculator</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-[#FF6600] bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200">
                Mon–Sat Cycle (Excludes Sundays & Public Holidays)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Active Working Day</div>
              <div className="text-xl font-extrabold text-slate-900 mt-0.5">
                Working Day {activeCycleDay} <span className="text-xs font-normal text-slate-500">of 26</span>
              </div>
              <div className="text-[10px] text-[#FF6600] font-bold mt-1">
                {workingDaysInfo.workingDaysList[activeCycleDay - 1]
                  ? `${workingDaysInfo.workingDaysList[activeCycleDay - 1].dayOfWeekStr}, ${workingDaysInfo.workingDaysList[activeCycleDay - 1].dateStr}`
                  : 'Week Working Day'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Today's Assigned Shelves</div>
              <div className="text-sm font-bold text-slate-900 mt-1 truncate">
                {todayAssignedShelves.length > 0 ? todayAssignedShelves.join(', ') : 'All Shelves Covered'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">{todayAssignedShelves.length} Shelves scheduled today</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-center">
              <button
                onClick={handleLoadScheduledShelves}
                className="w-full py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-[#FF6600]" />
                <span>Filter Today's Scheduled Shelves</span>
              </button>
            </div>
          </div>

          {/* Day Selector Buttons Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">26 Working Day Calendar (1 - 26):</span>
              <span className="text-[11px] text-slate-500 font-medium">Click any working day to inspect assigned shelves</span>
            </div>

            <div className="grid grid-cols-13 sm:grid-cols-13 gap-1 overflow-x-auto pb-1 scrollbar-none">
              {Array.from({ length: 26 }, (_, i) => i + 1).map((dayNum) => {
                const isSelected = activeCycleDay === dayNum;
                const isToday = dayNum === defaultWorkingDay;
                const dayInfo = workingDaysInfo.workingDaysList[dayNum - 1];

                return (
                  <button
                    key={dayNum}
                    type="button"
                    title={dayInfo ? `Working Day ${dayNum}: ${dayInfo.dayOfWeekStr}, ${dayInfo.dateStr} (Excludes Sundays & Holidays)` : `Working Day ${dayNum}`}
                    onClick={() => {
                      setActiveCycleDay(dayNum);
                      const dayShelves = shelvesDistribution.schedule[dayNum] || [];
                      if (dayShelves.length > 0) {
                        setActiveShelfFilter(dayShelves[0]);
                      } else {
                        setActiveShelfFilter('ALL');
                      }
                    }}
                    className={`h-9 rounded-lg text-xs font-bold flex flex-col items-center justify-center transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-[#FF6600] text-white shadow-sm ring-2 ring-[#FF6600]/30 font-black'
                        : isToday
                        ? 'bg-slate-900 text-white font-extrabold'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <span>{dayNum}</span>
                    {isToday && !isSelected && <span className="w-1 h-1 rounded-full bg-[#FF6600]"></span>}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* Stocktake Audit Summary Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-2 md:grid-cols-5 gap-4 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        <div className="p-2">
          <div className="text-xs font-semibold text-slate-500">Catalog SKUs</div>
          <div className="text-lg font-black text-slate-900 mt-0.5">{summaryMetrics.totalItems} Items</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Total in scope</div>
        </div>

        <div className="p-2 pt-4 md:pt-2">
          <div className="text-xs font-semibold text-slate-500">Counted / Recounted</div>
          <div className="text-lg font-black text-slate-900 mt-0.5">{summaryMetrics.countedItemsCount} SKUs</div>
          <div className="text-[11px] text-emerald-600 font-bold mt-0.5">{summaryMetrics.matchingCount} Exact Matches</div>
        </div>

        <div className="p-2 pt-4 md:pt-2">
          <div className="text-xs font-semibold text-slate-500">Variances Flagged</div>
          <div className={`text-lg font-black mt-0.5 ${summaryMetrics.discrepancyCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {summaryMetrics.discrepancyCount} Discrepancies
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Require Manager Review</div>
        </div>

        <div className="p-2 pt-4 md:pt-2">
          <div className="text-xs font-semibold text-slate-500">Shrinkage Valuation</div>
          <div className="text-lg font-black text-red-600 mt-0.5">
            -{currency}{summaryMetrics.totalShrinkageValue.toFixed(2)}
          </div>
          <div className="text-[11px] text-red-500 font-medium mt-0.5">Physical Loss / Theft</div>
        </div>

        <div className="p-2 pt-4 md:pt-2">
          <div className="text-xs font-semibold text-slate-500">Net Stock Adjustment</div>
          <div className={`text-lg font-black mt-0.5 ${summaryMetrics.netVarianceValue >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {summaryMetrics.netVarianceValue >= 0 ? '+' : ''}{currency}{summaryMetrics.netVarianceValue.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Valuation impact</div>
        </div>
      </div>

      {/* Submission Success Alert */}
      {submissionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs sm:text-sm text-emerald-900 flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold text-emerald-950">Approval Request Submitted!</strong>
              <p className="mt-0.5 text-emerald-800">{submissionSuccess}</p>
            </div>
          </div>
          <button
            onClick={() => setSubmissionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Count Form Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search product by SKU, name, or shelf..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#FF6600] text-slate-900"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 scrollbar-none">
            {/* Department Filter Select */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">Dept:</span>
              <select
                value={selectedDepartmentFilter}
                onChange={(e) => setSelectedDepartmentFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
              >
                {allDepartments.map(d => (
                  <option key={d} value={d}>{d === 'ALL' ? 'All Departments' : d}</option>
                ))}
              </select>
            </div>

            {/* Shelf Filter Select */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">Shelf:</span>
              <select
                value={activeShelfFilter}
                onChange={(e) => setActiveShelfFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Shelves ({allShelves.length})</option>
                {allShelves.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* BI Anomaly Check Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0">
              <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
              <span className="text-slate-500">BI Check:</span>
              <select
                value={selectedBIFilter}
                onChange={(e) => setSelectedBIFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Products</option>
                <option value="NO_TRACEABLE_SALES">⚠️ Stocked - No POS Sales</option>
                <option value="FAST_MOVING_MISMATCH">🚀 Fast Moving Velocity</option>
                <option value="SUSPICIOUS_MOVEMENT">🔄 Suspicious Movements</option>
                <option value="HIGH_VALUE_EXPOSURE">💎 High Value Exposure ($100+)</option>
              </select>
            </div>

            {/* Discrepancies Only Toggle */}
            <button
              onClick={() => setShowDiscrepancyOnly(!showDiscrepancyOnly)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer border ${
                showDiscrepancyOnly
                  ? 'bg-red-600 text-white border-red-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Variances Only ({summaryMetrics.discrepancyCount})
            </button>

            {/* Reset Counts */}
            <button
              onClick={handleResetCounts}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1 transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Counts</span>
            </button>
          </div>

        </div>
      </div>

      {/* Stocktake Physical Count Form Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-slate-300 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">UM</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Shelf / Bin</th>
                <th className="py-3 px-4 text-center">System Qty</th>
                <th className="py-3 px-4 text-center min-w-[180px]">Physical Counted Qty</th>
                <th className="py-3 px-4 text-center">Variance (Delta)</th>
                <th className="py-3 px-4 text-right">Valuation Impact</th>
                <th className="py-3 px-4 min-w-[200px]">Variance Audit Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {displayedProducts.map((p) => {
                const sysQty = currentStockMap[p.id] || 0;
                const cntQty = countedQuantities[p.id] !== undefined ? countedQuantities[p.id] : sysQty;
                const delta = cntQty - sysQty;
                const view = buildProductLocationStockView(p, { id: selectedLocationId, name: currentLocationName }, sysQty);
                const valuationImpact = delta * (p.costPrice || 0);

                const isDiscrepancy = delta !== 0;
                const isShrinkage = delta < 0;
                const isSurplus = delta > 0;

                return (
                  <tr 
                    key={p.id}
                    className={`transition-colors ${
                      isShrinkage 
                        ? 'bg-red-50/40 hover:bg-red-50/70' 
                        : isSurplus 
                        ? 'bg-blue-50/40 hover:bg-blue-50/70' 
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold">{view.sku}</td>
                    <td className="py-3 px-4 font-bold">{view.productName}</td>
                    <td className="py-3 px-4">{view.description || '—'}</td>
                    <td className="py-3 px-4">{view.category}</td>
                    <td className="py-3 px-4">{view.size || '—'}</td>
                    <td className="py-3 px-4">{view.unitOfMeasure}</td>
                    <td className="py-3 px-4">{view.locationName}</td>

                    {/* Shelf */}
                    <td className="py-3 px-4">
                      <span className="bg-slate-100 text-slate-800 font-bold px-2 py-1 rounded-lg text-[11px]">
                        {[view.shelfCode, view.binCode].filter(Boolean).join(' / ') || '—'}
                      </span>
                    </td>

                    {/* System Qty */}
                    <td className="py-3 px-4 text-center font-bold text-slate-700 text-sm">
                      {view.systemQuantity} <span className="text-[10px] text-slate-400 font-normal">{view.unitOfMeasure}</span>
                    </td>

                    {/* Physical Counted Qty Input */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1 max-w-[160px] mx-auto">
                        <button
                          type="button"
                          onClick={() => handleCountChange(p.id, cntQty - 1)}
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>

                        <input
                          type="number"
                          min="0"
                          value={cntQty}
                          onChange={(e) => handleCountChange(p.id, parseInt(e.target.value) || 0)}
                          className={`w-16 py-1 text-center font-extrabold text-sm border rounded-lg focus:ring-2 focus:ring-[#FF6600] ${
                            isDiscrepancy 
                              ? 'border-[#FF6600] bg-orange-50/30 text-slate-900' 
                              : 'border-slate-200 bg-white text-slate-900'
                          }`}
                        />

                        <button
                          type="button"
                          onClick={() => handleCountChange(p.id, cntQty + 1)}
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* Delta Variance */}
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-black inline-flex items-center gap-1 ${
                        isShrinkage 
                          ? 'bg-red-100 text-red-700 border border-red-200' 
                          : isSurplus 
                          ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                          : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      }`}>
                        {delta > 0 ? `+${delta}` : delta} {view.unitOfMeasure}
                      </span>
                    </td>

                    {/* Valuation Impact */}
                    <td className="py-3 px-4 text-right font-extrabold text-xs">
                      <span className={valuationImpact < 0 ? 'text-red-600' : valuationImpact > 0 ? 'text-blue-600' : 'text-slate-400'}>
                        {valuationImpact > 0 ? '+' : ''}{currency}{valuationImpact.toFixed(2)}
                      </span>
                    </td>

                    {/* Reason Select */}
                    <td className="py-3 px-4">
                      {isDiscrepancy ? (
                        <select
                          value={varianceReasons[p.id] || ''}
                          onChange={(e) => handleReasonChange(p.id, e.target.value)}
                          className="w-full p-1.5 bg-white border border-red-200 rounded-lg text-xs font-medium text-slate-800 focus:ring-1 focus:ring-red-500"
                        >
                          <option value="">-- Select Audit Reason --</option>
                          <option value="Suspected Theft / Physical Shrinkage">Suspected Theft / Physical Shrinkage</option>
                          <option value="Damaged / Expired Product">Damaged / Expired Product</option>
                          <option value="Misplaced / Wrong Shelf Location">Misplaced / Wrong Shelf Location</option>
                          <option value="Unrecorded Intake / Recount Match">Unrecorded Intake / Recount Match</option>
                          <option value="System Data Entry Error">System Data Entry Error</option>
                        </select>
                      ) : (
                        <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Physical Count Matches System
                        </span>
                      )}
                    </td>

                  </tr>
                );
              })}

              {displayedProducts.length === 0 && (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400">
                    <Boxes className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-600">No products match your current stocktake filter criteria.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Submission Action Bar */}
        <div className="p-5 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800">
          <div className="text-xs text-slate-300">
            Recorded Variances: <strong className="text-white text-sm">{summaryMetrics.discrepancyCount} SKUs</strong>
            <span className="ml-2 text-slate-400">| Net Valuation:</span>{' '}
            <strong className={summaryMetrics.netVarianceValue >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {currency}{summaryMetrics.netVarianceValue.toFixed(2)}
            </strong>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleSubmitApproval}
              disabled={isSubmitting || summaryMetrics.discrepancyCount === 0}
              className="w-full sm:w-auto px-6 py-3 bg-[#FF6600] hover:bg-[#E65C00] disabled:opacity-50 text-white font-extrabold rounded-xl text-xs sm:text-sm shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Submitting to Approvals...' : 'Submit Stocktake for Manager Approval'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* BI Loss & Theft Immediate Count Modal */}
      <BILossPreventionModal
        isOpen={isBILossModalOpen}
        onClose={() => setIsBILossModalOpen(false)}
        products={products}
        warehouseStock={warehouseStock}
        branchStock={branchStock}
        selectedLocationType={selectedLocationType}
        selectedLocationId={selectedLocationId}
        onLoadFlaggedItemsToForm={handleLoadFlaggedItemsToForm}
      />

    </div>
  );
};
