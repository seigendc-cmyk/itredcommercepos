import React, { useState } from 'react';
import { Modal } from '../Common/Modal';
import { Order, VendorProfile } from '../../types';
import { Printer, CheckCircle, Copy, FileText, Share2, Check } from 'lucide-react';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  vendor: VendorProfile;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  order,
  vendor
}) => {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm' | 'a4'>('80mm');
  const [copied, setCopied] = useState(false);

  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const text = `
========================================
${vendor.businessName.toUpperCase()}
${order.branchName}
${vendor.address} • ${vendor.phone}
========================================
Receipt #: ${order.id}
Terminal : ${order.terminalName}
Date     : ${new Date(order.createdAt).toLocaleString()}
Customer : ${order.customerName || 'Walk-in'}
Payment  : ${order.paymentMethod.toUpperCase()}
----------------------------------------
ITEMS:
${order.items.map(item => `${item.product.name}\n  ${item.quantity} x $${item.unitPrice.toFixed(2)} = $${item.subtotal.toFixed(2)}`).join('\n')}
----------------------------------------
Subtotal : $${order.subtotal.toFixed(2)}
Tax (8%) : $${order.taxAmount.toFixed(2)}
${order.discountAmount > 0 ? `Discount : -$${order.discountAmount.toFixed(2)}\n` : ''}${order.deliveryDetails ? `Delivery : +$${order.deliveryDetails.deliveryFee.toFixed(2)} (${order.deliveryDetails.courierName})\n` : ''}TOTAL    : $${order.totalAmount.toFixed(2)}
========================================
Powered by iTred Commerce POS
Thank you for shopping with us!
========================================
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Transaction Completed"
      subtitle="Official Sales Receipt"
      maxWidth="md"
    >
      {/* Dynamic Thermal Printer Stylesheet */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-receipt-card, #printable-receipt-card * {
            visibility: visible !important;
          }
          #printable-receipt-card {
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
        
        {/* Printer Preset Format Selector */}
        <div className="flex items-center justify-between bg-slate-100 p-1.5 rounded-xl text-xs font-bold text-slate-600">
          <span className="pl-2 text-[11px] text-slate-500 font-sans">Printer Format:</span>
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
              80mm Thermal
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
              58mm Thermal
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
              Standard A4/PDF
            </button>
          </div>
        </div>

        {/* Printable Receipt Card */}
        <div
          id="printable-receipt-card"
          className={`bg-slate-50 border border-slate-200 p-5 rounded-2xl text-slate-900 font-mono space-y-3 shadow-inner mx-auto transition-all ${
            paperWidth === '58mm' ? 'max-w-[280px] text-[10px]' : paperWidth === '80mm' ? 'max-w-[360px] text-xs' : 'w-full text-xs'
          }`}
        >
          <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
            <h2 className="text-base font-black uppercase text-slate-900 tracking-wider">
              {vendor.businessName}
            </h2>
            <p className="text-[11px] font-sans text-slate-600">{order.branchName}</p>
            <p className="text-[10px] font-sans text-slate-500">{vendor.address} • {vendor.phone}</p>
            <div className="pt-1 flex items-center justify-center gap-1.5 text-[10px] text-emerald-700 font-sans font-bold">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Paid via {order.paymentMethod.toUpperCase()}</span>
            </div>
          </div>

          <div className="space-y-1 text-[11px]">
            <p><span className="text-slate-500">Receipt #:</span> <span className="font-bold">{order.id}</span></p>
            <p><span className="text-slate-500">Terminal:</span> {order.terminalName}</p>
            <p><span className="text-slate-500">Date:</span> {new Date(order.createdAt).toLocaleString()}</p>
            {order.customerName && <p><span className="text-slate-500">Customer:</span> {order.customerName}</p>}
          </div>

          {/* Items Table */}
          <div className="py-2 border-y border-dashed border-slate-300 space-y-2">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-slate-900">{item.product.name}</p>
                  <p className="text-[10px] text-slate-500">
                    {item.quantity} x ${item.unitPrice.toFixed(2)}
                  </p>
                </div>
                <span className="font-bold text-slate-900">${item.subtotal.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Breakdown */}
          <div className="space-y-1 text-right text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal:</span>
              <span>${order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tax (8%):</span>
              <span>${order.taxAmount.toFixed(2)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-orange-600">
                <span>Discount:</span>
                <span>-${order.discountAmount.toFixed(2)}</span>
              </div>
            )}
            {order.deliveryDetails && (
              <div className="flex justify-between text-amber-800 font-bold">
                <span>Delivery ({order.deliveryDetails.courierName}):</span>
                <span>+${order.deliveryDetails.deliveryFee.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-slate-300 text-sm font-black text-[#FF6600]">
              <span>TOTAL PAID:</span>
              <span>${order.totalAmount.toFixed(2)}</span>
            </div>

            {order.deliveryDetails && (
              <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 text-[10px] text-amber-900 font-sans space-y-0.5 text-left my-1">
                <p className="font-bold">🚚 Delivery Dispatch Details:</p>
                <p>Courier: <strong>{order.deliveryDetails.courierName}</strong> ({order.deliveryDetails.vehicleType} - {order.deliveryDetails.vehiclePlate})</p>
                <p>Address: <strong>{order.deliveryDetails.deliveryAddress}</strong></p>
              </div>
            )}

            {order.paymentMethod === 'cash' && order.paymentDetails && (
              <div className="pt-1 text-[10px] text-slate-600">
                <p>Cash Tendered: ${order.paymentDetails.cashGiven?.toFixed(2)}</p>
                <p>Change Returned: ${order.paymentDetails.changeDue?.toFixed(2)}</p>
              </div>
            )}
          </div>

          <div className="text-center pt-3 border-t border-dashed border-slate-300 text-[10px] text-slate-500 space-y-0.5">
            <p className="font-bold">Powered by iTred Commerce POS</p>
            <p>Thank you for shopping with us!</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-3 bg-[#1F242D] hover:bg-slate-800 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
          >
            <Printer className="w-4 h-4 text-[#FF6B00]" />
            <span>Print / Save PDF ({paperWidth})</span>
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-slate-200"
            title="Copy plain text receipt to clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 bg-[#FF6B00] hover:bg-[#E65C00] text-white font-bold rounded-xl text-xs sm:text-sm transition-all cursor-pointer shadow"
          >
            New Sale
          </button>
        </div>

      </div>
    </Modal>
  );
};
