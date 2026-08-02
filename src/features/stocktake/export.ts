import type ExcelJS from 'exceljs';
import { StaffRole } from '../../types';
import { StocktakeCountRow, STOCKTAKE_SCHEMA_VERSION } from './domain';
import { assertStocktakePermission } from './permissions';

export interface StocktakeExportContext {
  vendorId: string;
  businessName: string;
  actor: { id: string; name: string; role: StaffRole };
  cycleId: string;
  workingDayNumber: number;
  scheduledDate: string;
  stockLocationId: string;
  stockLocationName: string;
  shelfIds: string[];
  rows: StocktakeCountRow[];
  blindCountMode: boolean;
}

export interface StocktakePdfOptions {
  action: 'open' | 'download';
  includeNotes: boolean;
  includeRecount: boolean;
  showSystemQuantity: boolean;
}

export interface StocktakeSpreadsheetOptions {
  format: 'XLSX' | 'CSV';
  showSystemQuantity: boolean;
}

export interface StocktakePdfTable {
  headers: string[];
  body: Array<Array<string | number>>;
}

function assertSystemQuantity(context: StocktakeExportContext, showSystemQuantity: boolean): void {
  if (showSystemQuantity) assertStocktakePermission(context.actor.role, 'stocktake.view_system_quantity');
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

export async function generateStocktakePdf(context: StocktakeExportContext, options: StocktakePdfOptions): Promise<void> {
  assertStocktakePermission(context.actor.role, 'stocktake.print');
  assertSystemQuantity(context, options.showSystemQuantity);
  if (context.rows.length === 0) throw new Error('The selected working day has no products to print.');
  const previewWindow = options.action === 'open' ? window.open('', '_blank') : null;
  if (options.action === 'open' && !previewWindow) throw new Error('The browser blocked the PDF preview window. Allow pop-ups and try again.');
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const table = buildStocktakePdfTable(context, options);
  const headers = table.headers;
  const body = table.body;
  const headerLines = [
    context.businessName,
    'Stocktake Count List',
    `${context.stockLocationName} · Working Day ${context.workingDayNumber} · ${context.scheduledDate}`,
    `Shelves: ${context.shelfIds.join(', ') || 'None'} · Cycle: ${context.cycleId}`,
    `Generated ${new Date().toLocaleString()} by ${context.actor.name} · ${context.blindCountMode ? 'Blind count' : 'Open count'}`,
  ];
  autoTable(doc, {
    head: [headers],
    body,
    startY: 34,
    margin: { top: 34, bottom: 14, left: 8, right: 8 },
    styles: { fontSize: 6.5, cellPadding: 1.4, overflow: 'linebreak', lineColor: [203, 213, 225], lineWidth: 0.1 },
    headStyles: { fillColor: [31, 36, 45], textColor: [255, 255, 255], fontStyle: 'bold' },
    didDrawPage: data => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(headerLines[0], 8, 9);
      doc.setTextColor(255, 102, 0); doc.setFontSize(14); doc.text(headerLines[1], 8, 16);
      doc.setTextColor(31, 36, 45); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      doc.text(headerLines.slice(2), 8, 22);
      doc.setFontSize(7); doc.setTextColor(71, 85, 105);
      doc.text('Count worksheet only — this document does not alter inventory.', 8, 204);
      doc.text(`Page ${data.pageNumber}`, 286, 204, { align: 'right' });
    },
  });
  const fileName = `stocktake-day-${context.workingDayNumber}-${safeFilePart(context.stockLocationName)}.pdf`;
  if (options.action === 'download') doc.save(fileName);
  else previewWindow!.location.href = String(doc.output('bloburl'));
}

export function buildStocktakePdfTable(context: StocktakeExportContext, options: StocktakePdfOptions): StocktakePdfTable {
  assertStocktakePermission(context.actor.role, 'stocktake.print');
  assertSystemQuantity(context, options.showSystemQuantity);
  const includeSystemQuantity = options.showSystemQuantity && !context.blindCountMode;
  const headers = ['Line No.', 'SKU', 'Product Name', 'Description', 'Category', 'Size', 'UM', 'Shelf / Bin'];
  if (includeSystemQuantity) headers.push('System Qty');
  headers.push('Physical Count');
  if (options.includeRecount) headers.push('Recount');
  if (options.includeNotes) headers.push('Notes');
  headers.push('Counter Initials');
  const body = context.rows.map((row, index) => {
    const cells: Array<string | number> = [index + 1, row.sku, row.productName, row.description, row.category, row.size, row.unitOfMeasure, [row.shelfCode, row.binCode].filter(Boolean).join(' / ')];
    if (includeSystemQuantity) cells.push(row.systemQuantity);
    cells.push('');
    if (options.includeRecount) cells.push('');
    if (options.includeNotes) cells.push('');
    cells.push('');
    return cells;
  });
  return { headers, body };
}

export async function createStocktakeWorkbook(context: StocktakeExportContext, showSystemQuantity: boolean): Promise<ExcelJS.Workbook> {
  assertStocktakePermission(context.actor.role, 'stocktake.export');
  assertSystemQuantity(context, showSystemQuantity);
  const { default: ExcelJSRuntime } = await import('exceljs');
  const workbook = new ExcelJSRuntime.Workbook();
  workbook.creator = 'iTred Commerce POS';
  workbook.created = new Date();
  const countList = workbook.addWorksheet('Count List', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = ['Line No.', 'SKU', 'Product Name', 'Description', 'Category', 'Size', 'UM', 'Location', 'Shelf', 'Bin'];
  const includeSystemQuantity = showSystemQuantity && !context.blindCountMode;
  if (includeSystemQuantity) headers.push('System Qty');
  headers.push('Physical Count', 'Recount', 'Notes', 'Count Status');
  countList.addRow(headers);
  context.rows.forEach((row, index) => {
    const values: Array<string | number> = [index + 1, row.sku, row.productName, row.description, row.category, row.size, row.unitOfMeasure, row.locationName, row.shelfCode, row.binCode];
    if (includeSystemQuantity) values.push(row.systemQuantity);
    values.push('', '', '', row.countStatus);
    countList.addRow(values);
  });
  countList.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  countList.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F242D' } };
  countList.columns = headers.map(header => ({ key: header, width: Math.min(42, Math.max(12, header.length + 3)) }));
  countList.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const instructions = workbook.addWorksheet('Instructions');
  [
    ['iTred Stocktake Count Worksheet'],
    ['Enter physical counts on the printed sheet or in a controlled draft workflow.'],
    ['This workbook does not adjust inventory and must not be imported as an inventory adjustment.'],
    [`Working Day ${context.workingDayNumber}`, context.scheduledDate],
  ].forEach(row => instructions.addRow(row));
  const reference = workbook.addWorksheet('Reference Data');
  reference.addRow(['Stock Location', context.stockLocationName]);
  reference.addRow(['Assigned Shelves', context.shelfIds.join(', ')]);
  reference.addRow(['Allowed Count Statuses', 'ASSIGNED, COUNTED, SKIPPED']);
  const metadata = workbook.addWorksheet('_Stocktake_Metadata', { state: 'veryHidden' });
  [
    ['documentType', 'ITRED_STOCKTAKE_COUNT_LIST'],
    ['schemaVersion', STOCKTAKE_SCHEMA_VERSION],
    ['cycleId', context.cycleId],
    ['workingDayNumber', context.workingDayNumber],
    ['stockLocationId', context.stockLocationId],
    ['generatedAt', new Date().toISOString()],
    ['generatedBy', context.actor.id],
    ['productCount', context.rows.length],
    ['shelfIds', context.shelfIds.join(',')],
    ['blindCountMode', context.blindCountMode],
    ['vendorId', context.vendorId],
  ].forEach(row => metadata.addRow(row));
  return workbook;
}

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function createStocktakeCsv(context: StocktakeExportContext, showSystemQuantity: boolean): string {
  assertStocktakePermission(context.actor.role, 'stocktake.export');
  assertSystemQuantity(context, showSystemQuantity);
  const headers = ['Line No.', 'SKU', 'Product Name', 'Description', 'Category', 'Size', 'UM', 'Location', 'Shelf', 'Bin'];
  const includeSystemQuantity = showSystemQuantity && !context.blindCountMode;
  if (includeSystemQuantity) headers.push('System Qty');
  headers.push('Physical Count', 'Recount', 'Notes', 'Count Status');
  const lines = [headers.map(csvCell).join(',')];
  context.rows.forEach((row, index) => {
    const values: Array<string | number> = [index + 1, row.sku, row.productName, row.description, row.category, row.size, row.unitOfMeasure, row.locationName, row.shelfCode, row.binCode];
    if (includeSystemQuantity) values.push(row.systemQuantity);
    values.push('', '', '', row.countStatus);
    lines.push(values.map(csvCell).join(','));
  });
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export async function exportStocktakeSpreadsheet(context: StocktakeExportContext, options: StocktakeSpreadsheetOptions): Promise<void> {
  assertStocktakePermission(context.actor.role, 'stocktake.export');
  if (context.rows.length === 0) throw new Error('The selected working day has no products to export.');
  const fileBase = `stocktake-day-${context.workingDayNumber}-${safeFilePart(context.stockLocationName)}`;
  if (options.format === 'CSV') {
    downloadBlob(new Blob([createStocktakeCsv(context, options.showSystemQuantity)], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`);
    return;
  }
  const workbook = await createStocktakeWorkbook(context, options.showSystemQuantity);
  const data = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase}.xlsx`);
}
