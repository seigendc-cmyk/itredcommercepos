import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import { Product, VendorProfile } from '../../types';
import {
  CanonicalProductImportRow,
  detectProductDuplicates,
  parseProductImportFile,
  ProductImportBatch,
  ProductImportLocation,
} from '../../features/product-import';

interface ProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: VendorProfile;
  existingProducts: Product[];
  locations: ProductImportLocation[];
  onConfirmImport: (batch: ProductImportBatch, rows: CanonicalProductImportRow[]) => Promise<void>;
  onImportEvent?: (type: 'PRODUCT_IMPORT_REJECTED' | 'PRODUCT_IMPORT_VALIDATED' | 'PRODUCT_IMPORT_ROW_REJECTED' | 'PRODUCT_DUPLICATE_DETECTED', details: Record<string, unknown>) => void;
}

export const ProductImportModal: React.FC<ProductImportModalProps> = ({
  isOpen, onClose, vendor, existingProducts, locations, onConfirmImport, onImportEvent,
}) => {
  const [batch, setBatch] = useState<ProductImportBatch | null>(null);
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);
  const validRows = useMemo(() => batch?.rows.filter(row => row.errors.length === 0) || [], [batch]);
  if (!isOpen) return null;

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setFileError(''); setBatch(null);
    try {
      const parsed = await parseProductImportFile(file, locations.map(location => location.code));
      detectProductDuplicates(parsed.rows, existingProducts);
      parsed.rows.forEach(row => { if (!row.duplicateProduct) row.decision = 'CREATE'; });
      setBatch(parsed);
      if (parsed.errors.length) onImportEvent?.('PRODUCT_IMPORT_REJECTED', { batchId: parsed.batchId, fileName: file.name, outcome: 'rejected', reasonCodes: [...new Set(parsed.errors.map(error => error.code))] });
      else onImportEvent?.('PRODUCT_IMPORT_VALIDATED', { batchId: parsed.batchId, fileName: file.name, outcome: 'validated', rowCount: parsed.rows.length });
      parsed.rows.filter(row => row.errors.length).forEach(row => onImportEvent?.('PRODUCT_IMPORT_ROW_REJECTED', { batchId: parsed.batchId, rowNumber: row.rowNumber, outcome: 'rejected', reasonCodes: row.errors.map(error => error.code) }));
      parsed.rows.filter(row => row.warnings.length).forEach(row => onImportEvent?.('PRODUCT_DUPLICATE_DETECTED', { batchId: parsed.batchId, rowNumber: row.rowNumber, outcome: 'review_required' }));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'The file could not be parsed.');
      onImportEvent?.('PRODUCT_IMPORT_REJECTED', { fileName: file.name, outcome: 'rejected', reasonCode: 'FILE_REJECTED' });
    } finally { setBusy(false); event.target.value = ''; }
  };

  const setDecision = (rowNumber: number, decision: CanonicalProductImportRow['decision']) => {
    if (!batch) return;
    setBatch({ ...batch, rows: batch.rows.map(row => row.rowNumber === rowNumber ? { ...row, decision } : row) });
  };
  const setDuplicateReason = (rowNumber: number, duplicateReason: string) => {
    if (!batch) return;
    setBatch({ ...batch, rows: batch.rows.map(row => row.rowNumber === rowNumber ? { ...row, duplicateReason } : row) });
  };

  const unresolved = validRows.some(row => !row.decision || (row.decision === 'CONTINUE_SEPARATE' && !row.duplicateReason?.trim()));
  const commit = async () => {
    if (!batch || batch.errors.length || unresolved) return;
    setBusy(true);
    try { await onConfirmImport(batch, validRows.filter(row => row.decision !== 'SKIP')); onClose(); }
    catch (error) { setFileError(error instanceof Error ? error.message : 'Import failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-6xl max-h-[92vh] overflow-hidden bg-white border border-slate-300 shadow-2xl">
        <header className="bg-[#1F242D] text-white p-5 border-b-4 border-[#FF6600] flex justify-between">
          <div><h2 className="font-black flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-[#FF6600]" />Canonical Product Import</h2><p className="text-xs text-slate-300">{vendor.businessName} · CSV/XLSX · opening stock requires approval</p></div>
          <button onClick={onClose} aria-label="Close"><X /></button>
        </header>
        <div className="p-5 space-y-4 overflow-y-auto max-h-[76vh]">
          <label className="relative block border-2 border-dashed border-slate-300 p-7 text-center hover:border-[#FF6600] cursor-pointer">
            <input aria-label="Choose canonical product import file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFile} className="absolute inset-0 opacity-0 cursor-pointer" />
            <Upload className="mx-auto w-7 h-7 text-[#FF6600]" /><strong className="block mt-2">Choose canonical CSV or XLSX template</strong><span className="text-xs text-slate-500">All other formats are rejected before parsing.</span>
          </label>
          {(fileError || batch?.errors.length) ? (
            <div className="border border-red-300 bg-red-50 p-4 text-red-800 text-sm">
              <p className="font-black flex gap-2"><AlertTriangle className="w-4 h-4" />Import rejected</p>
              {fileError && <p>{fileError}</p>}
              {batch?.errors.map((error, index) => <p key={`${error.row}-${error.field}-${index}`}>Row {error.row}, {error.field}: {error.reason}</p>)}
            </div>
          ) : null}
          {batch && batch.rows.length > 0 && (
            <div className="border border-slate-200 overflow-x-auto">
              <table className="min-w-[1100px] w-full text-xs">
                <thead className="bg-[#1F242D] text-white"><tr>{['Row','SKU','Product Name','Category','UM','Type','Qty','Location','Duplicate Review','Decision'].map(value => <th key={value} className="p-3 text-left">{value}</th>)}</tr></thead>
                <tbody>{batch.rows.map(row => <tr key={row.rowNumber} className="border-t align-top">
                  <td className="p-3">{row.rowNumber}</td><td className="p-3 font-mono font-bold">{row.sku}</td><td className="p-3 font-bold">{row.name}</td><td className="p-3">{row.category}</td><td className="p-3">{row.unitOfMeasure}</td><td className="p-3">{row.productType}</td><td className="p-3">{row.quantity ?? 'blank'}</td><td className="p-3">{row.locationCode || '—'}</td>
                  <td className="p-3 max-w-56">{row.errors.map(error => <p key={error.field} className="text-red-700">{error.field}: {error.reason}</p>)}{row.warnings.map(warning => <p key={warning} className="text-amber-700">{warning}</p>)}{row.decision === 'CONTINUE_SEPARATE' && <input aria-label={`Duplicate reason row ${row.rowNumber}`} value={row.duplicateReason || ''} onChange={event => setDuplicateReason(row.rowNumber, event.target.value)} placeholder="Reason required" className="border p-2 mt-2 w-full" />}{!row.errors.length && !row.warnings.length && <span className="text-green-700 flex gap-1"><CheckCircle2 className="w-3 h-3" />Ready</span>}</td>
                  <td className="p-3"><select disabled={row.errors.length > 0} value={row.decision || ''} onChange={event => setDecision(row.rowNumber, event.target.value as CanonicalProductImportRow['decision'])} className="border p-2"><option value="">Review required</option>{!row.duplicateProduct && <option value="CREATE">Import as New</option>}{row.duplicateProduct && <option value="USE_EXISTING">Use Existing Product</option>}{row.duplicateProduct && <option value="UPDATE_EXISTING">Update Existing Product</option>}{row.duplicateProduct && <option value="CONTINUE_SEPARATE">Continue as Separate Product</option>}<option value="SKIP">Skip</option></select></td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
        <footer className="p-4 bg-slate-100 border-t flex justify-between items-center"><span className="text-xs text-slate-600">{validRows.length} valid row(s); invalid templates and rows cannot be imported.</span><button disabled={!batch || !!batch.errors.length || !validRows.length || unresolved || busy} onClick={commit} className="px-5 py-2.5 bg-[#FF6600] disabled:opacity-40 text-white font-black">{busy ? 'Processing…' : 'Create Masters & Approval Requests'}</button></footer>
      </div>
    </div>
  );
};
