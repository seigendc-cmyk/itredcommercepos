import React, { useState } from 'react';
import { Modal } from '../Common/Modal';
import { VendorProfile, TerminalShift } from '../../types';
import { Printer, Copy, Check, FileSpreadsheet, Store, Clock, User, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';

interface EODReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: VendorProfile;
  shift: TerminalShift | null;
}

export const EODReportModal: React.FC<EODReportModalProps> = ({
  isOpen,
  onClose,
  vendor,
  shift
}) => {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm' | 'a4'>('80mm');
  const [copied, setCopied] = useState(false);

  if (!shift) return null;

  const currency = vendor.currency || '$';
  const openingFloat = shift.openingCash;
  const cashSales = shift.cashSales;
  const cardSales = shift.cardSales;
  const mobileSales = shift.mobileSales;
  const totalSales = shift.totalSales;
  const expectedCash = shift.expectedCash || (openingFloat + cashSales);
  const closingCash = shift.closingCash || 0;
  const discrepancy = shift.cashDiscrepancy !== undefined ? shift.cashDiscrepancy : (closingCash - expectedCash);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const text = `
========================================
       END-OF-DAY (EOD) Z-REPORT
${vendor.businessName.toUpperCase()}
${shift.branchName || 'Main Branch'} - ${shift.terminalName || 'Terminal 01'}
========================================
Shift ID     : ${shift.id}
Cashier      : ${shift.staffName}
Opened At    : ${new Date(shift.openedAt).toLocaleString()}
Closed At    : ${shift.closedAt ? new Date(shift.closedAt).toLocaleString() : 'Active'}
----------------------------------------
FINANCIAL SUMMARY:
Opening Float: ${currency}${openingFloat.toFixed(2)}
Cash Sales   : +${currency}${cashSales.toFixed(2)}
Card Sales   : +${currency}${cardSales.toFixed(2)}
Mobile Sales : +${currency}${mobileSales.toFixed(2)}
----------------------------------------
TOTAL GROSS REVENUE : ${currency}${totalSales.toFixed(2)}
Total Transactions  : ${shift.transactionCount}
----------------------------------------
DRAWER RECONCILIATION:
Expected Cash in Drawer : ${currency}${expectedCash.toFixed(2)}
Actual Cash Counted     : ${currency}${closingCash.toFixed(2)}
VARIANCE (OVER/SHORT)   : ${discrepancy >= 0 ? '+' : ''}${currency}${discrepancy.toFixed(2)}
----------------------------------------
NOTES: ${shift.closingNotes || 'Shift closed.'}
========================================
Cashier Signature: ______________________
Manager Signature: ______________________
========================================
Powered by iTred Commerce POS
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="End-of-Day (EOD) Shift Z-Report"
      subtitle="Official Store Terminal Reconciliation Audit Log"
      maxWidth="md"
    >
      {/* Thermal Printer Stylesheet for EOD Z-Report */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-eod-report, #printable-eod-report * {
            visibility: visible !important;
          }
          #printable-eod-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${paperWidth === '58mm' ? '58mm' : paperWidth === '80mm' ? '80mm' : '100%'} !important;
            max-width: ${paperWidth === '58mm' ? '58mm' : paperWidth === '80mm' ? '80mm' : '100%'} !important;
            margin: 0 auto !important;
            padding: 8px !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            font-family: 'Courier New', Courier, monospace !important;
          }
          @page {
            size: ${paperWidth === 'a4' ? 'auto' : paperWidth + ' auto'};
            margin: 0;
          }
        }
      `}</style>

      <div className="space-y-4">
        
        {/* Printer Preset Selector */}
        <div className="flex items-center justify-between bg-slate-100 p-1.5 rounded-xl text-xs font-bold text-slate-600">
          <span className="pl-2 text-[11px] text-slate-500 font-sans">Printer Layout:</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPaperWidth('80mm')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                paperWidth === '80mm'
                  ? 'bg-white text-[#FF6B00] shadow-sm font-black'
                  : 'hover:bg-slate-200 text-slate-600'
              }`}
            >
              80mm Thermal Z-Slip
            </button>
            <button
              type="button"
              onClick={() => setPaperWidth('58mm')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                paperWidth === '58mm'
                  ? 'bg-white text-[#FF6B00] shadow-sm font-black'
                  : 'hover:bg-slate-200 text-slate-600'
              }`}
            >
              58mm Mini Roll
            </button>
            <button
              type="button"
              onClick={() => setPaperWidth('a4')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                paperWidth === 'a4'
                  ? 'bg-white text-[#FF6B00] shadow-sm font-black'
                  : 'hover:bg-slate-200 text-slate-600'
              }`}
            >
              A4 Full Audit
            </button>
          </div>
        </div>

        {/* Printable Z-Report Sheet */}
        <div
          id="printable-eod-report"
          className={`bg-slate-50 border border-slate-200 p-5 rounded-2xl text-slate-900 font-mono space-y-3 shadow-inner mx-auto transition-all ${
            paperWidth === '58mm' ? 'max-w-[280px] text-[10px]' : paperWidth === '80mm' ? 'max-w-[360px] text-xs' : 'w-full text-xs'
          }`}
        >
          {/* Header */}
          <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
            <h2 className="text-base font-black uppercase tracking-wider text-slate-900">
              {vendor.businessName}
            </h2>
            <p className="text-[11px] font-sans font-bold text-slate-700">*** END-OF-DAY (EOD) Z-REPORT ***</p>
            <p className="text-[10px] font-sans text-slate-500">{shift.branchName || 'Main Branch'} • {shift.terminalName || 'Terminal 01'}</p>
          </div>

          {/* Shift Metadata */}
          <div className="space-y-1 text-[11px]">
            <p><span className="text-slate-500">Shift ID:</span> <span className="font-bold">{shift.id}</span></p>
            <p><span className="text-slate-500">Cashier:</span> <span className="font-bold">{shift.staffName}</span></p>
            <p><span className="text-slate-500">Opened:</span> {new Date(shift.openedAt).toLocaleString()}</p>
            <p><span className="text-slate-500">Closed:</span> {shift.closedAt ? new Date(shift.closedAt).toLocaleString() : 'In Progress'}</p>
          </div>

          {/* Sales Summary Table */}
          <div className="py-2 border-y border-dashed border-slate-300 space-y-1.5 text-[11px]">
            <span className="font-bold block text-slate-900 uppercase">1. FINANCIAL REVENUE</span>
            <div className="flex justify-between">
              <span className="text-slate-600">Opening Cash Float:</span>
              <span className="font-bold">{currency}{openingFloat.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Cash Sales:</span>
              <span className="font-bold text-emerald-700">+{currency}{cashSales.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Card Sales:</span>
              <span className="font-bold text-sky-700">+{currency}{cardSales.toFixed(2)}</span>
            </div>
            {mobileSales > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">Mobile Money Sales:</span>
                <span className="font-bold text-purple-700">+{currency}{mobileSales.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-slate-300 font-black text-slate-900 text-xs">
              <span>GROSS SHIFT REVENUE:</span>
              <span className="text-[#FF6B00]">{currency}{totalSales.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Total Orders Processed:</span>
              <span>{shift.transactionCount} transactions</span>
            </div>
          </div>

          {/* Cash Drawer Reconciliation Audit */}
          <div className="py-2 border-b border-dashed border-slate-300 space-y-1.5 text-[11px]">
            <span className="font-bold block text-slate-900 uppercase">2. DRAWER RECONCILIATION</span>
            <div className="flex justify-between">
              <span className="text-slate-600">Expected Cash in Drawer:</span>
              <span>{currency}{expectedCash.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Actual Cash Counted:</span>
              <span className="font-bold">{currency}{closingCash.toFixed(2)}</span>
            </div>
            
            <div className={`flex justify-between pt-1 font-bold ${
              Math.abs(discrepancy) < 0.01 ? 'text-emerald-700' : discrepancy < 0 ? 'text-rose-700' : 'text-amber-700'
            }`}>
              <span>DRAWER VARIANCE:</span>
              <span>{discrepancy >= 0 ? '+' : ''}{currency}{discrepancy.toFixed(2)}</span>
            </div>
          </div>

          {/* Notes & Signatures */}
          <div className="pt-1 space-y-3 text-[10px] text-slate-600">
            {shift.closingNotes && (
              <p><span className="font-bold text-slate-800">Closing Notes:</span> {shift.closingNotes}</p>
            )}

            <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-4 text-center font-sans font-medium text-[9px] text-slate-500">
              <div className="space-y-4">
                <div className="border-b border-slate-300 h-6"></div>
                <p>Cashier Signature</p>
              </div>
              <div className="space-y-4">
                <div className="border-b border-slate-300 h-6"></div>
                <p>Manager Signature</p>
              </div>
            </div>
          </div>

          <div className="text-center pt-3 border-t border-dashed border-slate-300 text-[9px] text-slate-400 font-sans">
            <p className="font-bold text-slate-600">iTred POS System Audit Log</p>
            <p>Generated: {new Date().toLocaleString()}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-3 bg-[#1F242D] hover:bg-slate-800 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
          >
            <Printer className="w-4 h-4 text-[#FF6B00]" />
            <span>Print EOD Z-Report ({paperWidth})</span>
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-slate-200"
            title="Copy plain text audit log to clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy Text'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 bg-[#FF6B00] hover:bg-[#E65C00] text-white font-bold rounded-xl text-xs sm:text-sm transition-all cursor-pointer shadow"
          >
            Done
          </button>
        </div>

      </div>
    </Modal>
  );
};
