import React, { useEffect, useState } from 'react';
import { StockTransfer } from '../../types';
import { Modal } from '../Common/Modal';

interface TransferReceiptModalProps {
  transfer: StockTransfer | null;
  onClose: () => void;
  onConfirm: (
    transfer: StockTransfer,
    receipts: { lineIndex: number; quantityReceived: number }[],
    reason: string,
  ) => Promise<void>;
}

export const TransferReceiptModal: React.FC<TransferReceiptModalProps> = ({
  transfer,
  onClose,
  onConfirm,
}) => {
  const [quantities, setQuantities] = useState<number[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!transfer) return;
    setQuantities(transfer.items.map(item =>
      Math.max(0, (item.quantityDispatched || 0) - (item.quantityReceived || 0))));
    setReason('');
    setError('');
  }, [transfer]);

  if (!transfer) return null;

  const totalOutstanding = transfer.items.reduce((sum, item) =>
    sum + Math.max(0, (item.quantityDispatched || 0) - (item.quantityReceived || 0)), 0);
  const totalReceiving = quantities.reduce((sum, quantity) => sum + quantity, 0);
  const isPartial = totalReceiving !== totalOutstanding;

  const submit = async () => {
    if (totalReceiving <= 0) {
      setError('Enter at least one received quantity.');
      return;
    }
    if (isPartial && !reason.trim()) {
      setError('A reason is required for partial receipt or variance.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(
        transfer,
        quantities.map((quantityReceived, lineIndex) => ({ lineIndex, quantityReceived })),
        reason.trim(),
      );
      onClose();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Transfer receipt could not be confirmed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Confirm Branch Receipt"
      subtitle={`${transfer.transferNo} • ${transfer.targetBranchName}`} maxWidth="3xl">
      <div className="space-y-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-[#1F242D] text-white">
              <tr><th className="p-3">SKU / Product</th><th className="p-3 text-right">Dispatched</th>
                <th className="p-3 text-right">Previously received</th><th className="p-3 text-right">Outstanding</th>
                <th className="p-3 text-right">Receive now</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transfer.items.map((item, index) => {
                const outstanding = Math.max(0, (item.quantityDispatched || 0) - (item.quantityReceived || 0));
                return (
                  <tr key={`${item.productId}-${index}`}>
                    <td className="p-3"><span className="font-mono font-bold text-[#FF6600]">{item.sku}</span><br /><strong>{item.productName}</strong></td>
                    <td className="p-3 text-right">{item.quantityDispatched || 0}</td>
                    <td className="p-3 text-right">{item.quantityReceived || 0}</td>
                    <td className="p-3 text-right font-bold">{outstanding}</td>
                    <td className="p-3 text-right"><input type="number" min="0" max={outstanding}
                      value={quantities[index] ?? 0}
                      onChange={event => setQuantities(current => current.map((quantity, itemIndex) =>
                        itemIndex === index ? Math.max(0, Number(event.target.value) || 0) : quantity))}
                      className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right font-bold" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <label className="block text-xs font-bold text-[#1F242D]">
          Partial receipt / variance reason {isPartial && <span className="text-red-600">*</span>}
          <textarea value={reason} onChange={event => setReason(event.target.value)}
            placeholder="Required when received quantities do not match outstanding in-transit quantities"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="button" disabled={submitting} onClick={() => void submit()}
            className="rounded-xl bg-[#FF6600] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {submitting ? 'Confirming…' : 'Confirm Atomic Receipt'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
