import { StaffRole } from '../../types';
import { assertStocktakePermission } from './permissions';

export interface StocktakeDraft {
  vendorId: string;
  cycleId: string;
  stockLocationId: string;
  workingDayNumber: number;
  counts: Record<string, number>;
  reasons: Record<string, string>;
  savedAt: string;
  savedBy: string;
}

export interface StocktakeWorkingContext {
  vendorId: string;
  cycleId: string;
  stockLocationId: string;
  stockLocationType: 'warehouse' | 'branch';
  workingDayNumber: number;
  savedAt: string;
}

function draftKey(vendorId: string, cycleId: string, stockLocationId: string, workingDayNumber: number): string {
  return `itred_stocktake_draft_${vendorId}_${cycleId}_${stockLocationId}_${workingDayNumber}`;
}

function contextKey(vendorId: string): string { return `itred_stocktake_working_context_${vendorId}`; }

export function saveStocktakeWorkingContext(input: Omit<StocktakeWorkingContext, 'savedAt'>, role: StaffRole): StocktakeWorkingContext {
  assertStocktakePermission(role, 'stocktake.draft.save');
  const context = { ...input, savedAt: new Date().toISOString() };
  localStorage.setItem(contextKey(input.vendorId), JSON.stringify(context));
  return context;
}

export function loadStocktakeWorkingContext(vendorId: string, role: StaffRole): StocktakeWorkingContext | null {
  assertStocktakePermission(role, 'stocktake.view');
  const raw = localStorage.getItem(contextKey(vendorId));
  if (!raw) return null;
  try {
    const context = JSON.parse(raw) as StocktakeWorkingContext;
    if (context.vendorId !== vendorId || !context.cycleId || !context.stockLocationId || !['warehouse', 'branch'].includes(context.stockLocationType) || !Number.isInteger(context.workingDayNumber) || context.workingDayNumber < 1 || context.workingDayNumber > 26) return null;
    return context;
  } catch { return null; }
}

export function saveStocktakeDraft(input: Omit<StocktakeDraft, 'savedAt'>, role: StaffRole): StocktakeDraft {
  assertStocktakePermission(role, 'stocktake.draft.save');
  const draft = { ...input, savedAt: new Date().toISOString() };
  localStorage.setItem(draftKey(input.vendorId, input.cycleId, input.stockLocationId, input.workingDayNumber), JSON.stringify(draft));
  return draft;
}

export function loadStocktakeDraft(vendorId: string, cycleId: string, stockLocationId: string, workingDayNumber: number, role: StaffRole): StocktakeDraft | null {
  assertStocktakePermission(role, 'stocktake.view');
  const raw = localStorage.getItem(draftKey(vendorId, cycleId, stockLocationId, workingDayNumber));
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as StocktakeDraft;
    if (draft.vendorId !== vendorId || draft.cycleId !== cycleId || draft.stockLocationId !== stockLocationId || draft.workingDayNumber !== workingDayNumber) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearStocktakeDraft(vendorId: string, cycleId: string, stockLocationId: string, workingDayNumber: number): void {
  localStorage.removeItem(draftKey(vendorId, cycleId, stockLocationId, workingDayNumber));
}
