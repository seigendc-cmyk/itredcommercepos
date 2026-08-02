import { Product } from '../../types';
import { buildProductLocationStockView, ProductLocationStockView } from '../inventory/productLocationStockView';

export const STOCKTAKE_WORKING_DAY_COUNT = 26;
export const STOCKTAKE_SCHEMA_VERSION = '1.0.0';

export type StocktakeDayStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'DRAFT_SAVED'
  | 'READY_FOR_REVIEW'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED';

export type CycleCountAssignmentStatus = 'ASSIGNED' | 'COUNTED' | 'SKIPPED' | 'SUBMITTED' | 'COMPLETED';

export interface WorkingDayDefinition {
  workingDayNumber: number;
  scheduledDate: string;
  dateLabel: string;
  dayOfWeekLabel: string;
}

export interface CycleCountAssignment {
  id: string;
  tenantId: string;
  vendorId: string;
  stockLocationId: string;
  workingDayNumber: number;
  cycleId: string;
  shelfId: string;
  shelfCode: string;
  binCode?: string;
  departmentId?: string;
  productId: string;
  assignmentStatus: CycleCountAssignmentStatus;
  scheduledDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface CycleCountSchedule {
  cycleId: string;
  stockLocationId: string;
  workingDays: WorkingDayDefinition[];
  assignments: CycleCountAssignment[];
  shelvesByDay: Record<number, string[]>;
}

export interface StocktakeCountRow extends ProductLocationStockView {
  assignmentId: string;
  workingDayNumber: number;
  scheduledDate: string;
  countStatus: CycleCountAssignmentStatus;
  costPrice: number;
}

export interface StocktakeSummary {
  productCount: number;
  countedCount: number;
  remainingCount: number;
  matchingCount: number;
  discrepancyCount: number;
  totalShrinkageValue: number;
  totalSurplusValue: number;
  netVarianceValue: number;
}

export interface StocktakeFilters {
  search: string;
  department: string;
  shelf: string;
  biCheck: string;
  varianceOnly: boolean;
  countState: 'ALL' | 'COUNTED' | 'UNCOUNTED';
}

const DEFAULT_HOLIDAYS = new Set(['01-01', '05-01', '12-25', '12-26']);

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function locationMatches(productLocation: string | undefined, aliases: string[]): boolean {
  if (!productLocation?.trim()) return false;
  const normalized = productLocation.trim().toLowerCase();
  return aliases.some(alias => alias.trim().toLowerCase() === normalized);
}

export function buildWorkingDayDefinitions(now = new Date(), holidays = DEFAULT_HOLIDAYS): WorkingDayDefinition[] {
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  const workingDays: WorkingDayDefinition[] = [];
  while (workingDays.length < STOCKTAKE_WORKING_DAY_COUNT) {
    const monthDay = `${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (cursor.getDay() !== 0 && !holidays.has(monthDay)) {
      workingDays.push({
        workingDayNumber: workingDays.length + 1,
        scheduledDate: dateKey(cursor),
        dateLabel: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dayOfWeekLabel: cursor.toLocaleDateString('en-US', { weekday: 'short' }),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return workingDays;
}

export function getDefaultWorkingDay(workingDays: WorkingDayDefinition[], now = new Date()): number {
  const today = dateKey(now);
  const exact = workingDays.find(day => day.scheduledDate === today);
  if (exact) return exact.workingDayNumber;
  const elapsed = workingDays.filter(day => day.scheduledDate <= today);
  return Math.max(1, Math.min(STOCKTAKE_WORKING_DAY_COUNT, elapsed.at(-1)?.workingDayNumber || 1));
}

export function buildCycleCountSchedule(input: {
  vendorId: string;
  stockLocationId: string;
  stockLocationAliases: string[];
  products: Product[];
  now?: Date;
}): CycleCountSchedule {
  const now = input.now || new Date();
  const workingDays = buildWorkingDayDefinitions(now);
  const cycleId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${input.stockLocationId}`;
  const eligible = input.products.filter(product =>
    product.status !== 'archived'
    && (product.productType || 'INVENTORY') === 'INVENTORY'
    && Boolean(product.shelf?.trim())
    && locationMatches(product.location, input.stockLocationAliases),
  );
  const shelves = Array.from(new Set(eligible.map(product => product.shelf!.trim()))).sort((a, b) => a.localeCompare(b));
  const shelvesPerDay = shelves.length === 0 ? 0 : Math.max(1, Math.ceil(shelves.length / STOCKTAKE_WORKING_DAY_COUNT));
  const shelvesByDay: Record<number, string[]> = {};
  for (let day = 1; day <= STOCKTAKE_WORKING_DAY_COUNT; day += 1) {
    const start = (day - 1) * shelvesPerDay;
    shelvesByDay[day] = shelvesPerDay ? shelves.slice(start, start + shelvesPerDay) : [];
  }
  const createdAt = now.toISOString();
  const shelfDay = new Map<string, number>();
  Object.entries(shelvesByDay).forEach(([day, dayShelves]) => dayShelves.forEach(shelf => shelfDay.set(shelf, Number(day))));
  const assignments = eligible.map(product => {
    const shelfCode = product.shelf!.trim();
    const workingDayNumber = shelfDay.get(shelfCode)!;
    return {
      id: `${cycleId}:${workingDayNumber}:${input.stockLocationId}:${product.id}`,
      tenantId: input.vendorId,
      vendorId: input.vendorId,
      stockLocationId: input.stockLocationId,
      workingDayNumber,
      cycleId,
      shelfId: shelfCode,
      shelfCode,
      binCode: product.bin?.trim() || undefined,
      departmentId: product.category || undefined,
      productId: product.id,
      assignmentStatus: 'ASSIGNED' as const,
      scheduledDate: workingDays[workingDayNumber - 1].scheduledDate,
      createdAt,
      updatedAt: createdAt,
    };
  }).sort((a, b) => a.shelfCode.localeCompare(b.shelfCode) || a.productId.localeCompare(b.productId));
  return { cycleId, stockLocationId: input.stockLocationId, workingDays, assignments, shelvesByDay };
}

export function resolveStocktakeRows(input: {
  schedule: CycleCountSchedule;
  workingDayNumber: number;
  products: Product[];
  stockLocation: { id: string; name: string };
  stock: Record<string, number>;
}): StocktakeCountRow[] {
  if (!Number.isInteger(input.workingDayNumber) || input.workingDayNumber < 1 || input.workingDayNumber > STOCKTAKE_WORKING_DAY_COUNT) {
    throw new Error('Working day must be between 1 and 26.');
  }
  const productById = new Map(input.products.map(product => [product.id, product]));
  return input.schedule.assignments
    .filter(assignment => assignment.workingDayNumber === input.workingDayNumber && assignment.stockLocationId === input.stockLocation.id)
    .map(assignment => {
      const product = productById.get(assignment.productId);
      if (!product || product.status === 'archived' || (product.productType || 'INVENTORY') !== 'INVENTORY') return null;
      const view = buildProductLocationStockView(product, input.stockLocation, input.stock[product.id] ?? 0);
      return {
        ...view,
        shelfCode: assignment.shelfCode,
        binCode: assignment.binCode || '',
        assignmentId: assignment.id,
        workingDayNumber: assignment.workingDayNumber,
        scheduledDate: assignment.scheduledDate,
        countStatus: assignment.assignmentStatus,
        costPrice: product.costPrice || 0,
      } satisfies StocktakeCountRow;
    })
    .filter((row): row is StocktakeCountRow => row !== null);
}

export function filterStocktakeRows(rows: StocktakeCountRow[], filters: StocktakeFilters, counts: Record<string, number>): StocktakeCountRow[] {
  const term = filters.search.trim().toLowerCase();
  return rows.filter(row => {
    const counted = counts[row.productId] !== undefined;
    const variance = counted ? counts[row.productId] - row.systemQuantity : 0;
    const matchesSearch = !term || [row.sku, row.productName, row.description, row.shelfCode, row.binCode].some(value => value.toLowerCase().includes(term));
    const matchesDepartment = filters.department === 'ALL' || row.category === filters.department;
    const matchesShelf = filters.shelf === 'ALL' || row.shelfCode === filters.shelf;
    const matchesVariance = !filters.varianceOnly || (counted && variance !== 0);
    const matchesCount = filters.countState === 'ALL' || (filters.countState === 'COUNTED' ? counted : !counted);
    const matchesBI = filters.biCheck === 'ALL' || (filters.biCheck === 'HIGH_VALUE_EXPOSURE' && row.costPrice >= 100);
    return matchesSearch && matchesDepartment && matchesShelf && matchesVariance && matchesCount && matchesBI;
  });
}

export function summarizeStocktake(rows: StocktakeCountRow[], counts: Record<string, number>): StocktakeSummary {
  return rows.reduce<StocktakeSummary>((summary, row) => {
    const counted = counts[row.productId] !== undefined;
    const variance = counted ? counts[row.productId] - row.systemQuantity : 0;
    summary.productCount += 1;
    if (counted) summary.countedCount += 1;
    else summary.remainingCount += 1;
    if (counted && variance === 0) summary.matchingCount += 1;
    if (counted && variance !== 0) summary.discrepancyCount += 1;
    if (variance < 0) summary.totalShrinkageValue += Math.abs(variance) * row.costPrice;
    if (variance > 0) summary.totalSurplusValue += variance * row.costPrice;
    summary.netVarianceValue = summary.totalSurplusValue - summary.totalShrinkageValue;
    return summary;
  }, { productCount: 0, countedCount: 0, remainingCount: 0, matchingCount: 0, discrepancyCount: 0, totalShrinkageValue: 0, totalSurplusValue: 0, netVarianceValue: 0 });
}

export function deriveStocktakeDayStatus(input: {
  rowCount: number;
  countedCount: number;
  draftSaved: boolean;
  submitted: boolean;
  rejected?: boolean;
}): StocktakeDayStatus {
  if (input.rejected) return 'REJECTED';
  if (input.submitted) return 'SUBMITTED';
  if (input.rowCount > 0 && input.countedCount === input.rowCount) return 'READY_FOR_REVIEW';
  if (input.draftSaved) return 'DRAFT_SAVED';
  if (input.countedCount > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}
