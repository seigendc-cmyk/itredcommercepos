import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Building,
  Calendar,
  CheckCircle2,
  Download,
  FileCheck,
  FileSpreadsheet,
  Filter,
  Loader2,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  Send,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import { BIEventType } from '../../bi/types';
import { closeStockIncident, hasStockActionPermission, loadTargetedCountSessions, recordStockIncident, reconcileTargetedCount, saveStockIncidents, saveTargetedCountSession, StockActionIncident } from '../../features/stock-assurance';
import {
  buildCycleCountSchedule,
  buildWorkingDayDefinitions,
  clearStocktakeDraft,
  deriveStocktakeDayStatus,
  exportStocktakeSpreadsheet,
  filterStocktakeRows,
  generateStocktakePdf,
  getDefaultWorkingDay,
  hasStocktakePermission,
  loadStocktakeDraft,
  loadStocktakeSettings,
  resolveStocktakeRows,
  saveStocktakeDraft,
  StocktakeCountRow,
  StocktakeDayStatus,
  StocktakeExportContext,
  StocktakeFilters,
  summarizeStocktake,
} from '../../features/stocktake';
import { ApprovalRequest, Branch, Product, StaffMember, Warehouse } from '../../types';

interface StocktakeWorkspaceProps {
  products: Product[];
  warehouses: Warehouse[];
  branches: Branch[];
  warehouseStock: Record<string, number>;
  branchStock: Record<string, number>;
  activeStaff: StaffMember;
  vendorId: string;
  businessName: string;
  approvalRequests?: ApprovalRequest[];
  currency?: string;
  onSubmitStocktakeApproval: (approvalPayload: any) => Promise<void>;
  onNavigateToApprovals?: () => void;
  onStockLocationChange?: (type: 'warehouse' | 'branch', id: string) => Promise<void>;
  onLogBIEvent?: (eventType: BIEventType, details: Record<string, unknown>) => Promise<unknown> | void;
}

type PendingDayChange = { day: number } | null;
type ExportScope = 'COMPLETE' | 'FILTERED';

const STATUS_STYLES: Record<StocktakeDayStatus, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  DRAFT_SAVED: 'bg-blue-100 text-blue-800',
  READY_FOR_REVIEW: 'bg-amber-100 text-amber-900',
  SUBMITTED: 'bg-purple-100 text-purple-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
};

function formatStatus(status: StocktakeDayStatus): string {
  return status.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, value => value.toUpperCase());
}

export const StocktakeWorkspace: React.FC<StocktakeWorkspaceProps> = ({
  products,
  warehouses,
  branches,
  warehouseStock,
  branchStock,
  activeStaff,
  vendorId,
  businessName,
  approvalRequests = [],
  currency = '$',
  onSubmitStocktakeApproval,
  onNavigateToApprovals,
  onStockLocationChange,
  onLogBIEvent,
}) => {
  const initialLocationType: 'warehouse' | 'branch' = warehouses.length ? 'warehouse' : 'branch';
  const [selectedLocationType, setSelectedLocationType] = useState<'warehouse' | 'branch'>(initialLocationType);
  const [selectedLocationId, setSelectedLocationId] = useState(warehouses[0]?.id || branches[0]?.id || '');
  const [activeCycleDay, setActiveCycleDay] = useState(() => getDefaultWorkingDay(buildWorkingDayDefinitions()));
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [varianceReasons, setVarianceReasons] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<StocktakeFilters>({ search: '', department: 'ALL', shelf: 'ALL', biCheck: 'ALL', varianceOnly: false, countState: 'ALL' });
  const [dayStatuses, setDayStatuses] = useState<Record<number, StocktakeDayStatus>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExporting, setIsExporting] = useState<'PDF' | 'XLSX' | 'CSV' | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);
  const [pendingDayChange, setPendingDayChange] = useState<PendingDayChange>(null);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>('COMPLETE');
  const settings = useMemo(() => loadStocktakeSettings(vendorId), [vendorId]);
  const [blindCount, setBlindCount] = useState(settings.blindCountEnabled);
  const [showSystemQuantity, setShowSystemQuantity] = useState(!settings.blindCountEnabled);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeRecount, setIncludeRecount] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`itred_stocktake_deep_link_${vendorId}`);
      if (!raw) return;
      const link = JSON.parse(raw) as { stockLocationId?: string; productName?: string; workingDayNumber?: number };
      const warehouse = warehouses.find(item => item.id === link.stockLocationId);
      const branch = branches.find(item => item.id === link.stockLocationId);
      if (warehouse || branch) {
        setSelectedLocationType(warehouse ? 'warehouse' : 'branch');
        setSelectedLocationId((warehouse || branch)!.id);
      }
      if (link.workingDayNumber && link.workingDayNumber >= 1 && link.workingDayNumber <= 26) setActiveCycleDay(link.workingDayNumber);
      if (link.productName) setFilters(previous => ({ ...previous, search: link.productName || '' }));
    } catch { /* Invalid deep links are ignored without losing the normal workspace. */ }
  }, [branches, vendorId, warehouses]);

  const canView = hasStocktakePermission(activeStaff.role, 'stocktake.view');
  const canPerform = hasStocktakePermission(activeStaff.role, 'stocktake.perform');
  const canDraft = hasStocktakePermission(activeStaff.role, 'stocktake.draft.save');
  const canSubmit = hasStocktakePermission(activeStaff.role, 'stocktake.submit');
  const canPrint = hasStocktakePermission(activeStaff.role, 'stocktake.print');
  const canExport = hasStocktakePermission(activeStaff.role, 'stocktake.export');
  const canViewSystemQuantity = hasStocktakePermission(activeStaff.role, 'stocktake.view_system_quantity');
  const canViewValuation = hasStocktakePermission(activeStaff.role, 'stocktake.view_valuation');

  useEffect(() => {
    if (!selectedLocationId) {
      const fallback = warehouses[0] || branches[0];
      if (fallback) {
        setSelectedLocationType(warehouses[0] ? 'warehouse' : 'branch');
        setSelectedLocationId(fallback.id);
      }
    }
  }, [branches, selectedLocationId, warehouses]);

  const selectedLocation = useMemo(() => selectedLocationType === 'warehouse'
    ? warehouses.find(item => item.id === selectedLocationId)
    : branches.find(item => item.id === selectedLocationId), [branches, selectedLocationId, selectedLocationType, warehouses]);
  const currentLocationName = selectedLocation?.name || 'No stock location selected';
  const currentStock = selectedLocationType === 'warehouse' ? warehouseStock : branchStock;
  const locationAliases = useMemo(() => selectedLocation
    ? [selectedLocation.id, selectedLocation.name, selectedLocation.code]
    : [], [selectedLocation]);
  const schedule = useMemo(() => buildCycleCountSchedule({
    vendorId,
    stockLocationId: selectedLocationId,
    stockLocationAliases: locationAliases,
    products,
  }), [locationAliases, products, selectedLocationId, vendorId]);
  const activeWorkingDay = schedule.workingDays[activeCycleDay - 1];
  const assignedShelves = schedule.shelvesByDay[activeCycleDay] || [];
  const dayRows = useMemo(() => selectedLocationId ? resolveStocktakeRows({
    schedule,
    workingDayNumber: activeCycleDay,
    products,
    stockLocation: { id: selectedLocationId, name: currentLocationName },
    stock: currentStock,
  }) : [], [activeCycleDay, currentLocationName, currentStock, products, schedule, selectedLocationId]);
  const displayedRows = useMemo(() => filterStocktakeRows(dayRows, filters, counts), [counts, dayRows, filters]);
  const summary = useMemo(() => summarizeStocktake(dayRows, counts), [counts, dayRows]);
  const departments = useMemo(() => ['ALL', ...Array.from(new Set(dayRows.map(row => row.category))).sort()], [dayRows]);
  const shelves = useMemo(() => ['ALL', ...Array.from(new Set(dayRows.map(row => row.shelfCode))).sort()], [dayRows]);
  const workflowStatuses = useMemo(() => {
    const statuses: Record<number, StocktakeDayStatus> = {};
    approvalRequests
      .filter(request => request.entityType === 'STOCKTAKE_ADJUSTMENT'
        && request.dataPayload?.cycleId === schedule.cycleId
        && request.dataPayload?.locationId === selectedLocationId)
      .forEach(request => {
        const day = Number(request.dataPayload.stocktakeDay);
        if (!Number.isInteger(day)) return;
        if (request.status === 'COMPLETED') statuses[day] = 'COMPLETED';
        else if (request.status === 'APPROVED') statuses[day] = 'APPROVED';
        else if (request.status === 'REJECTED' || request.status === 'FAILED' || request.status === 'CANCELLED') statuses[day] = 'REJECTED';
        else statuses[day] = 'SUBMITTED';
      });
    return statuses;
  }, [approvalRequests, schedule.cycleId, selectedLocationId]);
  const localDayStatus = dayStatuses[activeCycleDay];
  const currentStatus = workflowStatuses[activeCycleDay] || deriveStocktakeDayStatus({ rowCount: dayRows.length, countedCount: summary.countedCount, draftSaved: localDayStatus === 'DRAFT_SAVED', submitted: localDayStatus === 'SUBMITTED', rejected: localDayStatus === 'REJECTED' });
  const isLocked = ['SUBMITTED', 'APPROVED', 'COMPLETED'].includes(currentStatus);
  const correlationId = `${schedule.cycleId}:${activeCycleDay}:${selectedLocationId}`;

  const eventDetails = (extra: Record<string, unknown> = {}) => ({
    tenantId: vendorId,
    vendorId,
    actorId: activeStaff.id,
    cycleId: schedule.cycleId,
    workingDayNumber: activeCycleDay,
    stockLocationId: selectedLocationId,
    shelfIds: assignedShelves,
    productCount: dayRows.length,
    countStatus: currentStatus,
    correlationId,
    timestamp: new Date().toISOString(),
    ...extra,
  });

  useEffect(() => {
    if (!canView || !selectedLocationId) return;
    const draft = loadStocktakeDraft(vendorId, schedule.cycleId, selectedLocationId, activeCycleDay, activeStaff.role);
    setCounts(draft?.counts || {});
    setVarianceReasons(draft?.reasons || {});
    setIsDirty(false);
    if (draft) setDayStatuses(previous => ({ ...previous, [activeCycleDay]: 'DRAFT_SAVED' }));
  }, [activeCycleDay, activeStaff.role, canView, schedule.cycleId, selectedLocationId, vendorId]);

  useEffect(() => {
    if (!canView || !selectedLocationId) return;
    const eventType: BIEventType = dayRows.length ? 'STOCKTAKE_COUNT_LIST_LOADED' : 'STOCKTAKE_COUNT_LIST_EMPTY';
    void onLogBIEvent?.(eventType, eventDetails({ outcome: dayRows.length ? 'loaded' : 'empty' }));
  // Log once for each authoritative selected-day scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCycleDay, schedule.cycleId, selectedLocationId, dayRows.length]);

  useEffect(() => {
    if (!selectedLocation || !dayRows.length || !activeWorkingDay?.scheduledDate || !hasStockActionPermission(activeStaff.role, 'stock.notifications.receive')) return;
    if (activeWorkingDay.scheduledDate >= new Date().toISOString().slice(0, 10) || ['SUBMITTED', 'APPROVED', 'COMPLETED'].includes(currentStatus)) return;
    const now = new Date().toISOString();
    dayRows.forEach(row => {
      const result = recordStockIncident(vendorId, {
        tenantId: vendorId, vendorId, stockLocationId: selectedLocationId, stockLocationName: currentLocationName,
        productId: row.productId, productName: row.productName, countScopeId: `${schedule.cycleId}:${activeCycleDay}:${row.productId}`,
        workingDayNumber: activeCycleDay, shelfCode: row.shelfCode, binCode: row.binCode, category: 'COUNT_OVERDUE', severity: 'MEDIUM',
        reasonCodes: ['SCHEDULED_COUNT_OVERDUE'], suggestedAction: 'The scheduled count is overdue and requires verification.',
        createdBy: activeStaff.id, dueDate: activeWorkingDay.scheduledDate, correlationId: `${correlationId}:${row.productId}`,
        evidence: { id: `${schedule.cycleId}:${activeCycleDay}:${row.productId}:overdue`, occurredAt: now, reasonCode: 'SCHEDULED_COUNT_OVERDUE', summary: `Working Day ${activeCycleDay} count was not completed by its scheduled date.`, sourceEntityId: schedule.cycleId }, now,
      }, activeStaff.role);
      if (result.created) {
        void onLogBIEvent?.('STOCK_COUNT_RECOMMENDED', eventDetails({ productId: row.productId, shelfCode: row.shelfCode, binCode: row.binCode, incidentId: result.incident.id, reasonCodes: result.incident.reasonCodes, severity: result.incident.severity, outcome: 'recommended' }));
        void onLogBIEvent?.('STOCK_ACTION_SENT_TO_MANAGEMENT_DESK', eventDetails({ productId: row.productId, incidentId: result.incident.id, reasonCodes: result.incident.reasonCodes, severity: result.incident.severity, outcome: 'queued' }));
      }
    });
  // Incident evidence is deterministic; the store deduplicates repeated renders and refreshes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCycleDay, activeWorkingDay?.scheduledDate, currentStatus, dayRows, selectedLocationId]);

  useEffect(() => {
    if (!['APPROVED', 'COMPLETED'].includes(currentStatus) || !hasStockActionPermission(activeStaff.role, 'stock.incident.close')) return;
    try {
      const link = JSON.parse(localStorage.getItem(`itred_stocktake_deep_link_${vendorId}`) || 'null') as { incidentId?: string; countSessionId?: string } | null;
      if (!link?.incidentId) return;
      const incidents: StockActionIncident[] = JSON.parse(localStorage.getItem(`itred_stock_incidents_${vendorId}`) || '[]');
      const incident = incidents.find(item => item.id === link.incidentId && item.status !== 'CLOSED');
      if (!incident) return;
      const closed = closeStockIncident(incident, activeStaff.role, 'Targeted count was approved and its inventory workflow completed.', new Date().toISOString());
      saveStockIncidents(vendorId, incidents.map(item => item.id === closed.id ? closed : item));
      if (link.countSessionId) {
        const session = loadTargetedCountSessions(vendorId).find(item => item.id === link.countSessionId);
        if (session) saveTargetedCountSession(vendorId, { ...session, status: 'CLOSED' });
      }
      void onLogBIEvent?.('STOCK_INCIDENT_CLOSED', eventDetails({ incidentId: closed.id, countSessionId: link.countSessionId, outcome: closed.outcome }));
      localStorage.removeItem(`itred_stocktake_deep_link_${vendorId}`);
    } catch { /* A permitted management view will retry closure after the workflow refreshes. */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStaff.role, currentStatus, vendorId]);

  if (!canView) {
    return <div className="border border-red-300 bg-red-50 p-6 text-red-900 font-bold">You do not have permission to view or export this stocktake list.</div>;
  }

  const applyDay = async (day: number) => {
    if (!Number.isInteger(day) || day < 1 || day > 26) {
      setLoadError('Unable to load the assigned count list. Invalid working day.');
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    setSubmissionSuccess(null);
    setFilters(previous => ({ ...previous, search: '', department: 'ALL', shelf: 'ALL', biCheck: 'ALL', varianceOnly: false, countState: 'ALL' }));
    await Promise.resolve();
    setActiveCycleDay(day);
    setIsLoading(false);
    void onLogBIEvent?.('STOCKTAKE_WORKING_DAY_SELECTED', eventDetails({ workingDayNumber: day, outcome: 'selected' }));
  };

  const requestDayChange = (day: number) => {
    if (day === activeCycleDay) return;
    if (isDirty) {
      setPendingDayChange({ day });
      void onLogBIEvent?.('STOCKTAKE_DAY_CHANGED_WITH_UNSAVED_COUNTS', eventDetails({ targetWorkingDayNumber: day, outcome: 'prompted' }));
      return;
    }
    void applyDay(day);
  };

  const saveDraft = () => {
    const draft = saveStocktakeDraft({ vendorId, cycleId: schedule.cycleId, stockLocationId: selectedLocationId, workingDayNumber: activeCycleDay, counts, reasons: varianceReasons, savedBy: activeStaff.id }, activeStaff.role);
    setIsDirty(false);
    setDayStatuses(previous => ({ ...previous, [activeCycleDay]: 'DRAFT_SAVED' }));
    void onLogBIEvent?.('STOCKTAKE_DRAFT_SAVED', eventDetails({ outcome: 'saved', savedAt: draft.savedAt }));
  };

  const saveDraftAndContinue = () => {
    if (!pendingDayChange) return;
    saveDraft();
    const target = pendingDayChange.day;
    setPendingDayChange(null);
    void applyDay(target);
  };

  const discardAndContinue = () => {
    if (!pendingDayChange) return;
    clearStocktakeDraft(vendorId, schedule.cycleId, selectedLocationId, activeCycleDay);
    const target = pendingDayChange.day;
    setCounts({}); setVarianceReasons({}); setIsDirty(false); setPendingDayChange(null);
    void applyDay(target);
  };

  const changeLocation = async (type: 'warehouse' | 'branch', id: string) => {
    if (isDirty && !window.confirm('Discard unsaved counts and change stock location?')) return;
    setIsLoading(true); setLoadError(null); setCounts({}); setVarianceReasons({}); setIsDirty(false);
    setSelectedLocationType(type); setSelectedLocationId(id);
    try { await onStockLocationChange?.(type, id); }
    catch { setLoadError('Unable to load the assigned count list.'); }
    finally { setIsLoading(false); }
  };

  const updateCount = (productId: string, value: number) => {
    if (!canPerform || isLocked) return;
    setCounts(previous => ({ ...previous, [productId]: Math.max(0, value) }));
    setIsDirty(true);
    setDayStatuses(previous => ({ ...previous, [activeCycleDay]: 'IN_PROGRESS' }));
  };

  const updateReason = (productId: string, reason: string) => {
    if (!canPerform || isLocked) return;
    setVarianceReasons(previous => ({ ...previous, [productId]: reason }));
    setIsDirty(true);
  };

  const resetCounts = () => {
    if (!canPerform || isLocked || !window.confirm('Reset all entered counts for this working day?')) return;
    setCounts({}); setVarianceReasons({}); setIsDirty(false);
    clearStocktakeDraft(vendorId, schedule.cycleId, selectedLocationId, activeCycleDay);
    setDayStatuses(previous => ({ ...previous, [activeCycleDay]: 'NOT_STARTED' }));
  };

  const exportContext = (rows: StocktakeCountRow[]): StocktakeExportContext => ({
    vendorId,
    businessName,
    actor: { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role },
    cycleId: schedule.cycleId,
    workingDayNumber: activeCycleDay,
    scheduledDate: activeWorkingDay?.scheduledDate || '',
    stockLocationId: selectedLocationId,
    stockLocationName: currentLocationName,
    shelfIds: assignedShelves,
    rows,
    blindCountMode: blindCount,
  });

  const rowsForExport = exportScope === 'FILTERED' ? displayedRows : dayRows;
  const runPdfExport = async (action: 'open' | 'download') => {
    setIsExporting('PDF');
    try {
      await generateStocktakePdf(exportContext(rowsForExport), { action, includeNotes, includeRecount, showSystemQuantity: showSystemQuantity && !blindCount });
      await onLogBIEvent?.('STOCKTAKE_COUNT_LIST_PDF_GENERATED', eventDetails({ exportFormat: 'PDF', outcome: 'completed', scope: exportScope, blindCountMode: blindCount, productCount: rowsForExport.length }));
      setShowPrintDialog(false);
    } catch (error) {
      await onLogBIEvent?.('STOCKTAKE_EXPORT_DENIED', eventDetails({ exportFormat: 'PDF', outcome: 'denied', reasonCode: error instanceof Error ? error.message : 'EXPORT_FAILED' }));
      alert(error instanceof Error ? error.message : 'Unable to prepare PDF.');
    } finally { setIsExporting(null); }
  };

  const runSpreadsheetExport = async (format: 'XLSX' | 'CSV') => {
    setIsExporting(format);
    try {
      await exportStocktakeSpreadsheet(exportContext(rowsForExport), { format, showSystemQuantity: showSystemQuantity && !blindCount });
      await onLogBIEvent?.(format === 'XLSX' ? 'STOCKTAKE_COUNT_LIST_XLSX_EXPORTED' : 'STOCKTAKE_COUNT_LIST_CSV_EXPORTED', eventDetails({ exportFormat: format, outcome: 'completed', scope: exportScope, blindCountMode: blindCount, productCount: rowsForExport.length }));
      setShowExportDialog(false);
    } catch (error) {
      await onLogBIEvent?.('STOCKTAKE_EXPORT_DENIED', eventDetails({ exportFormat: format, outcome: 'denied', reasonCode: error instanceof Error ? error.message : 'EXPORT_FAILED' }));
      alert(error instanceof Error ? error.message : 'Unable to prepare spreadsheet.');
    } finally { setIsExporting(null); }
  };

  const validationError = () => {
    if (!selectedLocationId) return 'Select a stock location.';
    if (!activeWorkingDay) return 'Select a valid working day.';
    if (!dayRows.length) return `No products are assigned to Working Day ${activeCycleDay} for the selected location.`;
    if (summary.remainingCount) return `${summary.remainingCount} assigned products still require a physical count.`;
    const unresolved = dayRows.filter(row => counts[row.productId] !== row.systemQuantity && !varianceReasons[row.productId]);
    if (unresolved.length) return `${unresolved.length} variance rows require an audit reason.`;
    if (!summary.discrepancyCount) return 'No inventory variances are available for manager approval.';
    if (!canSubmit) return 'You do not have permission to submit stocktake counts.';
    if (isLocked) return 'This working day has already been submitted.';
    return null;
  };

  const submitApproval = async () => {
    const error = validationError();
    if (error) { alert(error); return; }
    const items = dayRows.flatMap(row => {
      const countedQty = counts[row.productId];
      const quantityDelta = countedQty - row.systemQuantity;
      return quantityDelta === 0 ? [] : [{
        productId: row.productId,
        productName: row.productName,
        systemQty: row.systemQuantity,
        countedQty,
        quantityDelta,
        costPrice: row.costPrice,
        reason: varianceReasons[row.productId],
      }];
    });
    setIsSubmitting(true);
    try {
      await onSubmitStocktakeApproval({
        title: `Stocktake Working Day ${activeCycleDay} (${currentLocationName})`,
        description: `Working Day ${activeCycleDay} cycle count for ${currentLocationName}. ${items.length} variance adjustments submitted for manager approval.`,
        idempotencyKey: correlationId,
        dataPayload: {
          locationType: selectedLocationType,
          locationId: selectedLocationId,
          locationName: currentLocationName,
          cycleId: schedule.cycleId,
          stocktakeDay: activeCycleDay,
          scheduledDate: activeWorkingDay?.scheduledDate,
          shelfIds: assignedShelves,
          productCount: dayRows.length,
          totalVariances: items.length,
          netValuation: summary.netVarianceValue,
          correlationId,
          items,
        },
      });
      try {
        const deepLink = JSON.parse(localStorage.getItem(`itred_stocktake_deep_link_${vendorId}`) || 'null') as { countSessionId?: string; productId?: string } | null;
        const session = deepLink?.countSessionId ? loadTargetedCountSessions(vendorId).find(item => item.id === deepLink.countSessionId) : undefined;
        const targetRow = session ? dayRows.find(row => row.productId === session.productId) : undefined;
        if (session && targetRow && counts[targetRow.productId] !== undefined) {
          const movementDelta = targetRow.systemQuantity - session.openingSystemQuantity;
          const reconciled = reconcileTargetedCount(session, counts[targetRow.productId], movementDelta === 0 ? [] : [{ id: `live_${correlationId}`, productId: session.productId, stockLocationId: session.stockLocationId, quantityDelta: movementDelta, occurredAt: new Date(Date.parse(session.openingTimestamp) + 1).toISOString() }], activeStaff.role, new Date().toISOString());
          saveTargetedCountSession(vendorId, reconciled);
          await onLogBIEvent?.('TARGETED_COUNT_RECONCILED', eventDetails({ productId: session.productId, countSessionId: session.id, adjustedExpectedQuantity: reconciled.adjustedExpectedQuantity, variance: reconciled.variance, outcome: 'awaiting_review' }));
          await onLogBIEvent?.('TARGETED_COUNT_SUBMITTED', eventDetails({ productId: session.productId, countSessionId: session.id, outcome: 'submitted' }));
        }
      } catch { /* The scheduled-day approval remains authoritative if no targeted session is active. */ }
      clearStocktakeDraft(vendorId, schedule.cycleId, selectedLocationId, activeCycleDay);
      setIsDirty(false); setShowSubmitDialog(false);
      setDayStatuses(previous => ({ ...previous, [activeCycleDay]: 'SUBMITTED' }));
      setSubmissionSuccess(`Working Day ${activeCycleDay} was submitted once to the Manager Approvals Queue. Stock remains unchanged until approval.`);
      await onLogBIEvent?.('STOCKTAKE_SUBMITTED_FOR_APPROVAL', eventDetails({ outcome: 'submitted', discrepancyCount: items.length }));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error submitting stocktake request.');
    } finally { setIsSubmitting(false); }
  };

  const submitDisabled = isSubmitting || isLoading || !canSubmit || isLocked || !dayRows.length || summary.remainingCount > 0 || summary.discrepancyCount === 0;
  const visibleSystemQuantity = canViewSystemQuantity && !settings.blindCountEnabled;

  return <div className="space-y-5">
    <header data-testid="stocktake-sticky-header" className="sticky top-[52px] lg:top-0 z-20 bg-[#1F242D] text-white border-b-2 border-[#FF6600] shadow-md p-4">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap"><Boxes className="w-5 text-[#FF6600]" /><h1 className="font-black text-lg">Stocktake &amp; Physical Audit Workspace</h1><span className={`px-2 py-1 text-[10px] font-black ${STATUS_STYLES[currentStatus]}`}>{formatStatus(currentStatus)}</span></div>
          <p className="text-xs text-slate-300 mt-1">{currentLocationName} · Working Day {activeCycleDay} · {activeWorkingDay?.dayOfWeekLabel} {activeWorkingDay?.dateLabel}</p>
          <p className="text-xs text-slate-400 truncate">Scope: {assignedShelves.join(', ') || 'No assigned shelves'} · {summary.productCount} products · {summary.countedCount} counted · {summary.discrepancyCount} variances{canViewValuation ? ` · Net ${currency}${summary.netVarianceValue.toFixed(2)}` : ''}</p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 xl:justify-end">
          {canDraft && <button onClick={saveDraft} disabled={!isDirty || isLocked} className="px-3 py-2 border border-slate-500 disabled:opacity-40 font-bold text-xs flex justify-center gap-2"><Save className="w-4" />Save Draft</button>}
          {onNavigateToApprovals && activeStaff.grantedMenuIds.includes('approvals') && <button onClick={onNavigateToApprovals} className="px-3 py-2 border border-slate-500 font-bold text-xs flex justify-center gap-2"><FileCheck className="w-4 text-[#FF6600]" />Approvals Queue</button>}
          <button onClick={() => setShowPrintDialog(true)} disabled={!canPrint || !dayRows.length || Boolean(isExporting)} className="px-3 py-2 border border-slate-500 disabled:opacity-40 font-bold text-xs flex justify-center gap-2"><Printer className="w-4" />Print Count List</button>
          <button onClick={() => setShowExportDialog(true)} disabled={!canExport || !dayRows.length || Boolean(isExporting)} className="px-3 py-2 border border-slate-500 disabled:opacity-40 font-bold text-xs flex justify-center gap-2"><FileSpreadsheet className="w-4" />Export Spreadsheet</button>
          <button data-testid="stocktake-submit-header" onClick={() => { const error = validationError(); if (error) alert(error); else setShowSubmitDialog(true); }} disabled={submitDisabled} className="col-span-2 px-4 py-2.5 bg-[#FF6600] hover:bg-[#E65C00] disabled:opacity-40 font-black text-xs flex justify-center gap-2 sm:min-w-64"><Send className="w-4" />{isSubmitting ? 'Submitting stocktake for manager approval…' : 'Submit Stocktake for Manager Approval'}</button>
        </div>
      </div>
    </header>

    <section className="grid lg:grid-cols-3 gap-4">
      <div className="bg-white border border-slate-300 p-4 space-y-3">
        <h2 className="font-black text-sm flex gap-2"><Building className="w-4 text-[#FF6600]" />Stock Location</h2>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => warehouses[0] && changeLocation('warehouse', warehouses[0].id)} className={`border p-2 text-xs font-bold flex justify-center gap-2 ${selectedLocationType === 'warehouse' ? 'bg-slate-900 text-white' : ''}`}><WarehouseIcon className="w-4" />Warehouse</button>
          <button onClick={() => branches[0] && changeLocation('branch', branches[0].id)} className={`border p-2 text-xs font-bold flex justify-center gap-2 ${selectedLocationType === 'branch' ? 'bg-slate-900 text-white' : ''}`}><Building className="w-4" />Branch</button>
        </div>
        <select aria-label="Stocktake location" value={selectedLocationId} onChange={event => changeLocation(selectedLocationType, event.target.value)} className="w-full border border-slate-300 p-2 text-xs font-bold">
          {(selectedLocationType === 'warehouse' ? warehouses : branches).map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
        </select>
        <div className="bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900"><strong>Governance:</strong> Counts remain drafts or approval proposals. They never directly alter inventory.</div>
      </div>
      <div className="lg:col-span-2 bg-white border border-slate-300 p-4">
        <div className="flex justify-between gap-3 mb-3"><div><h2 className="font-black text-sm flex gap-2"><Calendar className="w-4 text-[#FF6600]" />26 Working Day Cycle</h2><p className="text-xs text-slate-500">Selecting a day loads only its explicit shelf and product assignments.</p></div><div className="text-right text-xs"><strong>{assignedShelves.length}</strong> shelves<br /><strong>{dayRows.length}</strong> products</div></div>
        <div className="grid grid-cols-7 sm:grid-cols-13 gap-1.5">
          {schedule.workingDays.map(day => {
            const status = day.workingDayNumber === activeCycleDay ? currentStatus : workflowStatuses[day.workingDayNumber] || dayStatuses[day.workingDayNumber] || 'NOT_STARTED';
            const selected = activeCycleDay === day.workingDayNumber;
            return <button key={day.workingDayNumber} type="button" aria-label={`Working Day ${day.workingDayNumber}, ${formatStatus(status)}`} title={`Working Day ${day.workingDayNumber}: ${day.dayOfWeekLabel}, ${day.dateLabel} · ${formatStatus(status)}`} onClick={() => requestDayChange(day.workingDayNumber)} className={`h-10 border text-xs font-black relative ${selected ? 'bg-[#FF6600] text-white border-[#FF6600] ring-2 ring-orange-200' : STATUS_STYLES[status]}`}><span>{day.workingDayNumber}</span><span className="sr-only">{formatStatus(status)}</span></button>;
          })}
        </div>
      </div>
    </section>

    <section className="grid grid-cols-2 md:grid-cols-6 border border-slate-300 bg-white">
      {[['Products', summary.productCount], ['Shelves', assignedShelves.length], ['Counted', summary.countedCount], ['Remaining', summary.remainingCount], ['Discrepancies', summary.discrepancyCount], ['Status', formatStatus(currentStatus)]].map(([label, value]) => <div key={String(label)} className="p-3 border-r border-b md:border-b-0 border-slate-200"><div className="text-[10px] uppercase text-slate-500 font-bold">{label}</div><div className="font-black text-sm mt-1">{value}</div></div>)}
    </section>

    {submissionSuccess && <div className="p-4 border border-emerald-300 bg-emerald-50 text-emerald-900 flex justify-between gap-3"><span className="flex gap-2 text-sm"><CheckCircle2 className="w-5" />{submissionSuccess}</span><button onClick={() => setSubmissionSuccess(null)}><X className="w-4" /></button></div>}
    {loadError && <div className="p-4 border border-red-300 bg-red-50 text-red-900 flex gap-2"><AlertTriangle className="w-5" />{loadError}</div>}

    <section className="bg-white border border-slate-300 p-3 flex flex-col xl:flex-row gap-2">
      <label className="relative flex-1"><Search className="absolute left-3 top-2.5 w-4 text-slate-400" /><input value={filters.search} onChange={event => setFilters(previous => ({ ...previous, search: event.target.value }))} placeholder="Search SKU, product name or shelf" className="w-full border p-2 pl-9 text-xs" /></label>
      <select aria-label="Department filter" value={filters.department} onChange={event => setFilters(previous => ({ ...previous, department: event.target.value }))} className="border p-2 text-xs font-bold"><option value="ALL">All Departments</option>{departments.slice(1).map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Shelf filter" value={filters.shelf} onChange={event => setFilters(previous => ({ ...previous, shelf: event.target.value }))} className="border p-2 text-xs font-bold"><option value="ALL">All Assigned Shelves</option>{shelves.slice(1).map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="BI check filter" value={filters.biCheck} onChange={event => setFilters(previous => ({ ...previous, biCheck: event.target.value }))} className="border p-2 text-xs font-bold"><option value="ALL">All BI Checks</option><option value="HIGH_VALUE_EXPOSURE">High Value Exposure</option></select>
      <select aria-label="Count status filter" value={filters.countState} onChange={event => setFilters(previous => ({ ...previous, countState: event.target.value as StocktakeFilters['countState'] }))} className="border p-2 text-xs font-bold"><option value="ALL">Counted &amp; Uncounted</option><option value="COUNTED">Counted</option><option value="UNCOUNTED">Uncounted</option></select>
      <button onClick={() => setFilters(previous => ({ ...previous, varianceOnly: !previous.varianceOnly }))} className={`border p-2 text-xs font-bold ${filters.varianceOnly ? 'bg-red-600 text-white' : ''}`}><Filter className="inline w-4 mr-1" />Variances Only</button>
      <button onClick={resetCounts} disabled={!canPerform || isLocked} className="border p-2 text-xs font-bold disabled:opacity-40"><RotateCcw className="inline w-4 mr-1" />Reset</button>
    </section>

    <section className="bg-white border border-slate-300 overflow-hidden">
      {isLoading ? <div className="p-16 text-center text-slate-600"><Loader2 className="w-7 animate-spin mx-auto mb-2" />Loading products assigned to Working Day {activeCycleDay}…</div>
      : loadError ? <div className="p-16 text-center text-red-800"><AlertTriangle className="w-8 mx-auto mb-2" /><p className="font-black">Unable to load the assigned count list.</p></div>
      : dayRows.length === 0 ? <div className="p-16 text-center"><Boxes className="w-8 mx-auto text-slate-300 mb-2" /><p className="font-black">No products are assigned to Working Day {activeCycleDay} for the selected location.</p></div>
      : <div className="overflow-x-auto"><table className="min-w-[1700px] w-full text-xs text-left"><thead className="bg-[#1F242D] text-white"><tr>{['SKU', 'Product Name', 'Description', 'Category', 'Size', 'UM', 'Location', 'Shelf / Bin', 'System Qty', 'Physical Counted Qty', 'Variance', 'Valuation Impact', 'Count Status', 'Variance Audit Note'].map(header => <th key={header} className="p-3 whitespace-nowrap">{header}</th>)}</tr></thead><tbody>
        {displayedRows.map(row => {
          const hasCount = counts[row.productId] !== undefined;
          const counted = counts[row.productId];
          const variance = hasCount ? counted - row.systemQuantity : 0;
          const rowStatus = hasCount ? 'COUNTED' : 'ASSIGNED';
          return <tr key={row.assignmentId} className="border-t border-slate-200 hover:bg-slate-50">
            <td className="p-3 font-mono font-black">{row.sku}</td><td className="p-3 font-black">{row.productName}</td><td className="p-3 max-w-52">{row.description || '—'}</td><td className="p-3">{row.category}</td><td className="p-3">{row.size || '—'}</td><td className="p-3">{row.unitOfMeasure}</td><td className="p-3">{row.locationName}</td><td className="p-3 font-bold">{[row.shelfCode, row.binCode].filter(Boolean).join(' / ')}</td>
            <td className="p-3 text-center font-black">{visibleSystemQuantity ? row.systemQuantity : '•••'}</td>
            <td className="p-3"><div className="flex justify-center items-center gap-1"><button disabled={!canPerform || isLocked || !hasCount} onClick={() => updateCount(row.productId, (counted || 0) - 1)} className="w-8 h-8 bg-slate-100 disabled:opacity-30"><Minus className="w-4 mx-auto" /></button><input aria-label={`Physical count for ${row.sku}`} disabled={!canPerform || isLocked} type="number" min="0" value={hasCount ? counted : ''} onChange={event => updateCount(row.productId, Number(event.target.value))} className="w-20 h-9 border text-center font-black text-base" /><button disabled={!canPerform || isLocked} onClick={() => updateCount(row.productId, (hasCount ? counted : 0) + 1)} className="w-8 h-8 bg-slate-100 disabled:opacity-30"><Plus className="w-4 mx-auto" /></button></div></td>
            <td className={`p-3 text-center font-black ${variance < 0 ? 'text-red-600' : variance > 0 ? 'text-blue-600' : ''}`}>{hasCount ? (variance > 0 ? `+${variance}` : variance) : '—'}</td>
            <td className="p-3 text-right font-bold">{canViewValuation && hasCount ? `${variance > 0 ? '+' : ''}${currency}${(variance * row.costPrice).toFixed(2)}` : 'Restricted'}</td>
            <td className="p-3"><span className={`px-2 py-1 font-bold ${hasCount ? 'bg-blue-100 text-blue-800' : 'bg-slate-100'}`}>{rowStatus}</span></td>
            <td className="p-3"><select aria-label={`Variance reason for ${row.sku}`} disabled={!hasCount || variance === 0 || isLocked} value={varianceReasons[row.productId] || ''} onChange={event => updateReason(row.productId, event.target.value)} className="w-full min-w-52 border p-2 disabled:bg-slate-100"><option value="">Select audit reason</option><option>Suspected Theft / Physical Shrinkage</option><option>Damaged / Expired Product</option><option>Misplaced / Wrong Shelf Location</option><option>Unrecorded Intake / Recount Match</option><option>System Data Entry Error</option></select></td>
          </tr>;
        })}
        {!displayedRows.length && <tr><td colSpan={14} className="p-12 text-center font-bold text-slate-500">No assigned products match the active filters.</td></tr>}
      </tbody></table></div>}
    </section>

    {pendingDayChange && <div role="dialog" aria-modal="true" aria-label="Unsaved stocktake counts" className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white border-t-4 border-[#FF6600] shadow-2xl max-w-lg w-full p-5"><h2 className="font-black text-lg">Unsaved count changes</h2><p className="text-sm text-slate-600 mt-2">Working Day {activeCycleDay} has unsaved physical counts. Choose what to do before opening Working Day {pendingDayChange.day}.</p><div className="grid sm:grid-cols-3 gap-2 mt-5"><button onClick={saveDraftAndContinue} disabled={!canDraft} className="p-3 bg-[#FF6600] text-white font-black text-xs disabled:opacity-40">Save Draft and Continue</button><button onClick={discardAndContinue} className="p-3 border border-red-300 text-red-700 font-black text-xs">Discard Changes</button><button onClick={() => setPendingDayChange(null)} className="p-3 border font-black text-xs">Stay on Current Day</button></div></div></div>}

    {showSubmitDialog && <div role="dialog" aria-modal="true" aria-label="Confirm stocktake submission" className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white border-t-4 border-[#FF6600] shadow-2xl max-w-xl w-full p-5"><h2 className="font-black text-lg">Submit for manager approval?</h2><dl className="grid grid-cols-2 gap-3 text-sm mt-4"><div><dt className="text-slate-500">Working Day</dt><dd className="font-black">{activeCycleDay}</dd></div><div><dt className="text-slate-500">Location</dt><dd className="font-black">{currentLocationName}</dd></div><div><dt className="text-slate-500">Assigned Shelves</dt><dd className="font-black">{assignedShelves.join(', ')}</dd></div><div><dt className="text-slate-500">Products</dt><dd className="font-black">{summary.productCount} assigned · {summary.countedCount} counted</dd></div><div><dt className="text-slate-500">Discrepancies</dt><dd className="font-black">{summary.discrepancyCount}</dd></div>{canViewValuation && <><div><dt className="text-slate-500">Positive valuation</dt><dd className="font-black text-blue-700">{currency}{summary.totalSurplusValue.toFixed(2)}</dd></div><div><dt className="text-slate-500">Shrinkage valuation</dt><dd className="font-black text-red-700">-{currency}{summary.totalShrinkageValue.toFixed(2)}</dd></div><div><dt className="text-slate-500">Net adjustment</dt><dd className="font-black">{currency}{summary.netVarianceValue.toFixed(2)}</dd></div></>}</dl><p className="mt-4 text-xs bg-amber-50 border border-amber-200 p-3">This creates one variance proposal. Inventory will not change until an authorised manager approves it.</p><div className="flex justify-end gap-2 mt-5"><button onClick={() => setShowSubmitDialog(false)} className="border px-4 py-2 font-bold">Cancel</button><button onClick={submitApproval} disabled={isSubmitting} className="bg-[#FF6600] text-white px-4 py-2 font-black disabled:opacity-40">{isSubmitting ? 'Submitting…' : 'Submit Once'}</button></div></div></div>}

    {showPrintDialog && <ExportOptionsDialog title="Print Count List" icon={<Printer className="w-5" />} exportScope={exportScope} setExportScope={setExportScope} blindCount={blindCount} setBlindCount={value => { setBlindCount(value); if (value) setShowSystemQuantity(false); }} showSystemQuantity={showSystemQuantity} setShowSystemQuantity={setShowSystemQuantity} canViewSystemQuantity={canViewSystemQuantity} includeNotes={includeNotes} setIncludeNotes={setIncludeNotes} includeRecount={includeRecount} setIncludeRecount={setIncludeRecount} isExporting={isExporting === 'PDF'} onClose={() => setShowPrintDialog(false)} actions={<><button onClick={() => runPdfExport('open')} className="bg-slate-900 text-white px-4 py-2 font-black text-xs">Print / Open PDF</button><button onClick={() => runPdfExport('download')} className="bg-[#FF6600] text-white px-4 py-2 font-black text-xs"><Download className="inline w-4 mr-1" />Download PDF</button></>} />}
    {showExportDialog && <ExportOptionsDialog title="Export Spreadsheet" icon={<FileSpreadsheet className="w-5" />} exportScope={exportScope} setExportScope={setExportScope} blindCount={blindCount} setBlindCount={value => { setBlindCount(value); if (value) setShowSystemQuantity(false); }} showSystemQuantity={showSystemQuantity} setShowSystemQuantity={setShowSystemQuantity} canViewSystemQuantity={canViewSystemQuantity} includeNotes={includeNotes} setIncludeNotes={setIncludeNotes} includeRecount={includeRecount} setIncludeRecount={setIncludeRecount} isExporting={Boolean(isExporting)} onClose={() => setShowExportDialog(false)} actions={<><button onClick={() => runSpreadsheetExport('CSV')} className="border px-4 py-2 font-black text-xs">Export CSV</button><button onClick={() => runSpreadsheetExport('XLSX')} className="bg-[#FF6600] text-white px-4 py-2 font-black text-xs">Export XLSX</button></>} />}
  </div>;
};

interface ExportOptionsDialogProps {
  title: string; icon: React.ReactNode; exportScope: ExportScope; setExportScope: (value: ExportScope) => void;
  blindCount: boolean; setBlindCount: (value: boolean) => void; showSystemQuantity: boolean; setShowSystemQuantity: (value: boolean) => void;
  canViewSystemQuantity: boolean; includeNotes: boolean; setIncludeNotes: (value: boolean) => void; includeRecount: boolean; setIncludeRecount: (value: boolean) => void;
  isExporting: boolean; onClose: () => void; actions: React.ReactNode;
}

const ExportOptionsDialog: React.FC<ExportOptionsDialogProps> = ({ title, icon, exportScope, setExportScope, blindCount, setBlindCount, showSystemQuantity, setShowSystemQuantity, canViewSystemQuantity, includeNotes, setIncludeNotes, includeRecount, setIncludeRecount, isExporting, onClose, actions }) => <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white border-t-4 border-[#FF6600] shadow-2xl max-w-lg w-full p-5"><div className="flex justify-between"><h2 className="font-black text-lg flex gap-2">{icon}{title}</h2><button onClick={onClose}><X className="w-5" /></button></div><div className="space-y-3 mt-4 text-sm"><fieldset className="border p-3"><legend className="font-black px-1">Scope</legend><label className="block"><input type="radio" checked={exportScope === 'COMPLETE'} onChange={() => setExportScope('COMPLETE')} /> Complete Day List</label><label className="block mt-2"><input type="radio" checked={exportScope === 'FILTERED'} onChange={() => setExportScope('FILTERED')} /> Current Filtered View</label></fieldset><label className="flex gap-2"><input type="checkbox" checked={blindCount} onChange={event => setBlindCount(event.target.checked)} /> Blind Count</label>{canViewSystemQuantity && <label className="flex gap-2"><input type="checkbox" disabled={blindCount} checked={showSystemQuantity && !blindCount} onChange={event => setShowSystemQuantity(event.target.checked)} /> Show System Quantity</label>}<label className="flex gap-2"><input type="checkbox" checked={includeNotes} onChange={event => setIncludeNotes(event.target.checked)} /> Include Notes Column</label><label className="flex gap-2"><input type="checkbox" checked={includeRecount} onChange={event => setIncludeRecount(event.target.checked)} /> Include Recount Column</label><p className="text-xs text-slate-500">Cost and valuation are excluded. This is a worksheet and does not adjust inventory.</p></div><div className="flex flex-wrap justify-end gap-2 mt-5">{isExporting ? <span className="flex gap-2 text-sm"><Loader2 className="w-4 animate-spin" />Preparing {title.includes('Print') ? 'PDF' : 'spreadsheet'}…</span> : actions}</div></div></div>;
