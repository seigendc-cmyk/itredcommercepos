import React, { useEffect, useState } from 'react';
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
  const [description, setDescription] = useState(productToEdit?.description || '');
  const [size, setSize] = useState(productToEdit?.size || '');
  const [category, setCategory] = useState(productToEdit?.category || '');
  const [costPrice, setCostPrice] = useState(productToEdit ? String(productToEdit.costPrice) : '');
  const [sellingPrice, setSellingPrice] = useState(productToEdit ? String(productToEdit.sellingPrice) : '');
  const [barcode, setBarcode] = useState(productToEdit?.barcode || '');
  const [alu, setAlu] = useState(productToEdit?.alternativeLookupCode || '');
  const [unit, setUnit] = useState(productToEdit?.unitOfMeasure || productToEdit?.unit || '');
  const [productType, setProductType] = useState(productToEdit?.productType || '');
  const [reorderLevel, setReorderLevel] = useState(productToEdit ? String(productToEdit.reorderLevel) : '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSku(productToEdit?.sku || ''); setName(productToEdit?.name || ''); setDescription(productToEdit?.description || '');
    setSize(productToEdit?.size || ''); setCategory(productToEdit?.category || ''); setCostPrice(productToEdit ? String(productToEdit.costPrice) : '');
    setSellingPrice(productToEdit ? String(productToEdit.sellingPrice) : ''); setBarcode(productToEdit?.barcode || '');
    setAlu(productToEdit?.alternativeLookupCode || ''); setUnit(productToEdit?.unitOfMeasure || productToEdit?.unit || '');
    setProductType(productToEdit?.productType || ''); setReorderLevel(productToEdit ? String(productToEdit.reorderLevel) : '');
  }, [productToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !name.trim() || !category.trim() || !unit.trim() || !productType) {
      setError('SKU, product name, category, unit of measure and product type are required.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await saveProduct(vendorId, {
        id: productToEdit?.id,
        sku: sku.trim(),
        name: name.trim(),
        description: description.trim(), size: size.trim(), category: category.trim(),
        costPrice: Number(costPrice), sellingPrice: Number(sellingPrice),
        barcode: barcode.trim() || undefined, alternativeLookupCode: alu.trim() || undefined,
        unitOfMeasure: unit.trim(), unit: unit.trim(), productType: productType as Product['productType'],
        reorderLevel: Number(reorderLevel), status: productToEdit?.status || 'active',
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
          <div className="sm:col-span-2"><label className="block text-xs font-bold mb-1">Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl" /></div>
          <div><label className="block text-xs font-bold mb-1">Size</label><input value={size} onChange={e => setSize(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl" /></div>
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
              required
              placeholder="Required canonical SKU"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-mono font-medium focus:ring-2 focus:ring-[#FF6600] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">Alternative Look Up (ALU)</label><input value={alu} onChange={e => setAlu(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl" />
          </div>
          <div><label className="block text-xs font-bold text-slate-900 mb-1">Product Type</label><select required value={productType} onChange={e => setProductType(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl"><option value="">Select type</option><option>INVENTORY</option><option>NON_INVENTORY</option><option>SERVICE</option><option>BOM</option><option>OTHER</option></select></div>

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
