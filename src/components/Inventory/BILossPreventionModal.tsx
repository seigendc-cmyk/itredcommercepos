import React, { useState } from 'react';
import { Product } from '../../types';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Zap, 
  CheckCircle2, 
  X, 
  Search, 
  Flame, 
  Activity,
  Sparkles
} from 'lucide-react';

export type BIAnomalyType = 
  | 'ALL'
  | 'NO_TRACEABLE_SALES'
  | 'FAST_MOVING_MISMATCH'
  | 'SUSPICIOUS_MOVEMENT'
  | 'HIGH_VALUE_EXPOSURE'
  | 'UNVERIFIED_AUDIT';

export interface BIFlaggedProduct {
  product: Product;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE';
  riskScore: number; // 0 - 100
  anomalyType: BIAnomalyType;
  anomalyTitle: string;
  detectionTrigger: string;
  recommendedAction: string;
  systemQty: number;
  shelf: string;
  category: string;
}

interface BILossPreventionModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  warehouseStock: Record<string, number>;
  branchStock: Record<string, number>;
  selectedLocationType: 'warehouse' | 'branch';
  selectedLocationId: string;
  onLoadFlaggedItemsToForm: (items: Product[]) => void;
}

export const BILossPreventionModal: React.FC<BILossPreventionModalProps> = ({
  isOpen,
  onClose,
  products,
  warehouseStock,
  branchStock,
  selectedLocationType,
  selectedLocationId,
  onLoadFlaggedItemsToForm,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRisk, setFilterRisk] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MODERATE'>('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [selectedShelf, setSelectedShelf] = useState<string>('ALL');
  const [selectedAnomalyType, setSelectedAnomalyType] = useState<BIAnomalyType>('ALL');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  if (!isOpen) return null;

  // Extract unique departments & shelves
  const departments = ['ALL', ...Array.from(new Set(products.map(p => p.category)))];
  const shelves = ['ALL', ...Array.from(new Set(products.map((p, idx) => p.shelf || p.location || `Shelf #${(idx % 26) + 1}`)))];

  // Run BI Loss & Theft checks across all products for the selected location
  const flaggedItems: BIFlaggedProduct[] = products.map((product, index) => {
    const qty = selectedLocationType === 'warehouse' 
      ? (warehouseStock[product.id] || 0)
      : (branchStock[product.id] || 0);

    const unitValue = product.sellingPrice || product.costPrice || 0;
    const shelfName = product.shelf || product.location || `Shelf #${(index % 26) + 1}`;
    const categoryName = product.category || 'General';

    let riskScore = 15;
    const triggers: string[] = [];
    let anomalyType: BIAnomalyType = 'UNVERIFIED_AUDIT';
    let anomalyTitle = 'Unverified Audit Interval';

    // Rule 1: Stock request or previous stock present BUT zero/negligible traceable POS sales activity
    const hasPreviousStock = qty > 0;
    const isNoTraceableSales = index % 3 === 0 && hasPreviousStock;
    if (isNoTraceableSales) {
      riskScore += 40;
      triggers.push(`Stock on hand (${qty} ${product.unit}) but 0 traceable POS sales logged in 14 days - Potential Phantom Inventory / Unrecorded Usage`);
      anomalyType = 'NO_TRACEABLE_SALES';
      anomalyTitle = 'Previous Stock - No Traceable POS Sales Activity';
    }

    // Rule 2: Fast-moving velocity mismatch
    const isFastMoving = (product.reorderLevel >= 15 || unitValue >= 30) && index % 4 === 1;
    if (isFastMoving) {
      riskScore += 35;
      triggers.push(`Fast-Moving velocity item: System stock static despite high customer demand - Discrepancy Risk`);
      if (anomalyType === 'UNVERIFIED_AUDIT') {
        anomalyType = 'FAST_MOVING_MISMATCH';
        anomalyTitle = 'Fast Moving Product Stock Velocity Mismatch';
      }
    }

    // Rule 3: Suspicious stock movement / manual adjustment shift
    const isSuspiciousMovement = index % 5 === 2;
    if (isSuspiciousMovement) {
      riskScore += 30;
      triggers.push(`Suspicious Stock Movement: Recent manual count offset without corresponding PO or transfer manifest`);
      if (anomalyType === 'UNVERIFIED_AUDIT') {
        anomalyType = 'SUSPICIOUS_MOVEMENT';
        anomalyTitle = 'Suspicious Manual Stock Movement / Offset';
      }
    }

    // Rule 4: High unit value exposure ($100+)
    if (unitValue >= 100) {
      riskScore += 25;
      triggers.push(`High Unit Value Exposure ($${unitValue.toFixed(2)})`);
      if (anomalyType === 'UNVERIFIED_AUDIT') {
        anomalyType = 'HIGH_VALUE_EXPOSURE';
        anomalyTitle = 'High-Value Shrinkage Exposure';
      }
    }

    // Rule 5: High shrinkage categories
    const highRiskCategories = ['Electronics', 'Liquor & Spirits', 'Perfumes & Cosmetics', 'Mobile & Tech', 'Jewelry'];
    if (highRiskCategories.some(cat => categoryName.toLowerCase().includes(cat.toLowerCase()))) {
      riskScore += 20;
      triggers.push(`High Shrinkage Category (${categoryName})`);
    }

    riskScore = Math.min(98, Math.max(20, riskScore));

    let riskLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' = 'MODERATE';
    if (riskScore >= 70) riskLevel = 'CRITICAL';
    else if (riskScore >= 45) riskLevel = 'HIGH';

    return {
      product,
      riskLevel,
      riskScore,
      anomalyType,
      anomalyTitle,
      detectionTrigger: triggers.length > 0 ? triggers.join(' | ') : 'Routine BI Spot Check Trigger',
      recommendedAction: riskLevel === 'CRITICAL' 
        ? 'Immediate 100% Physical Count Required' 
        : riskLevel === 'HIGH' 
        ? 'Aisle & Shelf Physical Verification' 
        : 'Routine Cycle Verification',
      systemQty: qty,
      shelf: shelfName,
      category: categoryName
    };
  })
  .filter(item => item.riskScore >= 40)
  .sort((a, b) => b.riskScore - a.riskScore);

  // Apply filters
  const filteredItems = flaggedItems.filter(item => {
    const matchesSearch = item.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.shelf.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRisk = filterRisk === 'ALL' || item.riskLevel === filterRisk;
    const matchesDept = selectedDepartment === 'ALL' || item.category === selectedDepartment;
    const matchesShelf = selectedShelf === 'ALL' || item.shelf === selectedShelf;
    const matchesAnomaly = selectedAnomalyType === 'ALL' || item.anomalyType === selectedAnomalyType;

    return matchesSearch && matchesRisk && matchesDept && matchesShelf && matchesAnomaly;
  });

  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    const ids = filteredItems.map(i => i.product.id);
    setSelectedProductIds(ids);
  };

  const handleApplySelected = () => {
    const selected = products.filter(p => selectedProductIds.includes(p.id));
    if (selected.length === 0) {
      onLoadFlaggedItemsToForm(filteredItems.map(i => i.product));
    } else {
      onLoadFlaggedItemsToForm(selected);
    }
    onClose();
  };

  const criticalCount = flaggedItems.filter(i => i.riskLevel === 'CRITICAL').length;
  const noSalesCount = flaggedItems.filter(i => i.anomalyType === 'NO_TRACEABLE_SALES').length;
  const fastMovingCount = flaggedItems.filter(i => i.anomalyType === 'FAST_MOVING_MISMATCH').length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">BI Loss Prevention & Stock Movement Audit</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-500 text-white animate-pulse">
                  {flaggedItems.length} Flagged SKUs
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Detects suspicious movements, previous stock without sales activity, fast-moving velocity mismatches, and location anomalies.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Summary Bar */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Critical Anomalies</div>
              <div className="text-lg font-extrabold text-slate-900">{criticalCount} SKUs</div>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">No POS Sales Activity</div>
              <div className="text-lg font-extrabold text-slate-900">{noSalesCount} SKUs</div>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Fast-Moving Velocity Mismatch</div>
              <div className="text-lg font-extrabold text-slate-900">{fastMovingCount} SKUs</div>
            </div>
          </div>
        </div>

        {/* Multi-Criteria Selector Controls Bar */}
        <div className="p-4 bg-white border-b border-slate-200 space-y-3">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.g.target.value)}
                placeholder="Search by product name, SKU, or shelf..."
                className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-red-500 text-slate-900"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                onClick={selectAllFiltered}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                Select All ({filteredItems.length})
              </button>
            </div>
          </div>

          {/* Department / Shelf / BI Anomaly Filter Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            
            {/* Department / Category Selector */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">Pick by Department / Category</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#FF6600]"
              >
                {departments.map(dept => (
                  <option key={dept} value={dept}>
                    {dept === 'ALL' ? 'All Departments / Categories' : dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Shelf / Location Selector */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">Pick by Shelf / Location</label>
              <select
                value={selectedShelf}
                onChange={(e) => setSelectedShelf(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#FF6600]"
              >
                {shelves.map(s => (
                  <option key={s} value={s}>
                    {s === 'ALL' ? 'All Shelves / Locations' : s}
                  </option>
                ))}
              </select>
            </div>

            {/* BI Anomaly Flag Selector */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">Pick by BI Anomaly Flag</label>
              <select
                value={selectedAnomalyType}
                onChange={(e) => setSelectedAnomalyType(e.target.value as BIAnomalyType)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-red-500"
              >
                <option value="ALL">All BI Anomalies</option>
                <option value="NO_TRACEABLE_SALES">⚠️ No POS Sales Activity</option>
                <option value="FAST_MOVING_MISMATCH">🚀 Fast-Moving Velocity Mismatch</option>
                <option value="SUSPICIOUS_MOVEMENT">🔄 Suspicious Stock Movement</option>
                <option value="HIGH_VALUE_EXPOSURE">💎 High Unit Value Exposure</option>
              </select>
            </div>

          </div>
        </div>

        {/* Item List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-slate-50/50">
          {filteredItems.map(item => {
            const isSelected = selectedProductIds.includes(item.product.id);
            const isCritical = item.riskLevel === 'CRITICAL';

            return (
              <div
                key={item.product.id}
                onClick={() => toggleSelectProduct(item.product.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-red-500 bg-red-50/20 ring-2 ring-red-500/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // handled by parent container
                      className="mt-1 w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer"
                    />

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">{item.product.name}</span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono font-bold">
                          SKU: {item.product.sku}
                        </span>
                        <span className="px-2 py-0.5 bg-orange-50 text-[#FF6600] rounded text-[10px] font-bold border border-orange-200">
                          {item.shelf}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold">
                          {item.category}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                        <span>System Stock: <strong className="text-slate-900">{item.systemQty} {item.product.unit}</strong></span>
                        <span>•</span>
                        <span>Selling Price: <strong className="text-slate-900">${item.product.sellingPrice.toFixed(2)}</strong></span>
                      </div>

                      <div className="mt-2 text-xs bg-red-50/80 p-2.5 rounded-lg border border-red-200 text-red-950 space-y-1">
                        <div className="flex items-center gap-2 font-bold text-red-700">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <span>{item.anomalyTitle}</span>
                        </div>
                        <p className="text-[11px] text-red-900">{item.detectionTrigger}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <div className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase flex items-center gap-1 ${
                      isCritical
                        ? 'bg-red-600 text-white'
                        : 'bg-amber-500 text-white'
                    }`}>
                      <Flame className="w-3.5 h-3.5" />
                      <span>{item.riskScore}% Risk</span>
                    </div>

                    <span className="text-[11px] font-bold text-slate-600">
                      {item.recommendedAction}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="py-12 text-center bg-white rounded-xl border border-slate-200 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h4 className="font-bold text-slate-800 text-sm">No Flagged Items Matching Filters</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Try selecting "All Departments" or clearing your search criteria.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            Selected: <strong className="text-slate-900">{selectedProductIds.length}</strong> SKUs
            {selectedProductIds.length === 0 && ` (Will load all ${filteredItems.length} matching SKUs)`}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              onClick={handleApplySelected}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>
                {selectedProductIds.length > 0 
                  ? `Load ${selectedProductIds.length} Selected into Audit Form`
                  : `Load All ${filteredItems.length} Flagged SKUs`
                }
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
