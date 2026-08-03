import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BIEvent, BIEventType } from './types';

const BI_LOCAL_STORAGE_KEY = 'itred_pos_bi_logs_';

/**
 * Calculates risk score for BI events to aid future AI decision processes.
 */
function calculateRiskScore(eventType: BIEventType, details: Record<string, any>): number {
  switch (eventType) {
    case 'PRODUCT_COST_BELOW_AVERAGE_ESCALATED':
      return 85;
    case 'PRODUCT_PRICE_CHANGED':
      return details.newCost < details.previousCost ? 65 : 35;
    case 'STOCK_ADJUSTMENT':
      if (details.type === 'damage' || Math.abs(details.netDelta || 0) > 50) return 75;
      return 40;
    case 'APPROVAL_REQUESTED':
      return 60;
    case 'PERMISSIONS_GRANTED':
      return 80;
    case 'APPROVAL_DECISION':
      return details.status === 'rejected' ? 65 : 20;
    case 'SUPPLY_RECEIPT':
      return details.totalAmount > 1000 ? 50 : 15;
    case 'POS_TRANSACTION':
      return details.discountAmount > 20 ? 45 : 10;
    default:
      return 5;
  }
}

/**
 * Log a Business Intelligence Event into the background BI Layer.
 * Note: Mouse movements, scrolling, and DOM noise are strictly excluded by design.
 */
export async function logBIEvent(
  vendorId: string,
  eventType: BIEventType,
  actionSummary: string,
  details: Record<string, any>,
  actor?: { staffId?: string; staffName?: string; staffRole?: string; branchId?: string; branchName?: string; terminalId?: string; terminalName?: string }
): Promise<BIEvent> {
  const now = new Date().toISOString();
  const id = `bi_${Math.random().toString(36).substring(2, 10)}`;
  const riskScore = calculateRiskScore(eventType, details);
  const isAnomaly = riskScore >= 70;

  const event: BIEvent = {
    id,
    vendorId,
    eventType,
    actionSummary,
    staffId: actor?.staffId || 'system',
    staffName: actor?.staffName || 'System Admin',
    staffRole: actor?.staffRole || 'sysadmin',
    branchId: actor?.branchId,
    branchName: actor?.branchName,
    terminalId: actor?.terminalId,
    terminalName: actor?.terminalName,
    details,
    riskScore,
    isAnomaly,
    timestamp: now,
  };

  // 1. Write to local cache immediately for snappy responsiveness
  try {
    const raw = localStorage.getItem(`${BI_LOCAL_STORAGE_KEY}_${vendorId}`);
    const logs: BIEvent[] = raw ? JSON.parse(raw) : [];
    const updatedLogs = [event, ...logs].slice(0, 500); // keep last 500 logs
    localStorage.setItem(`${BI_LOCAL_STORAGE_KEY}_${vendorId}`, JSON.stringify(updatedLogs));
  } catch (err) {
    console.warn('BI Local Storage write error:', err);
  }

  // 2. Persist to Firestore background collection
  try {
    const cleanEvent = JSON.parse(JSON.stringify(event));
    await setDoc(doc(db, 'vendors', vendorId, 'bi_logs', id), cleanEvent);
  } catch (err) {
    console.warn('Firestore BI log write notice:', err);
  }

  return event;
}

/**
 * Fetch BI Event Logs for decision audits and analytics
 */
export async function fetchBILogs(vendorId: string): Promise<BIEvent[]> {
  try {
    const colRef = collection(db, 'vendors', vendorId, 'bi_logs');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const logs = snap.docs.map(d => d.data() as BIEvent);
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return logs;
    }
  } catch (e) {
    console.warn('Firestore fetch BI logs notice:', e);
  }

  const raw = localStorage.getItem(`${BI_LOCAL_STORAGE_KEY}_${vendorId}`);
  return raw ? JSON.parse(raw) : [];
}
