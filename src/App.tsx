import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
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
  TerminalShift,
  Customer,
  CreditSale,
  CreditPayment,
  CollectionActivity
} from './types';
import {
  fetchVendorProfile,
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
  saveProduct,
  archiveOrDeleteProduct,
  inspectProductUsage,
  restoreProduct,
  fetchDeliveryCouriers,
  createDeliveryDispatch,
  updateVendorProfile,
  fetchActiveShift,
  openTerminalShift,
  recordOrderToShift,
  closeTerminalShift,
  fetchShiftHistory,
  fetchCustomers,
  saveCustomer,
  fetchCreditSales,
  fetchCreditPayments,
  fetchCollectionActivities
  ,fetchInventoryCostSnapshots
} from './services/db';
import type { InventoryCostSnapshot } from './services/db';
import { auth } from './lib/firebase';
import {
  AuthIdentity,
  isDemoLoginEnabled,
  resolveAuthState,
} from './auth/authPolicy';

// BI Layer
import { logBIEvent, fetchBILogs } from './bi/tracker';
import { processBIAnalytics } from './bi/analyticsEngine';
import { BIEvent, BIEventType } from './bi/types';
import { TransferSlipAction, TransferSlipFormat } from './services/transferSlip';

// UI Components
import { AuthView } from './components/AuthView';
import { OnboardingModal } from './components/OnboardingModal';
import { POSTerminal } from './components/POS/POSTerminal';
import { WarehouseManagement } from './components/Warehouse/WarehouseManagement';
import { BranchManagement } from './components/Branch/BranchManagement';
import { ProductManagement } from './components/Products/ProductManagement';
import { ReportsDashboard } from './components/Reports/ReportsDashboard';
import { CustomerManagement, CustomerSaveInput } from './components/Customers/CustomerManagement';

// New Architecture Components
import { StaffDesk } from './components/Staff/StaffDesk';
import { StockActionDesk } from './components/Staff/StockActionDesk';
import { StaffManagement } from './components/Staff/StaffManagement';
import { ApprovalsWorkspace } from './components/Approvals/ApprovalsWorkspace';
import { BIAuditDashboard } from './components/BI/BIAuditDashboard';
import { SettingsWorkspace } from './components/Settings/SettingsWorkspace';
import { VendorBillingWorkspace } from './components/Billing/VendorBillingWorkspace';
import { Financial } from './components/Financial/Financial';
import { Sidebar } from './components/Sidebar';
import { StaffAccessForm } from './components/Auth/StaffAccessForm';
import { OfflineOperationalStateBadge } from './components/Offline/OfflineOperationalStateBadge';

// Modals
import { ReceiveSupplierStockModal } from './components/Warehouse/ReceiveSupplierStockModal';
import { TransferStockModal } from './components/Warehouse/TransferStockModal';
import { AddWarehouseModal } from './components/Warehouse/AddWarehouseModal';
import { StockAdjustmentModal } from './components/Branch/StockAdjustmentModal';
import { StockCostCenterMatrix } from './components/Inventory/StockCostCenterMatrix';
import { ManagedStocktakeWorkspace } from './components/Inventory/ManagedStocktakeWorkspace';
import { PurchaseOrderWorkspace } from './components/Inventory/PurchaseOrderWorkspace';
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
import { buildOpeningBalanceRequest, CanonicalProductImportRow, ProductImportBatch, toProductMaster } from './features/product-import';
import { assertStocktakePermission } from './features/stocktake';

export default function App() {
  // Auth State
  const [authUser, setAuthUser] = useState<AuthIdentity | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [authSessionError, setAuthSessionError] = useState('');
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
  const [inventoryCosts, setInventoryCosts] = useState<Record<string, InventoryCostSnapshot>>({});
  const [warehouseStock, setWarehouseStock] = useState<Record<string, number>>({});
  const [branchStock, setBranchStock] = useState<Record<string, number>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditSales, setCreditSales] = useState<CreditSale[]>([]);
  const [creditPayments, setCreditPayments] = useState<CreditPayment[]>([]);
  const [collectionActivities, setCollectionActivities] = useState<CollectionActivity[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);

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
  const [isAddWarehouseModalOpen, setIsAddWarehouseModalOpen] = useState(false);
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
  const [checkoutAttemptId, setCheckoutAttemptId] = useState<string | null>(null);

  // Shift Management State
  const [activeShift, setActiveShift] = useState<TerminalShift | null>(null);
  const [isOpenShiftModalOpen, setIsOpenShiftModalOpen] = useState(false);
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState(false);
  const [isEODReportModalOpen, setIsEODReportModalOpen] = useState(false);
  const [lastClosedShift, setLastClosedShift] = useState<TerminalShift | null>(null);

  const demoLoginEnabled = isDemoLoginEnabled(
    import.meta.env.DEV,
    import.meta.env.VITE_ENABLE_DEMO_LOGIN,
  );

  // Restore and monitor the Firebase session.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      user => {
        const resolution = resolveAuthState(user);
        if (resolution.status === 'authenticated') {
          setAuthSessionError('');
          setAuthUser(resolution.identity);
        } else {
          setAuthUser(null);
          setVendor(null);
          setActiveStaff(null);
          setIsStaffAuthenticated(false);

          if (resolution.status === 'invalid') {
            setAuthSessionError('Your Google account must provide a valid email address.');
            void firebaseSignOut(auth);
          }
        }
        setAuthResolved(true);
      },
      error => {
        console.error('Firebase authentication state error:', error);
        setAuthUser(null);
        setVendor(null);
        setActiveStaff(null);
        setIsStaffAuthenticated(false);
        setAuthSessionError('Unable to verify your Firebase session. Please sign in again.');
        setAuthResolved(true);
      },
    );

    return unsubscribe;
  }, []);

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
        const prof = await fetchVendorProfile(authUser.uid);

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
      // Independent collections should not make startup wait on one another.
      const [whs, brs, terms, prods] = await Promise.all([
        fetchWarehouses(vendorId),
        fetchBranches(vendorId),
        fetchTerminals(vendorId),
        fetchProducts(vendorId),
      ]);

      setWarehouses(whs);
      setBranches(brs);
      setTerminals(terms);
      setProducts(prods);

      const defaultBr = brs.find(b => b.isDefault) || brs[0] || null;
      setActiveBranch(defaultBr);

      const defaultTerm = terms.find(t => t.branchId === defaultBr?.id) || terms[0] || null;
      setActiveTerminal(defaultTerm);

      const defaultWh = whs.find(w => w.isDefault) || whs[0];
      const [whStk, brStk, staff, rcpts, trfs, adjs, ords, appr, bLogs, crs, costSnapshots] = await Promise.all([
        defaultWh ? fetchWarehouseStock(vendorId, defaultWh.id).catch(() => ({})) : Promise.resolve({}),
        defaultBr ? fetchBranchStock(vendorId, defaultBr.id).catch(() => ({})) : Promise.resolve({}),
        fetchStaffMembers(vendorId, email),
        fetchSupplierReceipts(vendorId).catch(() => []),
        fetchStockTransfers(vendorId).catch(() => []),
        fetchStockAdjustments(vendorId).catch(() => []),
        fetchOrders(vendorId).catch(() => []),
        fetchApprovalRequests(vendorId).catch(() => []),
        fetchBILogs(vendorId).catch(() => []),
        fetchDeliveryCouriers(vendorId).catch(() => []),
        fetchInventoryCostSnapshots(vendorId).catch(() => ({})),
        loadCustomerData(vendorId),
      ]);
      setWarehouseStock(whStk);
      setBranchStock(brStk);

      // Load Staff Members & set default active staff
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

      setSupplierReceipts(rcpts);
      setTransfers(trfs);
      setStockAdjustments(adjs);
      setOrders(ords);
      setApprovalRequests(appr);
      setBiLogs(bLogs);
      setCouriers(crs);
      setInventoryCosts(costSnapshots);

      // Audit logging is non-critical and must not hold the loading screen open.
      void logBIEvent(vendorId, 'AUTH_LOGIN', `User session started for ${email}`, { vendorId }).catch(() => {});
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

  const loadCustomerData = async (vendorId: string) => {
    setCustomerLoading(true);
    setCustomerError(null);
    try {
      const [
        loadedCustomers,
        loadedCreditSales,
        loadedCreditPayments,
        loadedActivities,
      ] = await Promise.all([
        fetchCustomers(vendorId),
        fetchCreditSales(vendorId),
        fetchCreditPayments(vendorId),
        fetchCollectionActivities(vendorId),
      ]);
      setCustomers(loadedCustomers.filter(item => item.vendorId === vendorId));
      setCreditSales(loadedCreditSales.filter(item => item.vendorId === vendorId));
      setCreditPayments(loadedCreditPayments.filter(item => item.vendorId === vendorId));
      setCollectionActivities(loadedActivities.filter(item => item.vendorId === vendorId));
    } catch (reason) {
      setCustomerError(
        reason instanceof Error ? reason.message : 'Unable to load customer data.',
      );
    } finally {
      setCustomerLoading(false);
    }
  };

  const handleSaveCustomer = async (customerData: CustomerSaveInput) => {
    if (!vendor) return;
    await saveCustomer(vendor.id, customerData);
    await loadCustomerData(vendor.id);
  };

  // Review Approval Request
  const handleReviewApproval = async (
    requestId: string,
    status: 'APPROVED' | 'REJECTED' | 'CANCELLED',
    expectedVersion: number,
    comment?: string
  ) => {
    if (!vendor || !activeStaff) return;
    await reviewApprovalRequest(
      vendor.id,
      requestId,
      status,
      { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role },
      expectedVersion,
      comment
    );
    await refreshAllData();
  };

  // Submit Stocktake Approval Request
  const handleSubmitStocktakeApproval = async (payload: {
    title: string;
    description: string;
    idempotencyKey: string;
    dataPayload: {
      locationType: 'warehouse' | 'branch';
      locationId: string;
      locationName: string;
      items: {
        productId: string;
        productName: string;
        quantityDelta: number;
        costPrice?: number;
        reason?: string;
      }[];
      [key: string]: unknown;
    };
  }) => {
    if (!vendor || !activeStaff) return;
    assertStocktakePermission(activeStaff.role, 'stocktake.submit');
    await createApprovalRequest(vendor.id, {
      entityType: 'STOCKTAKE_ADJUSTMENT',
      entityId: `stocktake_${payload.idempotencyKey.replace(/[^a-z0-9_-]+/gi, '_')}`,
      idempotencyKey: payload.idempotencyKey,
      title: payload.title,
      description: payload.description,
      requester: { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role },
      branchId: payload.dataPayload.locationType === 'branch' ? payload.dataPayload.locationId : undefined,
      branchName: payload.dataPayload.locationType === 'branch' ? payload.dataPayload.locationName : undefined,
      warehouseId: payload.dataPayload.locationType === 'warehouse' ? payload.dataPayload.locationId : undefined,
      warehouseName: payload.dataPayload.locationType === 'warehouse' ? payload.dataPayload.locationName : undefined,
      dataPayload: payload.dataPayload,
    });
    await refreshAllData();
  };

  const handleTransferSlipAction = async (
    action: TransferSlipAction,
    transfer: StockTransfer,
    format: TransferSlipFormat,
  ) => {
    if (!vendor || !activeStaff) return;
    const eventByAction: Record<TransferSlipAction, BIEventType> = {
      previewed: 'TRANSFER_SLIP_PREVIEWED',
      printed: 'TRANSFER_SLIP_PRINTED',
      exported: 'TRANSFER_SLIP_EXPORTED',
    };
    await logBIEvent(
      vendor.id,
      eventByAction[action],
      `Transfer slip ${action} for ${transfer.transferNo}`,
      {
        transferId: transfer.id,
        transferNumber: transfer.transferNo,
        transferStatus: transfer.status,
        format,
        sourceWarehouseId: transfer.sourceWarehouseId,
        sourceBranchId: transfer.sourceBranchId,
        targetBranchId: transfer.targetBranchId,
        readOnlyDocument: true,
      },
      {
        staffId: activeStaff.id,
        staffName: activeStaff.name,
        staffRole: activeStaff.role,
        branchId: transfer.sourceBranchId,
        branchName: transfer.sourceBranchName,
      },
    );
  };

  // Process POS Order completion
  const handleConfirmPayment = async (paymentDetails: any) => {
    if (!vendor || !activeBranch || !activeTerminal || !activeStaff || !checkoutAttemptId) {
      alert('The sale session is incomplete. Close payment and try again.');
      return;
    }
    if (activeTerminal.branchId !== activeBranch.id) {
      alert('The selected terminal does not belong to the active sale branch.');
      return;
    }

    try {
      const deliveryDetails = paymentDetails.deliveryDetails;
      const deliveryFee = deliveryDetails ? deliveryDetails.deliveryFee : 0;
      const finalTotalAmount = cartTotals.total + deliveryFee;

      const saleResult = await processPOSOrder(vendor.id, checkoutAttemptId, {
        vendorId: vendor.id,
        branchId: activeBranch.id,
        branchName: activeBranch.name,
        terminalId: activeTerminal.id,
        terminalName: activeTerminal.name,
        orderNumber: `ORD-${checkoutAttemptId.slice(-8).toUpperCase()}`,
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

      if (saleResult.success === false) {
        alert(saleResult.message);
        return;
      }

      const newOrder = saleResult.order;

      if (!saleResult.duplicate) {
        try {
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
          `ðŸš¨ LIVE DISPATCH ALERT TO TERMINAL:\n` +
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
        } catch (error) {
          console.warn('Sale committed but a post-sale activity failed:', error);
        }
      }

      setLastCompletedOrder(newOrder);
      setCheckoutAttemptId(null);
      setIsPaymentModalOpen(false);
      setIsReceiptModalOpen(true);
      await refreshAllData();
    } catch (e) {
      console.error(e);
      alert('The online sale could not be completed. No completed sale was reported.');
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
  const handleConfirmImport = async (batch: ProductImportBatch, rows: CanonicalProductImportRow[]) => {
    if (!vendor || !activeStaff) return;
    try {
      await logBIEvent(vendor.id, 'PRODUCT_IMPORT_STARTED', `Product import ${batch.batchId} started`, { batchId: batch.batchId, outcome: 'started' }, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role });
      for (const row of rows) {
        const existing = row.duplicateProduct;
        if (row.decision === 'USE_EXISTING' && !existing) throw new Error(`Import row ${row.rowNumber} has no existing product mapping.`);
        const product = row.decision === 'USE_EXISTING'
          ? existing!
          : await saveProduct(vendor.id, { ...toProductMaster(row), id: row.decision === 'UPDATE_EXISTING' ? existing?.id : undefined, createdAt: existing?.createdAt }, { actor: { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role }, vendorTaxRate: vendor.taxRate, duplicateDecision: row.decision === 'CONTINUE_SEPARATE' ? { decision: 'CONTINUE_SEPARATE', reason: row.duplicateReason, actorId: activeStaff.id } : undefined });
        await logBIEvent(vendor.id, row.decision === 'USE_EXISTING' ? 'PRODUCT_DUPLICATE_DECISION_RECORDED' : existing ? 'PRODUCT_UPDATED' : 'PRODUCT_CREATED', `${row.decision === 'USE_EXISTING' ? 'Mapped to' : existing ? 'Updated' : 'Created'} ${product.sku}`, { batchId: batch.batchId, productId: product.id, decision: row.decision, outcome: 'completed' }, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role });
        if ((row.quantity || 0) > 0) {
          const location = [...warehouses.map(item => ({ ...item, type: 'warehouse' as const })), ...branches.map(item => ({ ...item, type: 'branch' as const }))].find(item => item.code.toLowerCase() === row.locationCode.toLowerCase());
          if (!location) throw new Error(`Location ${row.locationCode} is no longer available.`);
          await createApprovalRequest(vendor.id, buildOpeningBalanceRequest(batch, row, product, location, { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role }));
          await logBIEvent(vendor.id, 'OPENING_BALANCE_REQUEST_CREATED', `Opening balance requested for ${product.sku}`, { batchId: batch.batchId, productId: product.id, stockLocationId: location.id, outcome: 'pending_approval' }, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role });
        }
      }
      await logBIEvent(vendor.id, 'PRODUCT_IMPORT_COMPLETED', `Product import ${batch.batchId} completed`, { batchId: batch.batchId, outcome: 'completed', rowCount: rows.length }, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role });
      await refreshAllData();
      alert(`Import completed. ${rows.length} product master row(s) saved; opening quantities are pending approval.`);
    } catch (e) {
      console.error('Error during catalog import:', e);
      alert('Failed to complete catalog import.');
    }
  };

  // Sign Out Handler
  const handleSignOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Firebase sign-out failed:', error);
      setAuthSessionError('Sign-out could not be confirmed. Please close this session and try again.');
    } finally {
      setAuthUser(null);
      setVendor(null);
      setActiveStaff(null);
      setIsStaffAuthenticated(false);
    }
  };

  // Compute BI Insights via Analytics Engine
  const biAnalytics = processBIAnalytics(biLogs, products, orders, transfers, supplierReceipts, stockAdjustments);
  const pendingApprovalsCount = approvalRequests.filter(
    request =>
      request.status === 'PENDING_APPROVAL' &&
      request.notificationAudienceRoles.includes(activeStaff?.role || 'cashier'),
  ).length;

  // 1. Resolving restored Firebase session
  if (!authResolved) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-slate-800">Restoring secure session...</p>
        </div>
      </div>
    );
  }

  // 2. Not Authenticated View
  if (!authUser) {
    return (
      <AuthView
        sessionError={authSessionError}
        demoLoginEnabled={demoLoginEnabled}
        onDemoSignIn={identity => {
          if (!demoLoginEnabled) return;
          setAuthSessionError('');
          setAuthUser(identity);
        }}
      />
    );
  }

  // 3. Loading Profile state
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

  // 4. First-time Vendor Onboarding Flow
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

  // 5. Staff Access Form (Prompt after vendor auth)
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

  // 6. Main POS & BI Architecture Dashboard
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col lg:flex-row">
      <OfflineOperationalStateBadge
        terminalSuspended={activeTerminal?.status === 'suspended'}
      />
      
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

        {['warehouse', 'transfers', 'products', 'stock_matrix', 'managed_stocktake', 'purchase_orders'].includes(activeTab) && (
          <section className="mb-5 border border-orange-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between"><div><b className="text-sm">Inventory Control Center</b><p className="text-[11px] text-slate-500">New purchasing, stocktake, average-cost and regional BI tools</p></div><span className="bg-[#FF6600] px-2 py-1 text-[10px] font-black text-white">UPDATED</span></div>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <button onClick={() => setActiveTab('products')} className="border px-3 py-2">Product Catalog & Average Cost</button>
              <button onClick={() => setActiveTab('stock_matrix')} className="border px-3 py-2">Stock by Cost Center</button>
              <button onClick={() => setActiveTab('managed_stocktake')} className="border px-3 py-2">Managed Stocktake</button>
              <button onClick={() => setActiveTab('purchase_orders')} className="bg-[#FF6600] px-3 py-2 text-white">Purchase Orders · New</button>
              {activeStaff.grantedMenuIds.includes('approvals') && <button onClick={() => setActiveTab('approvals')} className="border px-3 py-2">Management Approvals ({pendingApprovalsCount})</button>}
              {activeStaff.grantedMenuIds.includes('bi_audit') && <button onClick={() => setActiveTab('bi_audit')} className="border border-slate-800 bg-slate-800 px-3 py-2 text-white">Inventory & Regional BI</button>}
            </div>
          </section>
        )}
        
        {/* Desk View */}
        {activeTab === 'desk' && (
          <><StockActionDesk vendorId={vendor.id} staff={activeStaff} staffList={staffList} products={products} warehouses={warehouses} branches={branches} warehouseStock={warehouseStock} branchStock={branchStock} onNavigate={(tab) => setActiveTab(tab as AppMenuId)} onLogBIEvent={(eventType, details) => logBIEvent(vendor.id, eventType, eventType.replaceAll('_', ' ').toLowerCase(), details, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role })} /><StaffDesk
            staff={activeStaff}
            activeBranch={activeBranch}
            activeTerminal={activeTerminal}
            pendingApprovalsCount={pendingApprovalsCount}
            onNavigate={(tab) => setActiveTab(tab)}
          /></>
        )}

        {activeTab === 'customers' && activeStaff.grantedMenuIds.includes('customers') && (
          <CustomerManagement
            vendorId={vendor.id}
            customers={customers}
            creditSales={creditSales}
            creditPayments={creditPayments}
            collectionActivities={collectionActivities}
            loading={customerLoading}
            error={customerError}
            onSaveCustomer={handleSaveCustomer}
            onRefresh={() => loadCustomerData(vendor.id)}
          />
        )}

        {/* POS Register */}
        {activeTab === 'pos' && (!activeStaff.grantedMenuIds || activeStaff.grantedMenuIds.length === 0 || activeStaff.grantedMenuIds.includes('pos')) && (
          <POSTerminal
            products={products.filter(product => product.status !== 'archived')}
            branchStock={branchStock}
            vendor={vendor}
            activeBranch={activeBranch}
            activeTerminal={activeTerminal}
            activeStaff={activeStaff}
            activeShift={activeShift}
            onOpenPaymentModal={(cart, totals) => {
              setActiveCart(cart);
              setCartTotals(totals);
              setCheckoutAttemptId(`ord_${crypto.randomUUID()}`);
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
            products={products.filter(product => product.status !== 'archived')}
            warehouseStock={warehouseStock}
            supplierReceipts={supplierReceipts}
            transfers={transfers}
            vendor={vendor}
            activeStaff={activeStaff}
            onOpenAddWarehouseModal={() => setIsAddWarehouseModalOpen(true)}
            onOpenSupplierReceiveModal={() => setIsSupplierModalOpen(true)}
            onOpenTransferModal={() => setIsTransferModalOpen(true)}
            onTransferSlipAction={handleTransferSlipAction}
            onTransferUpdated={refreshAllData}
          />
        )}

        {/* Stock Transfers */}
        {activeTab === 'transfers' && activeStaff.grantedMenuIds.includes('transfers') && (
          <WarehouseManagement
            warehouses={warehouses}
            products={products.filter(product => product.status !== 'archived')}
            warehouseStock={warehouseStock}
            supplierReceipts={supplierReceipts}
            transfers={transfers}
            vendor={vendor}
            activeStaff={activeStaff}
            onOpenAddWarehouseModal={() => setIsAddWarehouseModalOpen(true)}
            onOpenSupplierReceiveModal={() => setIsSupplierModalOpen(true)}
            onOpenTransferModal={() => setIsTransferModalOpen(true)}
            onTransferSlipAction={handleTransferSlipAction}
            onTransferUpdated={refreshAllData}
          />
        )}

        {/* Branches & Terminals */}
        {activeTab === 'branches' && activeStaff.grantedMenuIds.includes('branches') && (
          <BranchManagement
            branches={branches}
            terminals={terminals}
            products={products.filter(product => product.status !== 'archived')}
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
            businessName={vendor.businessName}
            approvalRequests={approvalRequests}
            inventoryCosts={inventoryCosts}
            onOpenAddProductModal={() => {
              setProductToEdit(null);
              setIsProductModalOpen(true);
            }}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onEditProduct={(p) => {
              setProductToEdit(p);
              setIsProductModalOpen(true);
            }}
            onStockLocationChange={async (type, id) => {
              if (type === 'warehouse') setWarehouseStock(await fetchWarehouseStock(vendor.id, id));
              else setBranchStock(await fetchBranchStock(vendor.id, id));
            }}
            onArchiveProduct={async product => {
              if (!activeStaff) return;
              const usage = await inspectProductUsage(vendor.id, product.id);
              const stock = usage.stockByLocation.map(item => `${item.locationName}: ${item.quantity}`).join('\n') || 'No stock';
              const outcome = usage.stockByLocation.some(item => item.quantity !== 0) || usage.references.length ? 'Archive' : 'Delete';
              if (!confirm(`${outcome} ${product.sku} · ${product.name}?\n\nStock by location:\n${stock}\n\nHistory: ${usage.references.join(', ') || 'None'}`)) return;
              await archiveOrDeleteProduct(vendor.id, product, { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role }); await refreshAllData();
            }}
            onArchiveProducts={async selectedProducts => {
              if (!activeStaff || !selectedProducts.length) return;
              const preview = selectedProducts.slice(0, 8).map(product => `${product.sku} · ${product.name}`).join('\n');
              const remaining = selectedProducts.length > 8 ? `\n…and ${selectedProducts.length - 8} more` : '';
              if (!confirm(`Delete ${selectedProducts.length} selected product${selectedProducts.length === 1 ? '' : 's'}?\n\n${preview}${remaining}\n\nUnused products will be deleted permanently. Products with stock or transaction history will be archived to preserve audit records.`)) return;
              const actor = { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role };
              try {
                // Keep bulk removal responsive without overwhelming Firestore.
                for (let index = 0; index < selectedProducts.length; index += 4) {
                  await Promise.all(selectedProducts.slice(index, index + 4).map(product => archiveOrDeleteProduct(vendor.id, product, actor)));
                }
              } finally {
                await refreshAllData();
              }
            }}
            onRestoreProduct={async product => { if (!activeStaff || !confirm(`Restore ${product.sku} · ${product.name}?`)) return; await restoreProduct(vendor.id, product, { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role }); await refreshAllData(); }}
            onTemplateExport={format => logBIEvent(vendor.id, 'PRODUCT_IMPORT_TEMPLATE_EXPORTED', `Product import ${format} template exported`, { outcome: 'completed', format }, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role })}
            onSubmitStocktakeApproval={handleSubmitStocktakeApproval}
            onNavigateToApprovals={() => setActiveTab('approvals')}
            onLogBIEvent={(eventType, details) => logBIEvent(vendor.id, eventType, eventType.replaceAll('_', ' ').toLowerCase(), details, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role })}
          />
        )}

        {activeTab === 'stock_matrix' && (activeStaff.grantedMenuIds.includes('stock_matrix') || activeStaff.grantedMenuIds.includes('products')) && (
          <StockCostCenterMatrix
            vendorId={vendor.id}
            products={products}
            warehouses={warehouses}
            branches={branches}
          />
        )}

        {activeTab === 'managed_stocktake' && (activeStaff.grantedMenuIds.includes('managed_stocktake') || activeStaff.grantedMenuIds.includes('products')) && (
          <ManagedStocktakeWorkspace
            vendorId={vendor.id}
            businessName={vendor.businessName}
            currency={vendor.currency}
            products={products}
            warehouses={warehouses}
            branches={branches}
            activeStaff={activeStaff}
            onSubmit={handleSubmitStocktakeApproval}
            onNavigateToApprovals={() => setActiveTab('approvals')}
            onLogBIEvent={(eventType, details) => logBIEvent(vendor.id, eventType, eventType.replaceAll('_', ' ').toLowerCase(), details, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role })}
          />
        )}

        {activeTab === 'purchase_orders' && (activeStaff.grantedMenuIds.includes('purchase_orders') || activeStaff.grantedMenuIds.includes('products')) && (
          <PurchaseOrderWorkspace vendorId={vendor.id} businessName={vendor.businessName} currency={vendor.currency || '$'} products={products} warehouses={warehouses} activeStaff={activeStaff} onChanged={refreshAllData} />
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
        {activeTab === 'financial' && activeStaff.grantedMenuIds.includes('financial') && (
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
            inventoryCosts={inventoryCosts}
            orders={orders}
          />
        )}

        {/* Delivery Services Workspace */}
        {activeTab === 'delivery' && activeStaff.grantedMenuIds.includes('delivery') && (
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
        products={products.filter(product => product.status !== 'archived')}
        warehouseStock={warehouseStock}
        activeStaff={activeStaff}
        onSuccess={refreshAllData}
      />

      <AddWarehouseModal
        isOpen={isAddWarehouseModalOpen}
        onClose={() => setIsAddWarehouseModalOpen(false)}
        vendorId={vendor.id}
        onSuccess={refreshAllData}
      />

      <TransferStockModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        vendorId={vendor.id}
        warehouses={warehouses}
        branches={branches}
        products={products.filter(product => product.status !== 'archived')}
        warehouseStock={warehouseStock}
        activeStaff={activeStaff}
        onSuccess={refreshAllData}
      />

      <StockAdjustmentModal
        isOpen={isStockAdjustmentModalOpen}
        onClose={() => setIsStockAdjustmentModalOpen(false)}
        vendorId={vendor.id}
        branches={branches}
        activeBranchId={activeBranch?.id}
        products={products.filter(product => product.status !== 'archived')}
        branchStock={branchStock}
        averageCost={productToEdit ? inventoryCosts[productToEdit.id]?.averageUnitCost : undefined}
        activeStaff={activeStaff}
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
        vendorTaxRate={vendor.taxRate}
        vendorDefaultSector={vendor.businessSector}
        productToEdit={productToEdit}
        products={products}
        warehouses={warehouses}
        branches={branches}
        activeStaff={activeStaff}
        warehouseStock={warehouseStock}
        branchStock={branchStock}
        onSuccess={refreshAllData}
        onUseExistingProduct={product => setProductToEdit(product)}
        onOpenStockAdjustment={() => setIsStockAdjustmentModalOpen(true)}
        onOpeningBalanceRequest={async (product, quantity, location, idempotencyKey) => {
          await createApprovalRequest(vendor.id, {
            entityType: 'OPENING_BALANCE_ADJUSTMENT', entityId: `opening_${product.id}_${location.id}`, idempotencyKey,
            title: `Opening balance for ${product.sku}`, description: `Controlled opening quantity from new Product Details for ${product.name}.`,
            requester: { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role },
            branchId: location.type === 'branch' ? location.id : undefined, branchName: location.type === 'branch' ? location.name : undefined,
            warehouseId: location.type === 'warehouse' ? location.id : undefined, warehouseName: location.type === 'warehouse' ? location.name : undefined,
            dataPayload: { locationType: location.type, locationId: location.id, locationName: location.name, reason: 'NEW_PRODUCT_OPENING_BALANCE', idempotencyKey, items: [{ productId: product.id, productName: product.name, sku: product.sku, quantity, quantityDelta: quantity, unitOfMeasure: product.unitOfMeasure, reason: 'Opening balance from approved new product setup' }] },
          });
          await logBIEvent(vendor.id, 'OPENING_BALANCE_REQUEST_CREATED', `Opening balance requested for ${product.sku}`, { productId: product.id, stockLocationId: location.id, outcome: 'pending_approval', correlationId: idempotencyKey }, { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role });
        }}
      />

      <ProductImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        vendor={vendor}
        existingProducts={products}
        locations={[...warehouses.map(item => ({ id: item.id, code: item.code, name: item.name, type: 'warehouse' as const })), ...branches.map(item => ({ id: item.id, code: item.code, name: item.name, type: 'branch' as const }))]}
        onConfirmImport={handleConfirmImport}
        onImportEvent={(type, details) => logBIEvent(vendor.id, type, type.replaceAll('_', ' ').toLowerCase(), details, activeStaff ? { staffId: activeStaff.id, staffName: activeStaff.name, staffRole: activeStaff.role } : undefined)}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setCheckoutAttemptId(null);
        }}
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
