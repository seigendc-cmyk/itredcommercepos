export type SubscriptionPlanType = 'starter_free' | 'pro_delivery' | 'enterprise_fleet';
export type ResourceType = 'warehouse' | 'branch' | 'terminal';
export type ResourceLicenseStatus = 'licensed' | 'unlicensed';
export type ResourceLifecycleStatus = 'active' | 'suspended' | 'archived';

export interface ResourceAddonEntitlement {
  id: string;
  resourceType: ResourceType;
  quantity: number;
  status: 'active' | 'suspended' | 'expired';
  startDate: string;
  expiryDate?: string;
}

export interface VendorProfile {
  id: string;
  email: string;
  businessName: string;
  address: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
  currency: string;
  taxRate: number; // percentage, e.g., 10 for 10%
  onboardingCompleted: boolean;
  vatNumber?: string;
  businessRegNumber?: string;
  businessSector?: string;
  receiptHeaderNotice?: string;
  receiptFooterText?: string;
  taxIdentificationName?: string;
  subscriptionPlan?: SubscriptionPlanType;
}

export type VehicleType = 'biker' | 'car' | 'van';

export interface DeliveryCourier {
  id: string;
  vendorId: string;
  name: string;
  phone: string;
  vehicleType: VehicleType;
  vehiclePlate: string;
  defaultDeliveryFee: number;
  status: 'available' | 'on_delivery' | 'offline';
  assignedBranchId?: string;
  assignedBranchName?: string;
  createdAt: string;
}

export interface DeliveryDispatchMessage {
  id: string;
  vendorId: string;
  orderId: string;
  orderNumber: string;
  courierId: string;
  courierName: string;
  courierPhone: string;
  vehicleType: VehicleType;
  vehiclePlate: string;
  branchName: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryFee: number;
  orderTotal: number;
  status: 'dispatched' | 'collected' | 'in_transit' | 'delivered';
  createdAt: string;
}

export interface HardwareSettings {
  printerType: 'thermal_80mm' | 'thermal_58mm' | 'standard_a4' | 'pdf_only';
  printerName?: string;
  autoPrintReceipt: boolean;
  barcodeScannerMode: 'usb_hid' | 'camera_scan' | 'serial_com' | 'manual_only';
  cashDrawerAutoKick: boolean;
  cashDrawerKickPin: 'pin_2' | 'pin_5';
  customerPoleDisplay: boolean;
  customerPoleMessage?: string;
  msrCardReaderEnabled: boolean;
  scaleIntegration: boolean;
}

export interface CustomRoleDefinition {
  roleKey: string;
  roleName: string;
  description: string;
  defaultGrantedMenuIds: AppMenuId[];
  canApproveTransactions: boolean;
  isSystemRole?: boolean;
}

export interface Warehouse {
  id: string;
  vendorId: string;
  name: string;
  code: string;
  location: string;
  isDefault: boolean;
  licenseStatus?: ResourceLicenseStatus;
  status?: ResourceLifecycleStatus;
  createdAt: string;
}

export interface Branch {
  id: string;
  vendorId: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  isDefault: boolean;
  licenseStatus?: ResourceLicenseStatus;
  status?: ResourceLifecycleStatus;
  createdAt: string;
}

export interface Terminal {
  id: string;
  vendorId: string;
  branchId: string;
  name: string;
  code: string;
  isDefault: boolean;
  licenseStatus?: ResourceLicenseStatus;
  status: ResourceLifecycleStatus | 'inactive';
  createdAt: string;
}

export interface Product {
  id: string;
  vendorId: string;
  sku: string;
  name: string;
  category: string;
  description?: string;
  costPrice: number;
  sellingPrice: number;
  barcode?: string;
  brand?: string;
  manufacturerCode?: string;
  unit: string;
  reorderLevel: number;
  location?: string;
  shelf?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  vendorId: string;
  name: string;
  code?: string;
  status?: 'active' | 'suspended' | 'archived';
  createdAt?: string;
}

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'PARTIALLY_RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface PurchaseOrderItem {
  productId: string;
  productName: string;
  sku?: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  unitOfMeasure?: string;
  batchNumber?: string;
}

export interface PurchaseOrder {
  id: string;
  vendorId: string;
  supplierId: string;
  supplierName: string;
  orderNumber: string;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface ProductLedgerEntry {
  id: string;
  productId: string;
  movementType: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  sourceDocumentReference: string;
  createdAt: string;
}

export interface WarehouseInventory {
  id: string; // vendorId_warehouseId_productId
  vendorId: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  lastUpdated: string;
}

export interface BranchInventory {
  id: string; // vendorId_branchId_productId
  vendorId: string;
  branchId: string;
  productId: string;
  quantity: number;
  lastUpdated: string;
}

export interface SupplierReceipt {
  id: string;
  vendorId: string;
  warehouseId: string;
  supplierName: string;
  referenceNo: string; // PO or Invoice number
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  date: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    sku?: string;
    orderedQuantity?: number;
    previouslyReceivedQuantity?: number;
    unitOfMeasure?: string;
    batchNumber?: string;
  }[];
  totalAmount: number;
  notes?: string;
  createdBy: string;
  status?: InventoryWorkflowStatus;
  createdAt: string;
}

export type InventoryWorkflowStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'PROCESSING'
  | 'IN_TRANSIT'
  | 'PARTIALLY_RECEIVED'
  | 'COMPLETED'
  | 'FAILED';

export interface StockTransfer {
  id: string;
  vendorId: string;
  transferNo: string;
  sourceWarehouseId: string;
  sourceWarehouseName: string;
  sourceBranchId?: string;
  sourceBranchName?: string;
  targetBranchId: string;
  targetBranchName: string;
  date: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    quantityRequested?: number;
    quantityApproved?: number;
    quantityDispatched?: number;
    sku?: string;
    quantityReceived?: number;
    unitOfMeasure?: string;
    batchNumber?: string;
    serialNumber?: string;
    expiryDate?: string;
  }[];
  status: InventoryWorkflowStatus | 'completed' | 'pending' | 'cancelled';
  notes?: string;
  requestedAt?: string;
  approvedAt?: string;
  dispatchedAt?: string;
  expectedReceiptAt?: string;
  requester?: WorkflowActor;
  approver?: WorkflowActor;
  dispatcher?: WorkflowActor;
  receivingOfficer?: WorkflowActor;
  barcodeReference?: string;
  version?: number;
  createdAt: string;
}

export interface StockAdjustment {
  id: string;
  vendorId: string;
  branchId: string;
  branchName: string;
  type: 'opening_balance' | 'recount' | 'damage' | 'return' | 'other';
  date: string;
  items: {
    productId: string;
    productName: string;
    quantityDelta: number; // positive for addition (e.g. opening balance), negative for reduction
    unitCost?: number;
    reason?: string;
  }[];
  notes?: string;
  status?: InventoryWorkflowStatus;
  createdAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number; // amount
  subtotal: number;
}

export interface Order {
  id: string;
  vendorId: string;
  branchId: string;
  branchName: string;
  terminalId: string;
  terminalName: string;
  orderNumber: string;
  items: CartItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: 'cash' | 'card' | 'mobile_money' | 'split';
  paymentDetails?: {
    cashGiven?: number;
    changeDue?: number;
    cardRef?: number | string;
    mobileProvider?: string;
    mobileRef?: string;
  };
  customerName?: string;
  customerPhone?: string;
  deliveryDetails?: {
    courierId: string;
    courierName: string;
    courierPhone: string;
    vehicleType: VehicleType;
    vehiclePlate: string;
    deliveryFee: number;
    deliveryAddress: string;
    dispatchStatus: 'dispatched' | 'collected' | 'in_transit' | 'delivered';
  };
  status: 'completed' | 'refunded';
  createdAt: string;
}

export interface TerminalShift {
  id: string;
  vendorId: string;
  branchId: string;
  branchName?: string;
  terminalId: string;
  terminalName?: string;
  staffId: string;
  staffName: string;
  openedAt: string;
  closedAt?: string;
  openingCash: number;
  closingCash?: number;
  expectedCash?: number;
  cashDiscrepancy?: number;
  totalSales: number;
  cashSales: number;
  cardSales: number;
  mobileSales: number;
  transactionCount: number;
  openingNotes?: string;
  closingNotes?: string;
  status: 'open' | 'closed';
}

export type StaffRole = 'sysadmin' | 'manager' | 'cashier' | 'warehouse_staff';

export type AppMenuId = 
  | 'desk'
  | 'pos' 
  | 'delivery'
  | 'warehouse' 
  | 'transfers' 
  | 'branches' 
  | 'products' 
  | 'financial'
  | 'customers'
  | 'reports' 
  | 'approvals' 
  | 'staff' 
  | 'bi_audit'
  | 'settings'
  | 'billing';

export interface BillingPlan {
  id: string;
  name: string;
  priceMonthly: number;
  billingPeriodMonths: number; // e.g., 1 for 1 month, 3 for 3 months, 12 for 1 year
  currency: string;
  description: string;
  features: string[];
  maxWarehouses?: number;
  maxBranches: number;
  maxTerminals?: number;
  maxStaff: number;
  isPopular?: boolean;
  status: 'active' | 'archived';
  createdAt: string;
}

export interface BillingServiceAddon {
  id: string;
  title: string;
  category: 'stocktake' | 'consultancy' | 'hardware' | 'support' | 'custom';
  description: string;
  price: number;
  priceType: 'one_time' | 'monthly';
  deliverables: string[];
}

export interface VendorSubscription {
  id: string;
  vendorId: string;
  planId: string;
  planName: string;
  priceMonthly: number;
  billingPeriodMonths: number;
  startDate: string;
  expiryDate: string; // ISO date string
  autoRenew: boolean;
  status: 'active' | 'expiring_soon' | 'expired';
  resourceAddons?: ResourceAddonEntitlement[];
  lastInvoiceId?: string;
  autoInvoiceGeneratedForPeriod?: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  category: 'plan_renewal' | 'service_addon' | 'consultancy' | 'stocktake' | 'custom';
  unitPrice: number;
  quantity: number;
  amount: number;
}

export interface VendorInvoice {
  id: string;
  vendorId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  currency: string;
  status: 'paid' | 'unpaid_due' | 'overdue' | 'canceled';
  paymentMethod?: 'credit_card' | 'mobile_money' | 'bank_transfer' | 'cash';
  paidAt?: string;
  notes?: string;
  is7DayAutoGenerated?: boolean;
  createdAt: string;
}

export interface AppMenuDefinition {
  id: AppMenuId;
  label: string;
  description: string;
  category: 'operations' | 'inventory' | 'management' | 'governance';
}

export interface StaffMember {
  id: string;
  vendorId: string;
  name: string;
  email: string;
  phone?: string;
  role: StaffRole;
  assignedBranchId?: string;
  assignedBranchName?: string;
  grantedMenuIds: AppMenuId[];
  status: 'active' | 'suspended';
  pinCode?: string;
  createdAt: string;
  lastActiveAt?: string;
  menuGrantSchemaVersion?: number;
}

export type ApprovalRequestType =
  | 'stock_adjustment' 
  | 'supplier_intake' 
  | 'stock_transfer' 
  | 'purchase_order_cancellation'
  | 'large_discount' 
  | 'order_refund';

export type CriticalInventoryEntityType =
  | 'WAREHOUSE_TO_BRANCH_TRANSFER'
  | 'BRANCH_TO_BRANCH_TRANSFER'
  | 'SUPPLIER_STOCK_RECEIPT'
  | 'PURCHASE_ORDER_CANCELLATION'
  | 'OPENING_BALANCE_ADJUSTMENT'
  | 'STOCKTAKE_ADJUSTMENT';

export interface WorkflowActor {
  id: string;
  name: string;
  role: StaffRole;
}

export interface ApprovalInventoryItem {
  productId: string;
  productName: string;
  sku?: string;
  quantity?: number;
  quantityReceived?: number;
  unitOfMeasure?: string;
  batchNumber?: string;
  serialNumber?: string;
  expiryDate?: string;
  orderedQuantity?: number;
  previouslyReceivedQuantity?: number;
  quantityDelta?: number;
  unitCost?: number;
  reason?: string;
  systemQty?: number;
  countedQty?: number;
}

export interface ApprovalDataPayload {
  sourceType?: 'warehouse' | 'branch';
  sourceId?: string;
  sourceName?: string;
  targetBranchId?: string;
  targetBranchName?: string;
  locationType?: 'warehouse' | 'branch';
  locationId?: string;
  locationName?: string;
  supplierName?: string;
  referenceNo?: string;
  notes?: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  supplierId?: string;
  overReceiptExceptionRequested?: boolean;
  overReceiptReason?: string;
  items?: ApprovalInventoryItem[];
  [key: string]: unknown;
}

export interface ApprovalQuantityDecision {
  productId: string;
  productName: string;
  locationType: 'warehouse' | 'branch';
  locationId: string;
  beforeQuantity: number;
  quantityDelta: number;
  afterQuantity: number;
}

export interface InventoryApprovalPolicy {
  segregationOfDuties: boolean;
  supplierReceiptAutoApprovalRoles: StaffRole[];
}

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  vendorId: string;
  entityType: CriticalInventoryEntityType;
  entityId: string;
  type: ApprovalRequestType;
  title: string;
  description: string;
  requesterId: string;
  requesterName: string;
  requesterRole: StaffRole;
  requester: WorkflowActor;
  approver?: WorkflowActor;
  branchId?: string;
  branchName?: string;
  warehouseId?: string;
  warehouseName?: string;
  dataPayload: ApprovalDataPayload;
  status: InventoryWorkflowStatus;
  version: number;
  segregationOfDuties: boolean;
  notificationAudienceRoles: StaffRole[];
  requestedAt: string;
  decisionAt?: string;
  outcome?: InventoryWorkflowStatus;
  reason?: string;
  quantityDecisions?: ApprovalQuantityDecision[];
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewComment?: string;
  createdAt: string;
  updatedAt: string;
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface ChartOfAccount {
  id: string;
  vendorId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  category: string;
  balance: number;
  description?: string;
  isDefault?: boolean;
  isCOGSReserve?: boolean;
  isBankOrCash?: boolean;
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    routingNumber?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface IssuedCheck {
  id: string;
  vendorId: string;
  checkNumber: string;
  sourceAccountId: string;
  sourceAccountName: string;
  payeeName: string;
  amount: number;
  amountInWords: string;
  date: string;
  memo: string;
  categoryAccountId?: string;
  categoryAccountName?: string;
  authorizedBy: string;
  status: 'issued' | 'cleared' | 'voided';
  createdAt: string;
}

export interface Customer {
  id: string;
  vendorId: string;
  customerCode: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  creditLimit: number;
  currentBalance: number;
  creditTermsDays: number; // e.g. 15, 30, 60 days net
  riskCategory: 'low' | 'medium' | 'high' | 'blacklisted';
  status: 'active' | 'suspended' | 'closed';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditSaleItem {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface CreditSale {
  id: string;
  vendorId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  saleDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'overdue';
  items: CreditSaleItem[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditPayment {
  id: string;
  vendorId: string;
  creditSaleId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'check' | 'card';
  referenceNo?: string;
  paymentDate: string;
  recordedBy: string;
  notes?: string;
  createdAt: string;
}

export interface CollectionActivity {
  id: string;
  vendorId: string;
  customerId: string;
  customerName: string;
  activityType: 'phone_call' | 'email_reminder' | 'demand_letter' | 'promise_to_pay' | 'site_visit';
  notes: string;
  promisedDate?: string;
  promisedAmount?: number;
  status: 'logged' | 'fulfilled' | 'broken' | 'escalated';
  loggedBy: string;
  createdAt: string;
}
