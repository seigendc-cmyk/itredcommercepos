export type BIEventType = 
  | 'AUTH_LOGIN'
  | 'ONBOARDING_COMPLETED'
  | 'POS_TRANSACTION'
  | 'SUPPLY_RECEIPT'
  | 'STOCK_TRANSFER'
  | 'STOCK_ADJUSTMENT'
  | 'PRODUCT_MUTATION'
  | 'PRODUCT_BULK_IMPORT'
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
  | 'COLLECTION_ACTIVITY_LOGGED';

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
