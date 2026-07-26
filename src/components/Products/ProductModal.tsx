import React, { useState } from 'react';
import { Modal } from '../Common/Modal';
import { Product } from '../../types';
import { saveProduct } from '../../services/db';
import { Package, Tag, DollarSign, Barcode, Layers, AlertCircle } from 'lucide-react';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string;
  productToEdit?: Product | null;
  onSuccess: () => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  vendorId,
  productToEdit,
  onSuccess
}) => {
  const [sku, setSku] = useState(productToEdit?.sku || '');
  const [name, setName] = useState(productToEdit?.name || '');
  const [category, setCategory] = useState(productToEdit?.category || 'General');
  const [costPrice, setCostPrice] = useState(productToEdit?.costPrice ? String(productToEdit.costPrice) : '10.00');
  const [sellingPrice, setSellingPrice] = useState(productToEdit?.sellingPrice ? String(productToEdit.sellingPrice) : '25.00');
  const [barcode, setBarcode] = useState(productToEdit?.barcode || '');
  const [unit, setUnit] = useState(productToEdit?.unit || 'pcs');
  const [reorderLevel, setReorderLevel] = useState(productToEdit?.reorderLevel ? String(productToEdit.reorderLevel) : '10');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter product name.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await saveProduct(vendorId, {
        id: productToEdit?.id,
        sku: sku.trim() || `ITR-${Math.floor(100 + Math.random() * 900)}`,
        name: name.trim(),
        category: category.trim() || 'General',
        costPrice: parseFloat(costPrice) || 0,
        sellingPrice: parseFloat(sellingPrice) || 0,
        barcode: barcode.trim() || String(Math.floor(1000000000 + Math.random() * 9000000000)),
        unit: unit.trim() || 'pcs',
        reorderLevel: parseInt(reorderLevel) || 10,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={productToEdit ? 'Edit Catalog Product' : 'Add New Product to Catalog'}
      subtitle="Master product catalog entry"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Product Name <span className="text-[#FF6600]">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wireless Ergonomic Mouse"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Category
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Electronics, Hardware, Beverages"
              className="w-full px-3.5 py-2.5 bg-[#FFFFFF] border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              SKU Code
            </label>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Auto-generated if empty"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-mono font-medium focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Barcode / EAN
            </label>
            <div className="relative">
              <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or enter barcode"
                className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-mono focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Supplier Cost Price ($)
            </label>
            <input
              type="number"
              step="0.01"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-bold focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Retail Selling Price ($) <span className="text-[#FF6600]">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-bold text-[#FF6600] focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Unit of Measurement
            </label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pcs, box, kg, pack"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Reorder Alert Level
            </label>
            <input
              type="number"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-bold focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-bold rounded-xl text-xs sm:text-sm shadow-md transition-all cursor-pointer"
          >
            {isSubmitting ? 'Saving...' : productToEdit ? 'Update Product' : 'Add Product'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
