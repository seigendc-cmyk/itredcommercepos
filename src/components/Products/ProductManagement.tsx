import React, { useState } from 'react';
import { Product, Warehouse, Branch, StaffMember } from '../../types';
import { StocktakeWorkspace } from '../Inventory/StocktakeWorkspace';
import { Package, Plus, Search, Edit3, FileSpreadsheet, Boxes, ClipboardCheck } from 'lucide-react';

interface ProductManagementProps {
  products: Product[];
  warehouseStock: Record<string, number>;
  branchStock: Record<string, number>;
  warehouses?: Warehouse[];
  branches?: Branch[];
  activeStaff?: StaffMember;
  vendorId?: string;
  onOpenAddProductModal: () => void;
  onOpenImportModal?: () => void;
  onEditProduct: (product: Product) => void;
  onSubmitStocktakeApproval?: (payload: any) => Promise<void>;
  onNavigateToApprovals?: () => void;
}

export const ProductManagement: React.FC<ProductManagementProps> = ({
  products,
  warehouseStock,
  branchStock,
  warehouses = [],
  branches = [],
  activeStaff,
  vendorId = '',
  onOpenAddProductModal,
  onOpenImportModal,
  onEditProduct,
  onSubmitStocktakeApproval,
  onNavigateToApprovals
}) => {
  const [subTab, setSubTab] = useState<'catalog' | 'stocktake'>('catalog');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.barcode && p.barcode.includes(searchTerm));
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Main Section Switcher Header */}
      <div className="flex border-b border-slate-200 gap-3 font-bold text-xs sm:text-sm">
        <button
          onClick={() => setSubTab('catalog')}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            subTab === 'catalog'
              ? 'border-[#FF6600] text-[#FF6600]'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Master Product Catalog ({products.length})</span>
        </button>

        <button
          onClick={() => setSubTab('stocktake')}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            subTab === 'stocktake'
              ? 'border-[#FF6600] text-[#FF6600]'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>Stocktake Audit & 26-Day Cycle Count</span>
          <span className="bg-[#FF6600] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
            BI Guard
          </span>
        </button>
      </div>

      {subTab === 'stocktake' && activeStaff && onSubmitStocktakeApproval ? (
        <StocktakeWorkspace
          products={products}
          warehouses={warehouses}
          branches={branches}
          warehouseStock={warehouseStock}
          branchStock={branchStock}
          activeStaff={activeStaff}
          vendorId={vendorId}
          onSubmitStocktakeApproval={onSubmitStocktakeApproval}
          onNavigateToApprovals={onNavigateToApprovals}
        />
      ) : (
        <>
          {/* Top Banner */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#1F242D] text-[#FF6600] flex items-center justify-center font-bold shadow-md">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Master Product Catalog</h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                  Manage product items, barcodes, cost prices, retail prices, and reorder levels.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <button
                onClick={() => setSubTab('stocktake')}
                className="flex-1 md:flex-initial px-4 py-2.5 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer border border-transparent hover:border-[#FF6600]"
              >
                <ClipboardCheck className="w-4 h-4 text-[#FF6600]" />
                <span>Perform Stocktake</span>
              </button>

              {onOpenImportModal && (
                <button
                  onClick={onOpenImportModal}
                  className="flex-1 md:flex-initial px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-[#FF6600]" />
                  <span>Import Catalog</span>
                </button>
              )}

              <button
                onClick={onOpenAddProductModal}
                className="flex-1 md:flex-initial px-5 py-2.5 bg-[#FF6600] hover:bg-[#E65C00] text-white font-bold rounded-xl text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Product</span>
              </button>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by SKU, product name, barcode..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#FF6600]"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 scrollbar-none">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                      selectedCategory === cat
                        ? 'bg-[#1F242D] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Products Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#1F242D] text-slate-200 font-bold uppercase text-[11px] tracking-wider">
                  <tr>
                    <th className="p-3.5">SKU / Barcode</th>
                    <th className="p-3.5">Product Name</th>
                    <th className="p-3.5">Category</th>
                    <th className="p-3.5">Shelf Zone</th>
                    <th className="p-3.5 text-right">Cost Price</th>
                    <th className="p-3.5 text-right">Selling Price</th>
                    <th className="p-3.5 text-center">Warehouse Stock</th>
                    <th className="p-3.5 text-center">Branch Stock</th>
                    <th className="p-3.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((product, idx) => {
                    const whQty = warehouseStock[product.id] || 0;
                    const brQty = branchStock[product.id] || 0;
                    const shelf = product.shelf || product.location || `Shelf #${(idx % 26) + 1}`;

                    return (
                      <tr key={product.id} className="hover:bg-slate-50">
                        <td className="p-3.5">
                          <p className="font-mono font-bold text-slate-900">{product.sku}</p>
                          <p className="text-[10px] font-mono text-slate-500">{product.barcode}</p>
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">{product.name}</td>
                        <td className="p-3.5 text-slate-600">{product.category}</td>
                        <td className="p-3.5 font-semibold text-slate-700">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">{shelf}</span>
                        </td>
                        <td className="p-3.5 text-right text-slate-600">${product.costPrice.toFixed(2)}</td>
                        <td className="p-3.5 text-right font-black text-[#FF6600]">${product.sellingPrice.toFixed(2)}</td>
                        <td className="p-3.5 text-center">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-800 font-bold rounded-lg text-xs">
                            {whQty} {product.unit}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={`px-2.5 py-1 font-bold rounded-lg text-xs ${
                            brQty > 0 ? 'bg-orange-100 text-[#FF6600]' : 'bg-red-100 text-red-700'
                          }`}>
                            {brQty} {product.unit}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => onEditProduct(product)}
                            className="p-1.5 text-slate-600 hover:text-[#FF6600] hover:bg-orange-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Product"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

    </div>
  );
};
