import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Product, Branch, Terminal, CartItem, Order, VendorProfile, StaffMember, TerminalShift } from '../../types';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Tag,
  CreditCard,
  Barcode,
  Package,
  Sparkles,
  AlertTriangle,
  Lock,
  Play,
  StopCircle,
  Clock,
  DollarSign,
  Receipt,
  ShieldCheck,
  CheckCircle2,
  FileText,
  X,
  CornerDownLeft,
  Check
} from 'lucide-react';
import { getProductSellingPrice, matchesPredictiveSearch } from '../../features/products';

interface POSTerminalProps {
  products: Product[];
  branchStock: Record<string, number>;
  vendor: VendorProfile | null;
  activeBranch: Branch | null;
  activeTerminal: Terminal | null;
  activeStaff: StaffMember | null;
  activeShift: TerminalShift | null;
  onOpenPaymentModal: (cart: CartItem[], totals: { subtotal: number; tax: number; total: number }) => void;
  onOpenStockAdjustmentModal: () => void;
  onOpenShiftModal: () => void;
  onCloseShiftModal: () => void;
  onViewShiftReport?: () => void;
}

export const POSTerminal: React.FC<POSTerminalProps> = ({
  products,
  branchStock,
  vendor,
  activeBranch,
  activeTerminal,
  activeStaff,
  activeShift,
  onOpenPaymentModal,
  onOpenStockAdjustmentModal,
  onOpenShiftModal,
  onCloseShiftModal,
  onViewShiftReport
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // SKU Search Bar States
  const skuInputRef = useRef<HTMLInputElement>(null);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [feedbackToast, setFeedbackToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const currency = vendor?.currency || '$';

  // Categories list
  const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];

  // Filtered products for grid
  const filteredProducts = products.filter(p => {
    const matchesSearch = matchesPredictiveSearch(searchTerm, p.name, p.sku, p.barcode, p.category, p.brand, p.manufacturer);
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // SKU Suggestions dropdown list (limit 8)
  const skuSuggestions = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return products.filter(p => matchesPredictiveSearch(searchTerm, p.sku, p.name, p.barcode, p.category, p.brand, p.manufacturer)).slice(0, 8);
  }, [searchTerm, products]);

  // Handle toast notification
  const triggerToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setFeedbackToast({ msg, type });
    setTimeout(() => setFeedbackToast(null), 2500);
  };

  const isShiftOpen = activeShift && activeShift.status === 'open';

  const addToCart = (product: Product, source: 'grid' | 'sku' = 'grid') => {
    if (!isShiftOpen) {
      onOpenShiftModal();
      return;
    }

    const stockAvailable = branchStock[product.id] || 0;
    const existingIndex = cart.findIndex(item => item.product.id === product.id);

    if (existingIndex >= 0) {
      const currentQty = cart[existingIndex].quantity;
      if (currentQty >= stockAvailable) {
        triggerToast(`Stock limit reached! Available at ${activeBranch?.name || 'Branch'}: ${stockAvailable}`, 'error');
        return;
      }
      const updated = [...cart];
      const newQty = currentQty + 1;
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: newQty,
        subtotal: newQty * updated[existingIndex].unitPrice
      };
      setCart(updated);
      triggerToast(`+1 ${product.name} (${product.sku}) in cart`);
    } else {
      if (stockAvailable <= 0) {
        triggerToast(`Out of stock! ${product.sku} has 0 stock at ${activeBranch?.name || 'Branch'}.`, 'error');
        return;
      }
      setCart([
        ...cart,
        {
          product,
          quantity: 1,
          unitPrice: getProductSellingPrice(product, activeBranch?.id),
          discount: 0,
          subtotal: getProductSellingPrice(product, activeBranch?.id)
        }
      ]);
      triggerToast(`Added [${product.sku}] ${product.name} to cart`);
    }

    if (source === 'sku') {
      setShowDropdown(false);
      setSearchTerm('');
    }
  };

  // Keyboard navigation inside global SKU search input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, skuSuggestions.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + skuSuggestions.length) % Math.max(1, skuSuggestions.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (skuSuggestions.length > 0) {
        const selectedProduct = skuSuggestions[selectedIndex] || skuSuggestions[0];
        addToCart(selectedProduct, 'sku');
      } else if (searchTerm.trim()) {
        triggerToast(`No product found with SKU or Name matching "${searchTerm}"`, 'error');
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    const existingIndex = cart.findIndex(item => item.product.id === productId);
    if (existingIndex < 0) return;

    const currentQty = cart[existingIndex].quantity;
    const newQty = currentQty + delta;

    if (newQty <= 0) {
      setCart(cart.filter(item => item.product.id !== productId));
    } else {
      const stockAvailable = branchStock[productId] || 0;
      if (delta > 0 && newQty > stockAvailable) {
        alert(`Cannot exceed available branch stock (${stockAvailable} units).`);
        return;
      }
      const updated = [...cart];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: newQty,
        subtotal: newQty * updated[existingIndex].unitPrice
      };
      setCart(updated);
    }
  };

  const clearCart = () => setCart([]);

  // Calculate order totals
  const subtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);
  const taxAmount = subtotal * 0.08;
  const totalAmount = subtotal + taxAmount;

  const handlePayClick = () => {
    if (!isShiftOpen) {
      onOpenShiftModal();
      return;
    }
    if (cart.length === 0) return;
    onOpenPaymentModal(cart, { subtotal, tax: taxAmount, total: totalAmount });
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      
      {/* ==================== ACTIVE SHIFT STATUS BAR ==================== */}
      <div className="bg-[#1F242D] text-white p-3.5 rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-3 border border-slate-800">
        
        {/* Terminal & Branch Badge */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#FF6B00]/10 border border-[#FF6B00]/30 rounded-xl text-[#FF6B00]">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm text-white">{activeTerminal?.name || 'Main Register'}</span>
              <span className="text-[10px] font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                {activeBranch?.name || 'Main Branch'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Staff: <strong>{activeStaff?.name || 'Cashier'}</strong> ({activeStaff?.role || 'Staff'})
            </p>
          </div>
        </div>

        {/* Live Shift Status & Summary */}
        <div className="flex items-center gap-3">
          {isShiftOpen ? (
            <>
              {/* Shift Active Summary Badges */}
              <div className="hidden sm:flex items-center gap-2 bg-slate-900/80 p-2 rounded-xl border border-slate-800 text-xs">
                <div className="flex items-center gap-1.5 px-2 text-emerald-400 font-bold border-r border-slate-800">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>Shift Open</span>
                </div>
                <div className="px-2 text-slate-300 font-mono text-[11px]">
                  Float: <strong className="text-white">{currency}{activeShift.openingCash.toFixed(2)}</strong>
                </div>
                <div className="px-2 text-slate-300 font-mono text-[11px]">
                  Cash: <strong className="text-emerald-400">+{currency}{activeShift.cashSales.toFixed(2)}</strong>
                </div>
                <div className="px-2 text-slate-300 font-mono text-[11px]">
                  Total: <strong className="text-[#FF6B00]">{currency}{activeShift.totalSales.toFixed(2)}</strong> ({activeShift.transactionCount} sales)
                </div>
              </div>

              {/* End Shift / Close Shift Button */}
              <button
                type="button"
                onClick={onCloseShiftModal}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95"
              >
                <StopCircle className="w-4 h-4" />
                <span>Close Shift & EOD</span>
              </button>
            </>
          ) : (
            <>
              {/* Shift Closed Warning Badge */}
              <div className="flex items-center gap-2 bg-rose-950/40 border border-rose-800/60 text-rose-300 px-3 py-1.5 rounded-xl text-xs font-bold">
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                <span>Shift Closed (Register Locked)</span>
              </div>

              {/* Open Shift Action Button */}
              <button
                type="button"
                onClick={onOpenShiftModal}
                className="px-4 py-2.5 bg-[#FF6B00] hover:bg-[#e66000] text-white font-black rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Open Terminal Shift</span>
              </button>
            </>
          )}

          {onViewShiftReport && (
            <button
              type="button"
              onClick={onViewShiftReport}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              title="View EOD Audit Reports"
            >
              <FileText className="w-4 h-4 text-[#FF6B00]" />
              <span className="hidden md:inline">Z-Reports</span>
            </button>
          )}
        </div>

      </div>

      {/* Toast Notification Banner */}
      {feedbackToast && (
        <div className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between shadow-lg transition-all animate-bounce ${
          feedbackToast.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-[#1F242D] border-slate-700 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {feedbackToast.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#FF6B00]" />
            )}
            <span>{feedbackToast.msg}</span>
          </div>
          <button onClick={() => setFeedbackToast(null)} className="p-0.5 hover:opacity-75 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Terminal Split View */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
        
        {/* LEFT COLUMN: Product Catalog (7 cols) */}
        <div className="lg:col-span-7 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3 min-h-0">
          
          {/* Global SKU & Name Quick Search Bar */}
          <div className="space-y-2">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400">
                <Search className="w-4 h-4 text-[#FF6B00]" />
                <Barcode className="w-4 h-4 text-slate-400 hidden sm:inline" />
              </div>

              <input
                ref={skuInputRef}
                type="text"
                placeholder="Global SKU or Product Name search (Type partial SKU e.g. SKU-1002)..."
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setShowDropdown(true);
                  setSelectedIndex(0);
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleKeyDown}
                className="w-full pl-9 sm:pl-16 pr-24 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent focus:outline-none transition-all shadow-inner"
              />

              {/* Action Badges in Search Bar */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setShowDropdown(false);
                      skuInputRef.current?.focus();
                    }}
                    className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                    title="Clear Search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                <span className="hidden sm:flex items-center gap-1 text-[10px] font-mono bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-lg border border-slate-300">
                  <CornerDownLeft className="w-3 h-3 text-[#FF6B00]" />
                  <span>ENTER to Add</span>
                </span>
              </div>

              {/* Live SKU Autocomplete Dropdown Popover */}
              {showDropdown && skuSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-30 max-h-72 overflow-y-auto divide-y divide-slate-100">
                  <div className="p-2 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider flex items-center justify-between rounded-t-xl">
                    <span>Matching Products ({skuSuggestions.length})</span>
                    <span className="text-slate-400 font-mono">Use ↑ ↓ arrows & ENTER</span>
                  </div>

                  {skuSuggestions.map((product, idx) => {
                    const stock = branchStock[product.id] || 0;
                    const isSelected = idx === selectedIndex;
                    const isOut = stock <= 0;

                    return (
                      <div
                        key={product.id}
                        onClick={() => addToCart(product, 'sku')}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`p-2.5 flex items-center justify-between cursor-pointer transition-all ${
                          isSelected ? 'bg-orange-50 border-l-4 border-l-[#FF6B00]' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono text-xs font-black bg-slate-900 text-[#FF6B00] px-2 py-0.5 rounded">
                            {product.sku}
                          </span>
                          <div className="truncate">
                            <p className="text-xs font-bold text-slate-900 truncate">{product.name}</p>
                            <p className="text-[10px] text-slate-500 font-medium">
                              {product.category} • {product.unit}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-right">
                          <div>
                            <p className="text-xs font-black text-slate-900">{currency}{getProductSellingPrice(product, activeBranch?.id).toFixed(2)}</p>
                            <p className={`text-[10px] font-bold ${isOut ? 'text-rose-600' : 'text-slate-500'}`}>
                              {stock} in stock
                            </p>
                          </div>
                          <button
                            type="button"
                            className="px-2.5 py-1 bg-[#FF6B00] text-white font-bold rounded-lg text-xs hover:bg-[#e66000] flex items-center gap-1 transition-all shadow-sm"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Category Pills Bar */}
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[#FF6B00] text-white shadow'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto min-h-[300px] grid grid-cols-2 sm:grid-cols-3 gap-3 pr-1">
            {filteredProducts.map(product => {
              const stock = branchStock[product.id] || 0;
              const isOut = stock <= 0;

              return (
                <div
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className={`p-3 rounded-xl border transition-all flex flex-col justify-between group relative cursor-pointer ${
                    isOut
                      ? 'bg-slate-50 border-slate-200 opacity-60'
                      : 'bg-white border-slate-200 hover:border-[#FF6B00] hover:shadow-md'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="text-[10px] font-mono text-slate-400 truncate">{product.sku}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isOut ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {stock} in stock
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 line-clamp-2 group-hover:text-[#FF6B00] transition-colors">
                      {product.name}
                    </h4>
                  </div>

                  <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-black text-slate-900">{currency}{getProductSellingPrice(product, activeBranch?.id).toFixed(2)}</span>
                    <button
                      type="button"
                      className="p-1.5 bg-orange-50 text-[#FF6B00] rounded-lg group-hover:bg-[#FF6B00] group-hover:text-white transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredProducts.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400 space-y-2">
                <Package className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">No products match your search</p>
                <p className="text-[11px] text-slate-400">Try clearing filters or adding items in Product Catalog.</p>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: Active Cart & Checkout (5 cols) */}
        <div className="lg:col-span-5 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3 min-h-0 relative">
          
          {/* Shift Closed Overlay if shift is not active */}
          {!isShiftOpen && (
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs rounded-2xl z-20 flex flex-col items-center justify-center p-6 text-center text-white space-y-4">
              <div className="w-16 h-16 bg-[#FF6B00]/20 rounded-full flex items-center justify-center text-[#FF6B00] border border-[#FF6B00]/40">
                <Lock className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-white">Register Shift Closed</h3>
                <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
                  You must open a sales shift with an initial change float before ringing up transactions.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenShiftModal}
                className="px-6 py-3 bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Open Shift & Change Float</span>
              </button>
            </div>
          )}

          {/* Cart Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-[#FF6B00]" />
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Active Order Cart</h3>
              <span className="bg-orange-100 text-[#FF6B00] font-bold text-[10px] px-2 py-0.5 rounded-full">
                {cart.reduce((a, c) => a + c.quantity, 0)} items
              </span>
            </div>

            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[360px] space-y-2 pr-1">
            {cart.map(item => (
              <div
                key={item.product.id}
                className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{item.product.name}</p>
                  <p className="text-[10px] text-slate-500 font-medium">
                    {currency}{item.unitPrice.toFixed(2)} / {item.product.unit}
                  </p>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
                  <button
                    onClick={() => updateQuantity(item.product.id, -1)}
                    className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center text-xs font-bold text-slate-900">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.product.id, 1)}
                    className="w-5 h-5 rounded bg-orange-100 hover:bg-orange-200 text-[#FF6B00] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {/* Subtotal */}
                <div className="text-right min-w-[60px]">
                  <p className="text-xs font-black text-slate-900">{currency}{item.subtotal.toFixed(2)}</p>
                </div>
              </div>
            ))}

            {cart.length === 0 && (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <ShoppingCart className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">Cart is empty</p>
                <p className="text-[10px] text-slate-400">Click items in product grid to add to cart.</p>
              </div>
            )}
          </div>

          {/* Quick Branch Stock Adjustment Trigger */}
          <div className="bg-orange-50/80 border border-orange-200/80 rounded-xl p-2.5 text-xs text-orange-900 flex items-center justify-between">
            <span className="font-semibold text-slate-700 text-[11px]">Need stock opening balance?</span>
            <button
              onClick={onOpenStockAdjustmentModal}
              className="text-[11px] font-bold text-[#FF6B00] hover:underline cursor-pointer"
            >
              + Add Branch Stock
            </button>
          </div>

          {/* Order Totals */}
          <div className="space-y-1.5 pt-2 border-t border-slate-200 text-xs text-slate-600 font-medium">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-bold text-slate-900">{currency}{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax (8% sales tax)</span>
              <span className="font-bold text-slate-900">{currency}{taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-200">
              <span>Total Payable</span>
              <span className="text-[#FF6B00]">{currency}{totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Checkout Button */}
          <button
            disabled={cart.length === 0 || !isShiftOpen}
            onClick={handlePayClick}
            className="w-full py-3.5 bg-[#FF6B00] hover:bg-[#e66000] text-white font-black rounded-xl shadow-lg text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:shadow-none active:scale-95"
          >
            <CreditCard className="w-4 h-4" />
            <span>Process Payment {currency}{totalAmount.toFixed(2)}</span>
          </button>

        </div>

      </div>

    </div>
  );
};
