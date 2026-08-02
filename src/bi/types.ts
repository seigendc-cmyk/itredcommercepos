export type BIEventType = 
  | 'AUTH_LOGIN'
  | 'ONBOARDING_COMPLETED'
  | 'POS_TRANSACTION'
  | 'SUPPLY_RECEIPT'
  | 'STOCK_TRANSFER'
  | 'STOCK_ADJUSTMENT'
  | 'PRODUCT_MUTATION'
  | 'PRODUCT_BULK_IMPORT'
  | 'PRODUCT_IMPORT_TEMPLATE_EXPORTED'
  | 'PRODUCT_IMPORT_STARTED'
  | 'PRODUCT_IMPORT_REJECTED'
  | 'PRODUCT_IMPORT_VALIDATED'
  | 'PRODUCT_IMPORT_COMPLETED'
  | 'PRODUCT_IMPORT_ROW_REJECTED'
  | 'PRODUCT_DUPLICATE_DETECTED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_ARCHIVED'
  | 'PRODUCT_RESTORED'
  | 'PRODUCT_DELETED'
  | 'OPENING_BALANCE_REQUEST_CREATED'
  | 'STOCKTAKE_MAPPING_VALIDATION_FAILED'
  | 'STOCKTAKE_WORKING_DAY_SELECTED'
  | 'STOCKTAKE_COUNT_LIST_LOADED'
  | 'STOCKTAKE_COUNT_LIST_EMPTY'
  | 'STOCKTAKE_DRAFT_SAVED'
  | 'STOCKTAKE_COUNT_LIST_PDF_GENERATED'
  | 'STOCKTAKE_COUNT_LIST_XLSX_EXPORTED'
  | 'STOCKTAKE_COUNT_LIST_CSV_EXPORTED'
  | 'STOCKTAKE_SUBMITTED_FOR_APPROVAL'
  | 'STOCKTAKE_EXPORT_DENIED'
  | 'STOCKTAKE_DAY_CHANGED_WITH_UNSAVED_COUNTS'
  | 'STAFF_CREATED'
  | 'STAFF_MUTATED'
  | 'PERMISSIONS_GRANTED'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_DECISION'
  | 'SHIFT_OPENED'
  | 'SHIFT_CLOSED'
  | 'SETTINGS_UPDATE_PROFILE'
  | 'SETTINGS_UPDATE_HARDWARE'
  | 'SETTINGS_CREATE_ROLE'
  | 'SETTINGS_MUTATED'
  | 'INVOICE_AUTO_GENERATED'
  | 'INVOICE_CREATED'
  | 'INVOICE_PAID'
  | 'COA_ACCOUNT_SAVED'
  | 'CHECK_ISSUED'
  | 'CHECK_STATUS_UPDATED'
  | 'CUSTOMER_CREATED'
  | 'CUSTOMER_UPDATED'
  | 'CREDIT_SALE_CREATED'
  | 'CREDIT_PAYMENT_RECORDED'
  | 'COLLECTION_ACTIVITY_LOGGED'
  | 'ENTITLEMENT_CHECKED'
  | 'RESOURCE_ACTIVATION_APPROVED'
  | 'RESOURCE_ACTIVATION_BLOCKED'
  | 'RESOURCE_SUSPENDED'
  | 'RESOURCE_ARCHIVED'
  | 'INVENTORY_WORKFLOW_TRANSITION'
  | 'TRANSFER_SLIP_PREVIEWED'
  | 'TRANSFER_SLIP_PRINTED'
  | 'TRANSFER_SLIP_EXPORTED';

export interface BIEvent {
  id: string;
  vendorId: string;
  eventType: BIEventType;
  actionSummary: string;
  staffId?: string;
  staffName?: string;
  staffRole?: string;
  branchId?: string;
  branchName?: string;
  terminalId?: string;
  terminalName?: string;
  details: Record<string, any>;
  riskScore: number; // 0 to 100
  isAnomaly: boolean;
  timestamp: string;
}

export interface BIAggregates {
  totalEventsLogged: number;
  totalTransactionVolume: number;
  totalOrdersProcessed: number;
  criticalAdjustmentsCount: number;
  approvalsProcessedCount: number;
  anomalyCount: number;
  lastEventTimestamp?: string;
}

export interface BIInsight {
  id: string;
  category: 'inventory_forecast' | 'fraud_alert' | 'staff_productivity' | 'sales_velocity';
  title: string;
  description: string;
  recommendation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidenceScore: number; // e.g. 0.85 (85%)
  generatedAt: string;
}
