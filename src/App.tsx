import React, { useState, useEffect } from 'react';
import { 
  VendorProfile, 
  Warehouse, 
  Branch, 
  Terminal, 
  Product, 
  SupplierReceipt, 
  StockTransfer, 
  StockAdjustment, 
  Order, 
  CartItem,
  StaffMember,
  ApprovalRequest,
  AppMenuId,
  TerminalShift
} from './types';
import {
  fetchVendorProfile,
  onboardVendor,
  getLocalVendor,
  fetchWarehouses,
  fetchBranches,
  fetchTerminals,
  fetchProducts,
  fetchWarehouseStock,
  fetchBranchStock,
  fetchSupplierReceipts,
  fetchStockTransfers,
  fetchStockAdjustments,
  fetchOrders,
  processPOSOrder,
  fetchStaffMembers,
  saveStaffMember,
  fetchApprovalRequests,
  createApprovalRequest,
  reviewApprovalRequest,
  bulkImportProducts,
  fetchDeliveryCouriers,
  createDeliveryDispatch,
  updateVendorProfile,
  fetchActiveShift,
  openTerminalShift,
  recordOrderToShift,
  closeTerminalShift,
  fetchShiftHistory
} from './services/db';

// BI Layer
import { logBIEvent, fetchBILogs } from './bi/tracker';
import { processBIAnalytics } from './bi/analyticsEngine';
import { BIEvent, BIEventType } from './bi/types';

// UI Components
import { AuthView } from './components/AuthView';
import { OnboardingModal } from './components/OnboardingModal';
import { Navbar } from './components/Navbar';
import { POSTerminal } from './components/POS/POSTerminal';
import { WarehouseManagement } from './components/Warehouse/WarehouseManagement';
import { BranchManagement } from './components/Branch/BranchManagement';
import { ProductManagement } from './components/Products/ProductManagement';
import { ReportsDashboard } from './components/Reports/ReportsDashboard';

// New Architecture Components
import { StaffDesk } from './components/Staff/StaffDesk';
import { StaffManagement } from './components/Staff/StaffManagement';
import { ApprovalsWorkspace } from './components/Approvals/ApprovalsWorkspace';
import { BIAuditDashboard } from './components/BI/BIAuditDashboard';
import { SettingsWorkspace } from './components/Settings/SettingsWorkspace';
import { VendorBillingWorkspace } from './components/Billing/VendorBillingWorkspace';
import { Financial } from './components/Financial/Financial';
import { Sidebar } from './components/Sidebar';
import { StaffAccessForm } from './components/Auth/StaffAccessForm';

// Modals
import { ReceiveSupplierStockModal } from './components/Warehouse/ReceiveSupplierStockModal';
import { TransferStockModal } from './components/Warehouse/TransferStockModal';
import { StockAdjustmentModal } from './components/Branch/StockAdjustmentModal';
import { AddBranchTerminalModal } from './components/Branch/AddBranchTerminalModal';
import { ProductModal } from './components/Products/ProductModal';
import { ProductImportModal } from './components/Products/ProductImportModal';
import { PaymentModal } from './components/POS/PaymentModal';
import { ReceiptModal } from './components/POS/ReceiptModal';
import { OpenShiftModal } from './components/POS/OpenShiftModal';
import { CloseShiftModal } from './components/POS/CloseShiftModal';
import { EODReportModal } from './components/POS/EODReportModal';

// Delivery Fleet Components
import { DeliveryFleetManagement } from './components/Delivery/DeliveryFleetManagement';
import { PlanUpgradeModal } from './components/Delivery/PlanUpgradeModal';
import { DeliveryDispatchModal } from './components/Delivery/DeliveryDispatchModal';
import { DeliveryCourier, SubscriptionPlanType } from './types';

export default function App() {
  // Auth State
  const [authUser, setAuthUser] = useState<{ uid: string; email: string } | null>(null);
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Staff & Permissions State
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [activeStaff, setActiveStaff] = useState<StaffMember | null>(null);
  const [isStaffAuthenticated, setIsStaffAuthenticated] = useState<boolean>(false);

  // App Data State
  const [activeTab, setActiveTab] = useState<string>('desk');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouseStock, setWarehouseStock] = useState<Record<string, number>>({});
  const [branchStock, setBranchStock] = useState<Record<string, number>>({});

  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [activeTerminal, setActiveTerminal] = useState<Terminal | null>(null);

  // Logs, Approvals & BI State
  const [supplierReceipts, setSupplierReceipts] = useState<SupplierReceipt[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [stockAdjustments, setStockAdjustments] = useState<StockAdjustment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [biLogs, setBiLogs] = useState<BIEvent[]>([]);

  // Delivery & Subscription State
  const [couriers, setCouriers] = useState<DeliveryCourier[]>([]);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);

  // Modals State
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isStockAdjustmentModalOpen, setIsStockAdjustmentModalOpen] = useState(false);
  const [isAddBranchTerminalModalOpen, setIsAddBranchTerminalModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  // Checkout & Receipt Modals State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [activeCart, setActiveCart] = useState<CartItem[]>([]);
  const [cartTotals, setCartTotals] = useState<{ subtotal: number; tax: number; total: number }>({ subtotal: 0, tax: 0, total: 0 });
  const [lastCompletedOrder, setLastCompletedOrder] = useState<Order | null>(null);

  // Shift Management State
  const [activeShift, setActiveShift] = useState<TerminalShift | null>(null);
  const [isOpenShiftModalOpen, setIsOpenShiftModalOpen] = useState(false);
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState(false);
  const [isEODReportModalOpen, setIsEODReportModalOpen] = useState(false);
  const [lastClosedShift, setLastClosedShift] = useState<TerminalShift | null>(null);

  // 1. When Auth User changes, fetch Vendor Profile
  useEffect(() => {
    if (!authUser) {
      setVendor(null);
      setShowOnboarding(false);
      return;
    }

    const loadProfile = async () => {
      setLoadingProfile(true);
      try {
        let prof = await fetchVendorProfile(authUser.uid, authUser.email);
        
        // Auto onboard returning vendor if email is seigendc@gmail.com or profile is null but returning persona clicked
        if (!prof && (authUser.email === 'seigendc@gmail.com' || authUser.email.includes('vendor'))) {
          const result = await onboardVendor(authUser.uid, authUser.email, {
            businessName: authUser.email === 'seigendc@gmail.com' ? 'iTred Retail HQ' : 'iTred Commerce Store',
            address: '742 Evergreen Terrace, Retail District',
            phone: '+1 (555) 019-2831'
          });
          prof = result.profile;
        }

        if (prof && prof.onboardingCompleted) {
          setVendor(prof);
          setShowOnboarding(false);
          await loadAppData(authUser.uid, authUser.email);
        } else {
          setVendor(null);
          setShowOnboarding(true);
        }
      } catch (err) {
        console.error("Error loading vendor profile:", err);
        const local = getLocalVendor(authUser.uid);
        if (local) {
          setVendor(local);
          setShowOnboarding(false);
          await loadAppData(authUser.uid, authUser.email);
        } else {
          setVendor(null);
          setShowOnboarding(true);
        }
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, [authUser]);

  // Load initial app data
  const loadAppData = async (vendorId: string, email: string) => {
    try {
      const whs = await fetchWarehouses(vendorId);
      const brs = await fetchBranches(vendorId);
      const terms = await fetchTerminals(vendorId);
      const prods = await fetchProducts(vendorId);

      setWarehouses(whs);
      setBranches(brs);
      setTerminals(terms);
      setProducts(prods);

      const defaultBr = brs.find(b => b.isDefault) || brs[0] || null;
      setActiveBranch(defaultBr);

      const defaultTerm = terms.find(t => t.branchId === defaultBr?.id) || terms[0] || null;
      setActiveTerminal(defaultTerm);

      const defaultWh = whs.find(w => w.isDefault) || whs[0];
      if (defaultWh) {
        const whStk = await fetchWarehouseStock(vendorId, defaultWh.id).catch(() => ({}));
        setWarehouseStock(whStk);
      }

      if (defaultBr) {
        const brStk = await fetchBranchStock(vendorId, defaultBr.id).catch(() => ({}));
        setBranchStock(brStk);
      }

      // Load Staff Members & set default active staff
      const staff = await fetchStaffMembers(vendorId, email);
      setStaffList(staff);
      const adminStaff = staff.find(s => s.role === 'sysadmin') || staff[0];
      if (adminStaff) {
        setActiveStaff(adminStaff);
        if (adminStaff.grantedMenuIds && adminStaff.grantedMenuIds.length > 0) {
          setActiveTab('desk');
        }
      } else {
        const fallbackStaff: StaffMember = {
          id: `staff_${vendorId}_sysadmin`,
          vendorId,
          name: 'System Administrator (You)',
          email: email || 'sysadmin@itred.com',
          role: 'sysadmin',
          grantedMenuIds: ['desk', 'pos', 'warehouse', 'transfers', 'branches', 'products', 'reports', 'approvals', 'staff', 'bi_audit'],
          status: 'active',
          createdAt: new Date().toISOString()
        };
        setActiveStaff(fallbackStaff);
        setStaffList([fallbackStaff]);
      }

      // Load logs, approvals, and BI events
      const rcpts = await fetchSupplierReceipts(vendorId).catch(() => []);
      const trfs = await fetchStockTransfers(vendorId).catch(() => []);
      const adjs = await fetchStockAdjustments(vendorId).catch(() => []);
      const ords = await fetchOrders(vendorId).catch(() => []);
      const appr = await fetchApprovalRequests(vendorId).catch(() => []);
      const bLogs = await fetchBILogs(vendorId).catch(() => []);
      const crs = await fetchDeliveryCouriers(vendorId).catch(() => []);

      setSupplierReceipts(rcpts);
      setTransfers(trfs);
      setStockAdjustments(adjs);
      setOrders(ords);
      setApprovalRequests(appr);
      setBiLogs(bLogs);
      setCouriers(crs);

      // Initial log
      await logBIEvent(vendorId, 'AUTH_LOGIN', `User session started for ${email}`, { vendorId }).catch(() => {});
    } catch (e) {
      console.warn('Error loading app data, enforcing safety fallback staff:', e);
      if (!activeStaff) {
        const fallbackStaff: StaffMember = {
          id: `staff_${vendorId}_sysadmin`,
          vendorId,
          name: 'System Administrator (You)',
          email: email || 'sysadmin@itred.com',
          role: 'sysadmin',
          grantedMenuIds: ['desk', 'pos', 'warehouse', 'transfers', 'branches', 'products', 'reports', 'approvals', 'staff', 'bi_audit'],
          status: 'active',
          createdAt: new Date().toISOString()
        };
        setActiveStaff(fallbackStaff);
        setStaffList([fallbackStaff]);
      }
    }
  };

  // Reload inventory & logs when active branch changes
  useEffect(() => {
    if (!authUser || !activeBranch) return;
    fetchBranchStock(authUser.uid, activeBranch.id).then(stk => setBranchStock(stk));
  }, [activeBranch, authUser]);

  // Load Active Terminal Shift whenever vendor or activeTerminal changes
  useEffect(() => {
    if (!vendor || !activeTerminal) return;
    fetchActiveShift(vendor.id, activeTerminal.id).then(shift => setActiveShift(shift));
  }, [vendor, activeTerminal]);

  // Handler for completion of Onboarding
  const handleOnboardingComplete = async (profile: VendorProfile) => {
    setVendor(profile);
    setShowOnboarding(false);
    if (authUser) {
      await loadAppData(profile.id, authUser.email);
    }
  };

  // Switch Active Staff Member & adjust activeTab to match granted permissions
  const handleSwitchStaff = (staff: StaffMember) => {
    setActiveStaff(staff);
    if (!staff.grantedMenuIds.includes(activeTab as any)) {
      setActiveTab('desk');
    }
  };

  // Refresh helper for after modals submit
  const refreshAllData = async () => {
    if (!authUser) return;
    await loadAppData(authUser.uid, authUser.email);
  };

  // Save / Update Staff Member
  const handleSaveStaff = async (staffData: Partial<StaffMember>) => {
    if (!vendor) return;
    await saveStaffMember(vendor.id, staffData);
    await refreshAllData();
  };

  // Review Approval Request
  const handleReviewApproval = async (
    requestId: string,
    status: 'approved' | 'rejected',
    comment?: string
  ) => {
    if (!vendor || !activeStaff) return;
    await reviewApprovalRequest(
      vendor.id,
      requestId,
      status,
      { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role },
      comment
    );
    await refreshAllData();
  };

  // Submit Stocktake Approval Request
  const handleSubmitStocktakeApproval = async (payload: any) => {
    if (!vendor || !activeStaff) return;
    await createApprovalRequest(vendor.id, {
      vendorId: vendor.id,
      type: 'stock_adjustment',
      title: payload.title,
      description: payload.description,
      requesterId: activeStaff.id,
      requesterName: activeStaff.name,
      requesterRole: activeStaff.role,
      branchId: payload.dataPayload?.locationId,
      branchName: payload.dataPayload?.locationName,
      dataPayload: payload.dataPayload,
    });
    await refreshAllData();
  };

  // Process POS Order completion
  const handleConfirmPayment = async (paymentDetails: any) => {
    if (!vendor || !activeBranch || !activeTerminal || !activeStaff) return;

    try {
      const deliveryDetails = paymentDetails.deliveryDetails;
      const deliveryFee = deliveryDetails ? deliveryDetails.deliveryFee : 0;
      const finalTotalAmount = cartTotals.total + deliveryFee;

      const newOrder = await processPOSOrder(vendor.id, {
        vendorId: vendor.id,
        branchId: activeBranch.id,
        branchName: activeBranch.name,
        terminalId: activeTerminal.id,
        terminalName: activeTerminal.name,
        orderNumber: `ORD-${Math.floor(10000 + Math.random() * 90000)}`,
        items: activeCart,
        subtotal: cartTotals.subtotal,
        taxAmount: cartTotals.tax,
        discountAmount: 0,
        totalAmount: finalTotalAmount,
        paymentMethod: paymentDetails.method,
        paymentDetails: {
          cashGiven: paymentDetails.cashGiven,
          changeDue: paymentDetails.changeDue,
          cardRef: paymentDetails.cardRef,
          mobileProvider: paymentDetails.mobileProvider,
          mobileRef: paymentDetails.mobileRef
        },
        customerName: paymentDetails.customerName,
        customerPhone: paymentDetails.customerPhone,
        deliveryDetails: deliveryDetails ? {
          ...deliveryDetails,
          dispatchStatus: 'dispatched'
        } : undefined
      });

      // If delivery order, trigger live dispatch message to courier terminal!
      if (deliveryDetails) {
        await createDeliveryDispatch(vendor.id, {
          vendorId: vendor.id,
          orderId: newOrder.id,
          orderNumber: newOrder.orderNumber,
          courierId: deliveryDetails.courierId,
          courierName: deliveryDetails.courierName,
          courierPhone: deliveryDetails.courierPhone,
          vehicleType: deliveryDetails.vehicleType,
          vehiclePlate: deliveryDetails.vehiclePlate,
          branchName: activeBranch.name,
          customerName: paymentDetails.customerName || 'Customer',
          customerPhone: paymentDetails.customerPhone || 'N/A',
          deliveryAddress: deliveryDetails.deliveryAddress,
          deliveryFee: deliveryDetails.deliveryFee,
          orderTotal: finalTotalAmount,
          status: 'dispatched'
        });

        alert(
          `🚨 LIVE DISPATCH ALERT TO TERMINAL:\n` +
          `Message broadcasted to courier ${deliveryDetails.courierName} (${deliveryDetails.vehicleType.toUpperCase()} - ${deliveryDetails.vehiclePlate})!\n` +
          `"Attention ${deliveryDetails.courierName}: Order #${newOrder.orderNumber} is ready for collection at ${activeBranch.name} counter for ${paymentDetails.customerName || 'Customer'} (${deliveryDetails.deliveryAddress}). Fee: $${deliveryDetails.deliveryFee.toFixed(2)}."`
        );
      }

      // Log in BI Layer
      await logBIEvent(
        vendor.id,
        'POS_TRANSACTION',
        `Completed Order ${newOrder.orderNumber} for $${newOrder.totalAmount.toFixed(2)} (${newOrder.paymentMethod})${deliveryDetails ? ' with Courier Dispatch' : ''}`,
        { orderId: newOrder.id, itemsCount: newOrder.items.length, total: newOrder.totalAmount, delivery: !!deliveryDetails },
        { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role, branchId: activeBranch.id, branchName: activeBranch.name }
      );

      // Record to active shift if present
      if (activeShift) {
        const updatedShift = await recordOrderToShift(vendor.id, activeShift.id, newOrder);
        if (updatedShift) {
          setActiveShift(updatedShift);
        }
      }

      setLastCompletedOrder(newOrder);
      setIsPaymentModalOpen(false);
      setIsReceiptModalOpen(true);
      await refreshAllData();
    } catch (e) {
      console.error(e);
      alert('Error saving transaction order.');
    }
  };

  // Terminal Shift Handlers
  const handleConfirmOpenShift = async (openingCash: number, openingNotes?: string) => {
    if (!vendor || !activeBranch || !activeTerminal || !activeStaff) return;
    const shift = await openTerminalShift(vendor.id, {
      branchId: activeBranch.id,
      branchName: activeBranch.name,
      terminalId: activeTerminal.id,
      terminalName: activeTerminal.name,
      staffId: activeStaff.id,
      staffName: activeStaff.name,
      openingCash,
      openingNotes
    });
    setActiveShift(shift);
    setIsOpenShiftModalOpen(false);
  };

  const handleConfirmCloseShift = async (closingCash: number, closingNotes?: string) => {
    if (!vendor || !activeShift) throw new Error('No active shift found');
    const closed = await closeTerminalShift(vendor.id, activeShift.id, closingCash, closingNotes);
    setActiveShift(null);
    setLastClosedShift(closed);
    setIsCloseShiftModalOpen(false);
    setIsEODReportModalOpen(true);
    return closed;
  };

  // Vendor Plan Upgrade Handler
  const handleUpgradePlan = async (plan: SubscriptionPlanType) => {
    if (!vendor) return;
    try {
      const updatedProfile: VendorProfile = {
        ...vendor,
        subscriptionPlan: plan,
        updatedAt: new Date().toISOString()
      };
      await updateVendorProfile(vendor.id, updatedProfile);
      setVendor(updatedProfile);
      await logBIEvent(
        vendor.id,
        'SETTINGS_MUTATED',
        `Vendor Subscription Plan upgraded to ${plan.toUpperCase()}`,
        { subscriptionPlan: plan },
        activeStaff ? { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role } : undefined
      );
      alert(`Subscription Plan successfully updated to ${plan.replace('_', ' ').toUpperCase()}! Delivery features are now active.`);
    } catch (e) {
      console.error('Error upgrading plan:', e);
      alert('Failed to update subscription plan.');
    }
  };

  // Product Bulk Import Handler
  const handleConfirmImport = async (
    newProducts: Partial<Product>[],
    stockUpdates: { productId: string; addWarehouseQty: number }[],
    importSummary: { totalImported: number; totalMerged: number; sector: string }
  ) => {
    if (!vendor) return;
    try {
      const defaultWh = warehouses[0];
      await bulkImportProducts(vendor.id, defaultWh?.id || '', newProducts, stockUpdates);
      await logBIEvent(
        vendor.id,
        'PRODUCT_BULK_IMPORT',
        `Imported ${importSummary.totalImported} products & merged ${importSummary.totalMerged} items mapped to sector ${importSummary.sector}`,
        { totalImported: importSummary.totalImported, totalMerged: importSummary.totalMerged, sector: importSummary.sector },
        activeStaff ? { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role } : undefined
      );
      await refreshAllData();
      alert(`Import Successful! Added ${importSummary.totalImported} new products and merged stock for ${importSummary.totalMerged} items.`);
    } catch (e) {
      console.error('Error during catalog import:', e);
      alert('Failed to complete catalog import.');
    }
  };

  // Sign Out Handler
  const handleSignOut = () => {
    setAuthUser(null);
    setVendor(null);
    setActiveStaff(null);
    setIsStaffAuthenticated(false);
  };

  // Compute BI Insights via Analytics Engine
  const biAnalytics = processBIAnalytics(biLogs, products, orders, transfers, supplierReceipts, stockAdjustments);
  const pendingApprovalsCount = approvalRequests.filter(r => r.status === 'pending').length;

  // 1. Not Authenticated View
  if (!authUser) {
    return <AuthView onAuthSuccess={(u) => setAuthUser(u)} />;
  }

  // 2. Loading Profile state
  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-slate-800">Initializing iTred BI Engine & Staff Desk...</p>
        </div>
      </div>
    );
  }

  // 3. First-time Vendor Onboarding Flow
  if (showOnboarding || !vendor) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <OnboardingModal
          isOpen={true}
          userEmail={authUser.email}
          vendorId={authUser.uid}
          onComplete={handleOnboardingComplete}
        />
      </div>
    );
  }

  // 4. Staff Access Form (Prompt after vendor auth)
  if (!isStaffAuthenticated || !activeStaff) {
    return (
      <StaffAccessForm
        vendor={vendor}
        staffList={staffList}
        branches={branches}
        activeStaff={activeStaff}
        onSaveStaff={handleSaveStaff}
        onStaffAuthenticated={(staff, targetTab = 'pos') => {
          setActiveStaff(staff);
          setIsStaffAuthenticated(true);
          setActiveTab(targetTab as AppMenuId);
          logBIEvent(
            vendor.id,
            'SHIFT_OPENED',
            `Staff ${staff.name} logged in (${targetTab.toUpperCase()})`,
            { staffRole: staff.role, targetTab },
            { staffId: staff.id, staffName: staff.name, staffRole: staff.role }
          );
        }}
        onVendorSignOut={handleSignOut}
      />
    );
  }

  // 4. Main POS & BI Architecture Dashboard
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col lg:flex-row">
      
      {/* Menu Sidebar */}
      <Sidebar
        vendor={vendor}
        activeStaff={activeStaff}
        staffList={staffList}
        onSwitchStaff={handleSwitchStaff}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        branches={branches}
        activeBranch={activeBranch}
        setActiveBranch={(b) => {
          setActiveBranch(b);
          const term = terminals.find(t => t.branchId === b.id) || null;
          setActiveTerminal(term);
        }}
        terminals={terminals}
        activeTerminal={activeTerminal}
        setActiveTerminal={setActiveTerminal}
        pendingApprovalsCount={pendingApprovalsCount}
        onOpenSupplierReceiveModal={() => setIsSupplierModalOpen(true)}
        onOpenTransferModal={() => setIsTransferModalOpen(true)}
        onOpenStockAdjustmentModal={() => setIsStockAdjustmentModalOpen(true)}
        onLogout={handleSignOut}
      />

      {/* Main Workspace Board */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 bg-slate-50">
        
        {/* Desk View */}
        {activeTab === 'desk' && (
          <StaffDesk
            staff={activeStaff}
            activeBranch={activeBranch}
            activeTerminal={activeTerminal}
            pendingApprovalsCount={pendingApprovalsCount}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        )}

        {/* POS Register */}
        {activeTab === 'pos' && (!activeStaff.grantedMenuIds || activeStaff.grantedMenuIds.length === 0 || activeStaff.grantedMenuIds.includes('pos')) && (
          <POSTerminal
            products={products}
            branchStock={branchStock}
            vendor={vendor}
            activeBranch={activeBranch}
            activeTerminal={activeTerminal}
            activeStaff={activeStaff}
            activeShift={activeShift}
            onOpenPaymentModal={(cart, totals) => {
              setActiveCart(cart);
              setCartTotals(totals);
              setIsPaymentModalOpen(true);
            }}
            onOpenStockAdjustmentModal={() => setIsStockAdjustmentModalOpen(true)}
            onOpenShiftModal={() => setIsOpenShiftModalOpen(true)}
            onCloseShiftModal={() => setIsCloseShiftModalOpen(true)}
            onViewShiftReport={() => setIsEODReportModalOpen(true)}
          />
        )}

        {/* Central Warehouse */}
        {activeTab === 'warehouse' && activeStaff.grantedMenuIds.includes('warehouse') && (
          <WarehouseManagement
            warehouses={warehouses}
            products={products}
            warehouseStock={warehouseStock}
            supplierReceipts={supplierReceipts}
            transfers={transfers}
            onOpenSupplierReceiveModal={() => setIsSupplierModalOpen(true)}
            onOpenTransferModal={() => setIsTransferModalOpen(true)}
          />
        )}

        {/* Stock Transfers */}
        {activeTab === 'transfers' && activeStaff.grantedMenuIds.includes('transfers') && (
          <WarehouseManagement
            warehouses={warehouses}
            products={products}
            warehouseStock={warehouseStock}
            supplierReceipts={supplierReceipts}
            transfers={transfers}
            onOpenSupplierReceiveModal={() => setIsSupplierModalOpen(true)}
            onOpenTransferModal={() => setIsTransferModalOpen(true)}
          />
        )}

        {/* Branches & Terminals */}
        {activeTab === 'branches' && activeStaff.grantedMenuIds.includes('branches') && (
          <BranchManagement
            branches={branches}
            terminals={terminals}
            products={products}
            branchStock={branchStock}
            stockAdjustments={stockAdjustments}
            activeBranch={activeBranch}
            setActiveBranch={setActiveBranch}
            onOpenStockAdjustmentModal={() => setIsStockAdjustmentModalOpen(true)}
            onOpenAddBranchTerminalModal={() => setIsAddBranchTerminalModalOpen(true)}
          />
        )}

        {/* Products */}
        {activeTab === 'products' && activeStaff.grantedMenuIds.includes('products') && (
          <ProductManagement
            products={products}
            warehouseStock={warehouseStock}
            branchStock={branchStock}
            warehouses={warehouses}
            branches={branches}
            activeStaff={activeStaff}
            vendorId={vendor.id}
            onOpenAddProductModal={() => {
              setProductToEdit(null);
              setIsProductModalOpen(true);
            }}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onEditProduct={(p) => {
              setProductToEdit(p);
              setIsProductModalOpen(true);
            }}
            onSubmitStocktakeApproval={handleSubmitStocktakeApproval}
            onNavigateToApprovals={() => setActiveTab('approvals')}
          />
        )}

        {/* Sales & Reports */}
        {activeTab === 'reports' && activeStaff.grantedMenuIds.includes('reports') && (
          <ReportsDashboard
            orders={orders}
            products={products}
            branches={branches}
            warehouseStock={warehouseStock}
            branchStock={branchStock}
          />
        )}

        {/* Financial & Check Writer Workspace */}
        {activeTab === 'financial' && (
          <Financial
            vendor={vendor}
            activeStaff={activeStaff}
          />
        )}

        {/* Transaction Approvals */}
        {activeTab === 'approvals' && activeStaff.grantedMenuIds.includes('approvals') && (
          <ApprovalsWorkspace
            vendorId={vendor.id}
            approvalRequests={approvalRequests}
            activeStaff={activeStaff}
            onReviewRequest={handleReviewApproval}
          />
        )}

        {/* Sysadmin Staff Management */}
        {activeTab === 'staff' && activeStaff.grantedMenuIds.includes('staff') && (
          <StaffManagement
            vendorId={vendor.id}
            staffList={staffList}
            branches={branches}
            activeStaff={activeStaff}
            onSwitchStaff={handleSwitchStaff}
            onSaveStaff={handleSaveStaff}
          />
        )}

        {/* BI Audit & Brain Dashboard */}
        {activeTab === 'bi_audit' && activeStaff.grantedMenuIds.includes('bi_audit') && (
          <BIAuditDashboard
            logs={biLogs}
            insights={biAnalytics.insights}
            aggregates={biAnalytics.aggregates}
            products={products}
            warehouses={warehouses}
            branches={branches}
            warehouseStock={warehouseStock}
            branchStock={branchStock}
            currency={vendor.currency || '$'}
          />
        )}

        {/* Delivery Services Workspace */}
        {activeTab === 'delivery' && (
          <DeliveryFleetManagement
            vendor={vendor}
            branches={branches}
            activeStaff={activeStaff}
            onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
            onOpenDispatchModal={() => setIsDispatchModalOpen(true)}
            onLogBIEvent={(evt, desc, meta) => logBIEvent(vendor.id, evt as BIEventType, desc, meta, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role })}
          />
        )}

        {/* Vendor Billing & Subscriptions Workspace */}
        {activeTab === 'billing' && activeStaff.grantedMenuIds.includes('billing') && (
          <VendorBillingWorkspace
            vendor={vendor}
            activeStaff={activeStaff}
            branches={branches}
          />
        )}

        {/* POS Settings Workspace */}
        {activeTab === 'settings' && activeStaff.grantedMenuIds.includes('settings') && (
          <SettingsWorkspace
            vendor={vendor}
            activeStaff={activeStaff}
            staffList={staffList}
            branches={branches}
            onUpdateVendor={(updated) => setVendor(updated)}
            onSaveStaff={handleSaveStaff}
            onLogBIEvent={(evt, desc, meta) => logBIEvent(vendor.id, evt as BIEventType, desc, meta, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role })}
          />
        )}

      </main>
      </div>

      {/* Floating Pop-up Form Modals */}
      <ReceiveSupplierStockModal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        vendorId={vendor.id}
        warehouses={warehouses}
        products={products}
        onSuccess={refreshAllData}
      />

      <TransferStockModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        vendorId={vendor.id}
        warehouses={warehouses}
        branches={branches}
        products={products}
        warehouseStock={warehouseStock}
        onSuccess={refreshAllData}
      />

      <StockAdjustmentModal
        isOpen={isStockAdjustmentModalOpen}
        onClose={() => setIsStockAdjustmentModalOpen(false)}
        vendorId={vendor.id}
        branches={branches}
        activeBranchId={activeBranch?.id}
        products={products}
        branchStock={branchStock}
        onSuccess={refreshAllData}
      />

      <AddBranchTerminalModal
        isOpen={isAddBranchTerminalModalOpen}
        onClose={() => setIsAddBranchTerminalModalOpen(false)}
        vendorId={vendor.id}
        branches={branches}
        onSuccess={refreshAllData}
      />

      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        vendorId={vendor.id}
        productToEdit={productToEdit}
        onSuccess={refreshAllData}
      />

      <ProductImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        vendor={vendor}
        existingProducts={products}
        onConfirmImport={handleConfirmImport}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        cartItems={activeCart}
        subtotal={cartTotals.subtotal}
        taxAmount={cartTotals.tax}
        discountAmount={0}
        totalAmount={cartTotals.total}
        branchName={activeBranch?.name || 'Main Branch'}
        terminalName={activeTerminal?.name || 'Terminal 01'}
        vendor={vendor}
        couriers={couriers}
        onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
        onConfirmPayment={handleConfirmPayment}
      />

      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        order={lastCompletedOrder}
        vendor={vendor}
      />

      <PlanUpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        vendor={vendor}
        onUpgradePlan={handleUpgradePlan}
      />

      <DeliveryDispatchModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        vendor={vendor}
      />

      {/* Terminal Shift Modals */}
      <OpenShiftModal
        isOpen={isOpenShiftModalOpen}
        onClose={() => setIsOpenShiftModalOpen(false)}
        vendor={vendor}
        activeBranch={activeBranch}
        activeTerminal={activeTerminal}
        activeStaff={activeStaff}
        onConfirmOpenShift={handleConfirmOpenShift}
      />

      <CloseShiftModal
        isOpen={isCloseShiftModalOpen}
        onClose={() => setIsCloseShiftModalOpen(false)}
        vendor={vendor}
        shift={activeShift}
        onConfirmCloseShift={handleConfirmCloseShift}
      />

      <EODReportModal
        isOpen={isEODReportModalOpen}
        onClose={() => setIsEODReportModalOpen(false)}
        vendor={vendor}
        shift={lastClosedShift || activeShift}
      />

    </div>
  );
}
