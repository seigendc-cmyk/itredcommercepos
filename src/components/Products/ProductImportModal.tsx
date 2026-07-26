import React, { useState, useEffect } from 'react';
import { Product, VendorProfile } from '../../types';
import { 
  SECTOR_CONFIGS, 
  getSectorConfig, 
  parseRawImportText, 
  ParsedImportRow, 
  SectorConfig 
} from '../../utils/productMatcher';
import { 
  FileSpreadsheet, 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Layers, 
  X, 
  ArrowRight, 
  Search, 
  RefreshCw, 
  Building2, 
  Zap, 
  MapPin, 
  Tag, 
  HelpCircle,
  Plus,
  GitMerge,
  Ban
} from 'lucide-react';

interface ProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: VendorProfile;
  existingProducts: Product[];
  onConfirmImport: (
    newProducts: Partial<Product>[],
    stockUpdates: { productId: string; addWarehouseQty: number }[],
    importSummary: { totalImported: number; totalMerged: number; sector: string }
  ) => void;
}

export const ProductImportModal: React.FC<ProductImportModalProps> = ({
  isOpen,
  onClose,
  vendor,
  existingProducts,
  onConfirmImport
}) => {
  const [sectorConfig, setSectorConfig] = useState<SectorConfig>(getSectorConfig(vendor.businessSector));
  const [activeStep, setActiveStep] = useState<'input' | 'preview'>('input');
  const [rawText, setRawText] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    setSectorConfig(getSectorConfig(vendor.businessSector));
  }, [vendor.businessSector]);

  if (!isOpen) return null;

  // Load Sector Sample Template Data
  const handleLoadSampleTemplate = () => {
    const samples = sectorConfig.sampleProducts;
    const textRows = samples.map(s => 
      `${s.sku}\t${s.name}\t${s.category}\t${s.costPrice}\t${s.sellingPrice}\t${s.quantity}\t${s.unit}\t${s.location}\t${s.shelf}`
    ).join('\n');

    setRawText(textRows);
    processParsedRows(textRows);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
        processParsedRows(content);
      }
    };
    reader.readAsText(file);
  };

  const processParsedRows = (text: string) => {
    setIsProcessing(true);
    setTimeout(() => {
      const rows = parseRawImportText(text, existingProducts, sectorConfig);
      setParsedRows(rows);
      setActiveStep('preview');
      setIsProcessing(false);
    }, 300);
  };

  const handleRowActionChange = (id: string, action: 'IMPORT_NEW' | 'MERGE_STOCK' | 'OVERWRITE' | 'SKIP') => {
    setParsedRows(prev => prev.map(r => r.id === id ? { ...r, action } : r));
  };

  const handleFixSku = (id: string) => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setParsedRows(prev => prev.map(r => {
      if (r.id === id) {
        const newSku = `${r.sku}-AUTO-${randomSuffix}`;
        return {
          ...r,
          assignedSku: newSku,
          skuConflict: false,
          action: 'IMPORT_NEW'
        };
      }
      return r;
    }));
  };

  // Bulk Actions
  const handleBulkAutoFixSkus = () => {
    setParsedRows(prev => prev.map(r => {
      if (r.skuConflict) {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        return {
          ...r,
          assignedSku: `${r.sku}-AUTO-${randomSuffix}`,
          skuConflict: false,
          action: 'IMPORT_NEW'
        };
      }
      return r;
    }));
  };

  const handleBulkSetAction = (action: 'IMPORT_NEW' | 'MERGE_STOCK' | 'SKIP') => {
    setParsedRows(prev => prev.map(r => ({ ...r, action })));
  };

  // Finalize Import
  const handleCommitImport = () => {
    const newProductsToCreate: Partial<Product>[] = [];
    const stockUpdatesToApply: { productId: string; addWarehouseQty: number }[] = [];

    let countImported = 0;
    let countMerged = 0;

    parsedRows.forEach(row => {
      if (row.action === 'SKIP') return;

      if (row.action === 'IMPORT_NEW') {
        newProductsToCreate.push({
          sku: row.assignedSku,
          name: row.name,
          category: row.category,
          costPrice: row.costPrice,
          sellingPrice: row.sellingPrice,
          unit: row.unit,
          location: row.location,
          shelf: row.shelf,
          reorderLevel: row.reorderLevel,
          barcode: String(Math.floor(1000000000 + Math.random() * 9000000000))
        });

        // Add incoming stock for new product
        if (row.quantity > 0) {
          stockUpdatesToApply.push({
            productId: row.assignedSku, // Temporary mapping handle
            addWarehouseQty: row.quantity
          });
        }

        countImported++;
      } else if (row.action === 'MERGE_STOCK') {
        const targetProduct = row.skuMatchExistingProduct || row.similarityMatch?.existingProduct;
        if (targetProduct) {
          stockUpdatesToApply.push({
            productId: targetProduct.id,
            addWarehouseQty: row.quantity
          });
          countMerged++;
        }
      }
    });

    onConfirmImport(newProductsToCreate, stockUpdatesToApply, {
      totalImported: countImported,
      totalMerged: countMerged,
      sector: sectorConfig.label
    });

    onClose();
  };

  const totalNew = parsedRows.filter(r => r.action === 'IMPORT_NEW').length;
  const totalMerged = parsedRows.filter(r => r.action === 'MERGE_STOCK').length;
  const totalSkipped = parsedRows.filter(r => r.action === 'SKIP').length;
  const totalSkuConflicts = parsedRows.filter(r => r.skuConflict).length;
  const totalSimilarities = parsedRows.filter(r => r.similarityMatch && !r.skuConflict).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        
        {/* Header Bar */}
        <div className="bg-[#333333] text-white p-6 border-b-4 border-[#FF6B00] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-[#FF6B00] rounded-2xl flex items-center justify-center font-bold text-white shadow-md">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Smart Product & Inventory Import Engine</h2>
                <span className="px-2.5 py-0.5 bg-orange-500/20 border border-[#FF6B00]/40 text-[#FF6B00] rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {sectorConfig.label}
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-0.5">
                Duplicate SKU protection, wording similarity engine & industrial sector auto-mapping.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: INPUT SOURCE */}
        {activeStep === 'input' && (
          <div className="p-6 sm:p-8 space-y-6">
            
            {/* Sector Notification Banner */}
            <div className="p-4 bg-orange-50/70 border border-orange-200/80 rounded-2xl flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-[#FF6B00] shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-slate-900">
                  Industrial Sector Configured: <span className="text-[#FF6B00]">{sectorConfig.label}</span>
                </p>
                <p className="text-slate-600 leading-relaxed">
                  {sectorConfig.description} Defaults for categories, units, locations, and shelf tags will auto-map during parsing.
                </p>
              </div>
            </div>

            {/* Input Method Choices */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Option A: Upload CSV File */}
              <div className="p-6 bg-slate-50 border-2 border-dashed border-slate-300 hover:border-[#FF6B00] rounded-2xl text-center space-y-3 transition group cursor-pointer relative">
                <input
                  type="file"
                  accept=".csv, .tsv, .txt"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="w-12 h-12 bg-white rounded-2xl shadow-sm text-[#FF6B00] flex items-center justify-center mx-auto group-hover:scale-110 transition">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900">Upload CSV / TSV File</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Drag and drop your product catalog spreadsheet file (.csv, .tsv, .txt)
                  </p>
                </div>
              </div>

              {/* Option B: Load Demo Sample for Sector */}
              <div
                onClick={handleLoadSampleTemplate}
                className="p-6 bg-orange-50/40 border border-orange-200 hover:border-[#FF6B00] rounded-2xl text-center space-y-3 transition cursor-pointer group"
              >
                <div className="w-12 h-12 bg-white rounded-2xl shadow-sm text-[#FF6B00] flex items-center justify-center mx-auto group-hover:scale-110 transition">
                  <Zap className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900">Test with {sectorConfig.label} Demo Batch</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Loads sample products including similar wording items (e.g. <em>Honda Fit GD1 Ball Joint</em> vs <em>Honda GD1 Ball Joint</em>) to preview duplicate matching.
                  </p>
                </div>
              </div>

            </div>

            {/* Option C: Paste Raw Text / Excel Rows */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Or Paste Tabular Data / Excel Rows Directly
                </label>
                <span className="text-[11px] text-slate-400">
                  Format: SKU, Name, Category, Cost, SellingPrice, Quantity, Unit, Location, Shelf
                </span>
              </div>

              <textarea
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                rows={6}
                placeholder={`AUTO-BJ-GD1\tHonda Fit GD1 Front Ball Joint\tSuspension & Steering\t18.50\t38.00\t20\tpcs\tAisle A\tShelf 01\nAUTO-GD1-BJ\tHonda GD1 Ball Joint\tSuspension & Steering\t18.50\t38.00\t10\tpcs\tAisle A\tShelf 02`}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:ring-2 focus:ring-[#FF6B00] outline-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!rawText.trim() || isProcessing}
                onClick={() => processParsedRows(rawText)}
                className="px-6 py-2.5 bg-[#FF6B00] hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md flex items-center gap-2 transition cursor-pointer"
              >
                <span>{isProcessing ? 'Analyzing Batch...' : 'Parse & Detect Duplicates'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        )}

        {/* STEP 2: DUPLICATE & SIMILARITY PREVIEW WORKBENCH */}
        {activeStep === 'preview' && (
          <div className="p-6 sm:p-8 space-y-6">
            
            {/* Status Statistics Header */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="bg-slate-100 p-3 rounded-2xl border border-slate-200 text-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Total Items Parsed</p>
                <p className="text-lg font-black text-slate-900">{parsedRows.length}</p>
              </div>

              <div className="bg-green-50 p-3 rounded-2xl border border-green-200 text-center">
                <p className="text-[10px] font-bold text-green-700 uppercase">🟢 Ready to Add</p>
                <p className="text-lg font-black text-green-800">{totalNew}</p>
              </div>

              <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 text-center">
                <p className="text-[10px] font-bold text-amber-800 uppercase">🟡 Fuzzy Matches</p>
                <p className="text-lg font-black text-amber-900">{totalSimilarities}</p>
              </div>

              <div className="bg-red-50 p-3 rounded-2xl border border-red-200 text-center">
                <p className="text-[10px] font-bold text-red-700 uppercase">🔴 SKU Conflicts</p>
                <p className="text-lg font-black text-red-800">{totalSkuConflicts}</p>
              </div>

              <div className="bg-blue-50 p-3 rounded-2xl border border-blue-200 text-center col-span-2 sm:col-span-1">
                <p className="text-[10px] font-bold text-blue-800 uppercase">Stock Merges</p>
                <p className="text-lg font-black text-blue-900">{totalMerged}</p>
              </div>
            </div>

            {/* Quick Bulk Action Bar */}
            <div className="p-3 bg-slate-900 text-white rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#FF6B00]" />
                <span className="font-bold">Smart Resolution Controls:</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {totalSkuConflicts > 0 && (
                  <button
                    onClick={handleBulkAutoFixSkus}
                    className="px-3 py-1.5 bg-[#FF6B00] hover:bg-orange-600 text-white font-bold rounded-xl transition flex items-center gap-1.5 shadow"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Auto-Assign SKUs for Conflicts</span>
                  </button>
                )}

                <button
                  onClick={() => handleBulkSetAction('MERGE_STOCK')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold rounded-xl transition flex items-center gap-1.5 border border-slate-700"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  <span>Merge All Similar Stock</span>
                </button>

                <button
                  onClick={() => handleBulkSetAction('IMPORT_NEW')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-green-300 font-bold rounded-xl transition flex items-center gap-1.5 border border-slate-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Import All as New</span>
                </button>
              </div>
            </div>

            {/* PARSED PRODUCTS TABLE */}
            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-2xl shadow-inner">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1F242D] text-slate-200 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="p-3">SKU & Status</th>
                    <th className="p-3">Imported Product Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-center">Cost / Retail</th>
                    <th className="p-3 text-center">Incoming QTY</th>
                    <th className="p-3">Fuzzy Similarity Match</th>
                    <th className="p-3 text-right">Import Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {parsedRows.map((row) => (
                    <tr key={row.id} className={`hover:bg-slate-50 transition ${
                      row.skuConflict ? 'bg-red-50/30' : row.similarityMatch ? 'bg-amber-50/20' : ''
                    }`}>
                      
                      {/* SKU & Status */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 font-mono font-bold">
                          <span>{row.assignedSku}</span>
                          {row.skuConflict && (
                            <span className="px-1.5 py-0.2 bg-red-100 text-red-700 rounded text-[9px] font-sans flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> SKU Conflict
                            </span>
                          )}
                        </div>
                        {row.skuConflict && (
                          <button
                            onClick={() => handleFixSku(row.id)}
                            className="mt-1 text-[10px] text-[#FF6B00] hover:underline font-bold flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" /> Auto-Fix SKU
                          </button>
                        )}
                      </td>

                      {/* Product Name */}
                      <td className="p-3">
                        <p className="font-bold text-slate-900">{row.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {row.location} • {row.shelf}
                        </p>
                      </td>

                      {/* Category */}
                      <td className="p-3 text-slate-600">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px]">{row.category}</span>
                      </td>

                      {/* Cost / Retail */}
                      <td className="p-3 text-center font-mono">
                        <div className="text-slate-600">${row.costPrice.toFixed(2)}</div>
                        <div className="text-[#FF6B00] font-bold">${row.sellingPrice.toFixed(2)}</div>
                      </td>

                      {/* Incoming Quantity */}
                      <td className="p-3 text-center font-bold">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg">
                          +{row.quantity} {row.unit}
                        </span>
                      </td>

                      {/* Fuzzy Match Info */}
                      <td className="p-3">
                        {row.similarityMatch ? (
                          <div className="space-y-0.5">
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-bold text-[10px] inline-flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-amber-600" />
                              {row.similarityMatch.percentage}% Match: {row.similarityMatch.existingProduct.name}
                            </span>
                            <p className="text-[10px] text-slate-400">
                              Matched SKU: <code className="font-mono">{row.similarityMatch.existingProduct.sku}</code>
                            </p>
                          </div>
                        ) : row.skuMatchExistingProduct ? (
                          <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded font-bold text-[10px]">
                            Exact SKU Exists ({row.skuMatchExistingProduct.name})
                          </span>
                        ) : (
                          <span className="text-[11px] text-green-600 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Unique Product
                          </span>
                        )}
                      </td>

                      {/* Action Choice */}
                      <td className="p-3 text-right">
                        <select
                          value={row.action}
                          onChange={e => handleRowActionChange(row.id, e.target.value as any)}
                          className={`text-xs font-bold p-1.5 rounded-xl border outline-none cursor-pointer ${
                            row.action === 'IMPORT_NEW'
                              ? 'bg-green-50 border-green-300 text-green-800'
                              : row.action === 'MERGE_STOCK'
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : 'bg-slate-100 border-slate-300 text-slate-600'
                          }`}
                        >
                          <option value="IMPORT_NEW">🟢 Import as New Product</option>
                          <option value="MERGE_STOCK">🟡 Merge Stock into Existing</option>
                          <option value="SKIP">⚪ Skip Row</option>
                        </select>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                onClick={() => setActiveStep('input')}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                Back to Raw Input
              </button>

              <button
                onClick={handleCommitImport}
                disabled={totalSkuConflicts > 0}
                className="px-6 py-3 bg-[#FF6B00] hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-xl flex items-center gap-2 transition cursor-pointer"
              >
                <span>Commit Product Import ({totalNew} New, {totalMerged} Merging)</span>
                <CheckCircle2 className="w-5 h-5" />
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
