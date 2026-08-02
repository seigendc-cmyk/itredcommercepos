import ExcelJS from 'exceljs';
import {
  CANONICAL_PRODUCT_HEADERS,
  CanonicalProductImportRow,
  PRODUCT_IMPORT_TEMPLATE_NAME,
  PRODUCT_IMPORT_TEMPLATE_VERSION,
  ProductImportBatch,
  ProductImportError,
} from './domain';
import { validateImportRows } from './validator';

const ALLOWED_MIME: Record<string, string[]> = {
  csv: ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel', ''],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream', ''],
};

export function validateImportFile(file: Pick<File, 'name' | 'type'>): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (!(extension in ALLOWED_MIME)) return 'Only .csv and .xlsx product templates are accepted.';
  if (!ALLOWED_MIME[extension].includes((file.type || '').toLowerCase())) {
    return `The ${extension.toUpperCase()} file MIME type is not supported.`;
  }
  return null;
}

export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(values => values.some(value => value.trim() !== ''));
}

function normHeader(value: unknown): string {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLocaleLowerCase();
}

export function validateHeaders(headers: unknown[]): ProductImportError[] {
  const actual = headers.map(value => String(value ?? '').replace(/^\uFEFF/, '').trim());
  const normalized = actual.map(normHeader);
  const expected = CANONICAL_PRODUCT_HEADERS.map(normHeader);
  const errors: ProductImportError[] = [];
  const duplicates = normalized.filter((value, index) => value && normalized.indexOf(value) !== index);
  [...new Set(duplicates)].forEach(value => errors.push({ row: 1, field: actual[normalized.indexOf(value)], reason: 'Duplicate header.', code: 'DUPLICATE_HEADER' }));
  expected.forEach((header, index) => {
    if (!normalized.includes(header)) errors.push({ row: 1, field: CANONICAL_PRODUCT_HEADERS[index], reason: 'Required canonical header is missing.', code: 'MISSING_HEADER' });
    else if (normalized[index] !== header) errors.push({ row: 1, field: actual[index] || '(blank)', reason: `Expected ${CANONICAL_PRODUCT_HEADERS[index]} in position ${index + 1}.`, code: 'HEADER_ORDER' });
  });
  normalized.filter(header => !expected.includes(header)).forEach(header => errors.push({ row: 1, field: actual[normalized.indexOf(header)] || '(blank)', reason: 'Unexpected header.', code: 'UNEXPECTED_HEADER' }));
  if (actual.length !== expected.length && !errors.some(error => error.code === 'UNEXPECTED_HEADER')) {
    errors.push({ row: 1, field: 'Headers', reason: `Expected exactly ${expected.length} headers.`, code: 'HEADER_COUNT' });
  }
  return errors;
}

function optionalNumber(value: unknown): number | undefined {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  return Number(text);
}

function mapRow(values: unknown[], index: number): CanonicalProductImportRow {
  return {
    rowNumber: index + 2,
    sku: String(values[0] ?? '').trim(), name: String(values[1] ?? '').trim(),
    description: String(values[2] ?? '').trim(), category: String(values[3] ?? '').trim(),
    size: String(values[4] ?? '').trim(), costPrice: optionalNumber(values[5]),
    sellingPrice: optionalNumber(values[6]), quantity: optionalNumber(values[7]),
    unitOfMeasure: String(values[8] ?? '').trim(), locationCode: String(values[9] ?? '').trim(),
    alternativeLookupCode: String(values[10] ?? '').trim(),
    productType: String(values[11] ?? '').trim().toUpperCase() as CanonicalProductImportRow['productType'],
    barcode: String(values[12] ?? '').trim(), shelfCode: String(values[13] ?? '').trim(),
    binCode: String(values[14] ?? '').trim(), reorderLevel: optionalNumber(values[15]),
    errors: [], warnings: [],
  };
}

export function parseCanonicalMatrix(matrix: unknown[][], fileName: string, validLocationCodes: string[], templateVersion?: string): ProductImportBatch {
  const batchId = `product-import-${crypto.randomUUID()}`;
  const headers = (matrix[0] || []).map(String);
  const errors = validateHeaders(headers);
  if (templateVersion && templateVersion !== PRODUCT_IMPORT_TEMPLATE_VERSION) {
    errors.push({ row: 1, field: 'templateVersion', reason: `Unsupported template version ${templateVersion}.`, code: 'UNSUPPORTED_TEMPLATE_VERSION' });
  }
  if (errors.length) return { batchId, fileName, headers, rows: [], errors, templateVersion };
  const rows = matrix.slice(1).filter(row => row.some(value => String(value ?? '').trim())).map(mapRow);
  validateImportRows(rows, validLocationCodes);
  return { batchId, fileName, headers, rows, errors: rows.flatMap(row => row.errors), templateVersion };
}

export async function parseProductImportFile(file: File, validLocationCodes: string[]): Promise<ProductImportBatch> {
  const rejection = validateImportFile(file);
  if (rejection) throw new Error(rejection);
  if (file.name.toLowerCase().endsWith('.csv')) return parseCanonicalMatrix(parseCsv(await file.text()), file.name, validLocationCodes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer() as any);
  const products = workbook.getWorksheet('Products');
  if (!products) throw new Error('The XLSX template must contain a Products sheet.');
  const metadataSheet = workbook.getWorksheet('_Template_Metadata');
  let version: string | undefined;
  if (metadataSheet) {
    const values = new Map<string, string>();
    metadataSheet.eachRow(row => values.set(row.getCell(1).text, row.getCell(2).text));
    if (values.get('templateName') !== PRODUCT_IMPORT_TEMPLATE_NAME) throw new Error('The workbook is not an iTred product import template.');
    version = values.get('templateVersion');
  }
  const matrix: string[][] = [];
  products.eachRow({ includeEmpty: false }, row => matrix.push(Array.from({ length: CANONICAL_PRODUCT_HEADERS.length }, (_, index) => row.getCell(index + 1).text)));
  return parseCanonicalMatrix(matrix, file.name, validLocationCodes, version);
}
