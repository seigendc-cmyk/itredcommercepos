import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Product, StockTransfer, VendorProfile } from '../../types';
import {
  buildTransferSlipModel,
  TransferSlipAction,
  TransferSlipFormat,
} from '../../services/transferSlip';
import { Modal } from '../Common/Modal';

interface TransferSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfer: StockTransfer | null;
  vendor: VendorProfile;
  products: Product[];
  onAction: (
    action: TransferSlipAction,
    transfer: StockTransfer,
    format: TransferSlipFormat,
  ) => Promise<void>;
}

const Detail: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-0.5 font-semibold text-[#1F242D]">{value}</dd>
  </div>
);

export const TransferSlipModal: React.FC<TransferSlipModalProps> = ({
  isOpen,
  onClose,
  transfer,
  vendor,
  products,
  onAction,
}) => {
  const [format, setFormat] = useState<TransferSlipFormat>('a4');
  const previewedTransferRef = useRef<string | null>(null);
  const model = useMemo(
    () => transfer ? buildTransferSlipModel(transfer, vendor.businessName, products) : null,
    [products, transfer, vendor.businessName],
  );

  useEffect(() => {
    if (!isOpen || !transfer || previewedTransferRef.current === transfer.id) return;
    previewedTransferRef.current = transfer.id;
    void onAction('previewed', transfer, format);
  }, [format, isOpen, onAction, transfer]);

  useEffect(() => {
    if (!isOpen) previewedTransferRef.current = null;
  }, [isOpen]);

  if (!transfer || !model) return null;

  const printDocument = async (action: 'printed' | 'exported') => {
    await onAction(action, transfer, format);
    const originalTitle = document.title;
    if (action === 'exported') {
      document.title = `${model.transferNumber}-stock-transfer-slip`;
    }
    window.print();
    if (action === 'exported') {
      window.setTimeout(() => {
        document.title = originalTitle;
      }, 0);
    }
  };

  const isReceipt = format === '80-column';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Stock Transfer Slip"
      subtitle={`${model.transferNumber} • Read-only transfer document`}
      maxWidth="4xl"
    >
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #transfer-slip-document, #transfer-slip-document * { visibility: visible !important; }
          #transfer-slip-document {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${isReceipt ? '80mm' : '100%'} !important;
            max-width: ${isReceipt ? '80mm' : '210mm'} !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: 0 !important;
          }
          @page {
            size: ${isReceipt ? '80mm auto' : 'A4 portrait'};
            margin: ${isReceipt ? '4mm' : '12mm'};
          }
          .transfer-slip-actions { display: none !important; }
        }
      `}</style>

      <div className="transfer-slip-actions flex flex-col gap-3 rounded-xl border border-orange-100 bg-orange-50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-full rounded-lg border border-slate-200 bg-white p-1 sm:w-auto">
          {(['a4', '80-column'] as TransferSlipFormat[]).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => setFormat(option)}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-bold transition-colors sm:flex-none ${
                format === option
                  ? 'bg-[#1F242D] text-white'
                  : 'text-slate-600 hover:bg-orange-50 hover:text-[#FF6600]'
              }`}
            >
              {option === 'a4' ? 'A4 slip' : '80-column slip'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void printDocument('printed')}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1F242D] px-4 py-2.5 text-xs font-bold text-white hover:bg-black sm:flex-none"
          >
            <Printer className="h-4 w-4 text-[#FF6600]" />
            Print
          </button>
          <button
            type="button"
            onClick={() => void printDocument('exported')}
            title="Opens the print dialog; choose Save as PDF"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FF6600] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#e65c00] sm:flex-none"
          >
            <Download className="h-4 w-4" />
            Export PDF
          </button>
        </div>
      </div>

      <article
        id="transfer-slip-document"
        className={`relative mx-auto overflow-hidden border border-slate-200 bg-white text-[#1F242D] shadow-sm ${
          isReceipt ? 'max-w-[80mm] p-3 text-[10px]' : 'max-w-[210mm] p-5 text-xs sm:p-8'
        }`}
      >
        {model.watermark && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
            <span className="rotate-[-28deg] whitespace-nowrap text-5xl font-black tracking-[0.18em] text-orange-500/20 sm:text-7xl">
              {model.watermark}
            </span>
          </div>
        )}

        <header className="relative border-b-2 border-[#FF6600] pb-3 text-center">
          <h1 className={`${isReceipt ? 'text-base' : 'text-2xl'} font-black uppercase`}>
            {model.vendorName}
          </h1>
          <p className="mt-1 font-bold uppercase tracking-[0.16em] text-[#FF6600]">
            Stock Transfer Slip
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono font-bold">
            <span>{model.transferNumber}</span>
            <span className="rounded border border-[#1F242D] px-2 py-0.5">{model.status}</span>
          </div>
        </header>

        <dl className={`relative grid gap-3 border-b border-slate-200 py-4 ${
          isReceipt ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-4'
        }`}>
          <Detail label="Source" value={model.source} />
          <Detail label="Destination" value={model.destination} />
          <Detail label="Request date" value={model.requestDate} />
          <Detail label="Approval date" value={model.approvalDate} />
          <Detail label="Dispatch date" value={model.dispatchDate} />
          <Detail label="Expected receipt" value={model.expectedReceiptDate} />
          <Detail label="Requester" value={model.requester} />
          <Detail label="Approver" value={model.approver} />
          <Detail label="Dispatcher" value={model.dispatcher} />
          <Detail label="Receiving officer" value={model.receivingOfficer} />
        </dl>

        <div className="relative my-4 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="bg-[#1F242D] text-white">
              <tr>
                <th className="p-2">SKU / Product</th>
                <th className="p-2 text-right">Sent</th>
                <th className="p-2 text-right">Received</th>
                <th className="p-2 text-right">Variance</th>
                <th className="p-2">UOM</th>
                {!isReceipt && <th className="p-2">Batch / serial / expiry</th>}
              </tr>
            </thead>
            <tbody>
              {model.lines.map(line => (
                <tr key={`${line.productId}-${line.sku}`} className="border-b border-slate-200 align-top">
                  <td className="p-2">
                    <div className="font-mono font-bold text-[#FF6600]">{line.sku}</div>
                    <div className="font-semibold">{line.productName}</div>
                    {isReceipt && <div className="mt-1 text-slate-600">{line.trackingDetails}</div>}
                  </td>
                  <td className="p-2 text-right font-bold">{line.quantitySent}</td>
                  <td className="p-2 text-right font-bold">{line.quantityReceived}</td>
                  <td className="p-2 text-right font-bold">{line.variance}</td>
                  <td className="p-2">{line.unitOfMeasure}</td>
                  {!isReceipt && <td className="p-2">{line.trackingDetails}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="relative space-y-2 border-y border-slate-200 py-3">
          <p><strong>Total lines:</strong> {model.totalLines}</p>
          <p><strong>Notes:</strong> {model.notes}</p>
          <div
            className="mt-3 border-2 border-[#1F242D] px-3 py-2 text-center font-mono font-black tracking-[0.14em]"
            aria-label={`Transfer reference ${model.barcodeReference}`}
          >
            * {model.barcodeReference} *
          </div>
        </section>

        <footer className={`relative grid gap-6 pt-8 ${isReceipt ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <div className="border-t border-[#1F242D] pt-2">Dispatcher signature / date</div>
          <div className="border-t border-[#1F242D] pt-2">Receiving officer signature / date</div>
        </footer>
      </article>
    </Modal>
  );
};
