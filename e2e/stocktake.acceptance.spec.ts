import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

const evidenceDir = path.resolve('docs/qa/stocktake-browser');
const VENDOR_ID = 'qa-stocktake-browser-tenant';
const evidence = (name: string) => path.join(evidenceDir, name);

async function selectDay(page: import('@playwright/test').Page, day: number) {
  await page.getByRole('button', { name: new RegExp(`^Working Day ${day},`) }).click();
}

async function setCount(page: import('@playwright/test').Page, sku: string, quantity: string) {
  await page.getByLabel(`Physical count for ${sku}`, { exact: true }).fill(quantity);
  await page.getByLabel(`Variance reason for ${sku}`, { exact: true }).selectOption({ label: 'System Data Entry Error' });
}

async function downloadFromDialog(page: import('@playwright/test').Page, openButton: string, downloadButton: string, target: string) {
  await page.getByRole('button', { name: openButton }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: downloadButton }).click();
  const download = await downloadPromise;
  await download.saveAs(target);
  await expect.poll(async () => (await fs.stat(target)).size).toBeGreaterThan(100);
}

test.beforeAll(async () => fs.mkdir(evidenceDir, { recursive: true }));

test('authenticated stocktake day lists, drafts, exports, permissions and approvals', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?qa=stocktake');
  await expect(page.getByTestId('qa-authenticated-fixture')).toBeVisible();
  await expect(page.getByTestId('qa-active-identity')).toContainText('QA Stock Counter');

  const header = page.getByTestId('stocktake-sticky-header');
  await expect(header).toBeVisible();
  await page.screenshot({ path: evidence('sticky-header-desktop.png'), fullPage: false });
  await page.evaluate(() => window.scrollTo(0, 180));
  await expect.poll(async () => Math.round((await header.boundingBox())?.y ?? -1)).toBe(0);
  const headerX = (await header.boundingBox())?.x;
  const tableScroller = page.locator('table').locator('..');
  await tableScroller.evaluate(element => { element.scrollLeft = 700; });
  expect((await header.boundingBox())?.x).toBe(headerX);
  await expect(page.getByTestId('stocktake-submit-header')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Approvals Queue' }).first()).toBeVisible();

  await page.setViewportSize({ width: 820, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 180));
  await page.screenshot({ path: evidence('sticky-header-tablet.png'), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(async () => Math.round((await header.boundingBox())?.y ?? -1)).toBe(52);
  await page.screenshot({ path: evidence('sticky-header-mobile.png'), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));

  await selectDay(page, 1);
  const day1 = page.getByRole('button', { name: /^Working Day 1,/ });
  await expect(day1).toHaveClass(/bg-\[#FF6600\]/);
  await expect(page.getByText('QA Product alpha', { exact: true })).toBeVisible();
  await expect(page.getByText('QA Product beta', { exact: true })).toHaveCount(0);
  await expect(page.getByText('QA Product archived', { exact: true })).toHaveCount(0);
  await expect(page.getByText('QA Product service', { exact: true })).toHaveCount(0);
  await expect(page.getByText('QA Product noninventory', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Shelf 01 / BIN-ALPHA', { exact: true })).toBeVisible();
  await page.screenshot({ path: evidence('selected-working-day.png'), fullPage: false });
  await selectDay(page, 2);
  await expect(page.getByText('QA Product beta', { exact: true })).toBeVisible();
  await expect(page.getByText('QA Product alpha', { exact: true })).toHaveCount(0);
  await selectDay(page, 3);
  await expect(page.getByText('QA Product gamma', { exact: true })).toBeVisible();
  await selectDay(page, 5);
  await expect(page.getByText('No products are assigned to Working Day 5 for the selected location.')).toBeVisible();

  await selectDay(page, 1);
  await setCount(page, 'QA-ALPHA', '9');
  await expect(header).toContainText('In Progress');
  await selectDay(page, 2);
  const unsavedDialog = page.getByRole('dialog', { name: 'Unsaved stocktake counts' });
  await expect(unsavedDialog).toBeVisible();
  await unsavedDialog.screenshot({ path: evidence('unsaved-change-dialog.png') });
  await page.getByRole('button', { name: 'Stay on Current Day' }).click();
  await expect(day1).toHaveClass(/bg-\[#FF6600\]/);
  await selectDay(page, 2);
  await page.getByRole('button', { name: 'Save Draft and Continue' }).click();
  await expect(page.getByText('QA Product beta', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Physical count for QA-ALPHA', { exact: true })).toHaveValue('9');
  await expect(header).toContainText('Draft Saved');
  await selectDay(page, 2);
  await setCount(page, 'QA-BETA', '7');
  await selectDay(page, 3);
  await page.getByRole('button', { name: 'Discard Changes' }).click();
  await selectDay(page, 2);
  await expect(page.getByLabel('Physical count for QA-BETA')).toHaveValue('');

  await selectDay(page, 1);
  await page.getByRole('button', { name: 'Print Count List' }).click();
  await page.getByRole('dialog', { name: 'Print Count List' }).screenshot({ path: evidence('pdf-options.png') });
  const blindDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  await (await blindDownload).saveAs(evidence('stocktake-blind-complete.pdf'));

  await page.getByPlaceholder('Search SKU, product name or shelf').fill('alpha');
  await page.getByRole('button', { name: 'Print Count List' }).click();
  await page.getByText('Current Filtered View').click();
  const filteredDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  await (await filteredDownload).saveAs(evidence('stocktake-filtered.pdf'));
  await page.getByPlaceholder('Search SKU, product name or shelf').fill('');

  await page.getByRole('button', { name: 'Print Count List' }).click();
  await page.getByText('Blind Count', { exact: true }).click();
  await page.getByText('Show System Quantity', { exact: true }).click();
  const systemDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  await (await systemDownload).saveAs(evidence('stocktake-system-quantity.pdf'));
  for (const file of ['stocktake-blind-complete.pdf', 'stocktake-filtered.pdf', 'stocktake-system-quantity.pdf']) expect((await fs.stat(evidence(file))).size).toBeGreaterThan(1_000);

  const pdfPage = await context.newPage();
  for (const file of ['stocktake-blind-complete.pdf', 'stocktake-filtered.pdf', 'stocktake-system-quantity.pdf']) {
    await pdfPage.goto(`file:///${evidence(file).replaceAll('\\', '/')}`);
    expect(decodeURIComponent(pdfPage.url())).toContain(file);
  }
  await pdfPage.screenshot({ path: evidence('pdf-output.png') });
  await pdfPage.close();

  await downloadFromDialog(page, 'Export Spreadsheet', 'Export XLSX', evidence('stocktake-day1.xlsx'));
  await downloadFromDialog(page, 'Export Spreadsheet', 'Export CSV', evidence('stocktake-day1.csv'));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await fs.readFile(evidence('stocktake-day1.xlsx')));
  expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['Count List', 'Instructions', 'Reference Data', '_Stocktake_Metadata']);
  expect(workbook.getWorksheet('_Stocktake_Metadata')?.state).toBe('veryHidden');
  expect(workbook.getWorksheet('Count List')?.rowCount).toBe(3);
  const xlsxHeaders = workbook.getWorksheet('Count List')?.getRow(1).values as string[];
  expect(xlsxHeaders).not.toContain('Cost'); expect(xlsxHeaders).not.toContain('Valuation');
  const metadata = workbook.getWorksheet('_Stocktake_Metadata');
  expect(metadata?.getCell('B1').value).toBe('ITRED_STOCKTAKE_COUNT_LIST');
  expect(metadata?.getCell('B4').value).toBe(1);
  await page.screenshot({ path: evidence('xlsx-verification.png'), fullPage: false });
  const csv = await fs.readFile(evidence('stocktake-day1.csv'), 'utf8');
  expect(csv).toContain('"Line No.","SKU","Product Name","Description","Category","Size","UM","Location","Shelf","Bin"');
  expect(csv).toContain('QA-ALPHA'); expect(csv).not.toContain('QA-BETA'); expect(csv).not.toContain('Cost');

  await page.getByLabel('QA role').selectOption('no_export');
  await expect(page.getByText('You do not have permission to view or export this stocktake list.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export Spreadsheet' })).toHaveCount(0);
  const probes = JSON.parse(await page.getByTestId('qa-permission-probes').textContent() || '[]');
  expect(probes).toHaveLength(10); expect(probes.every((probe: { denied: boolean }) => probe.denied)).toBe(true);
  await page.screenshot({ path: evidence('permission-denial.png'), fullPage: false });

  await page.getByLabel('QA role').selectOption('counter');
  await selectDay(page, 1);
  await expect(page.getByLabel('Physical count for QA-ALPHA', { exact: true })).toHaveValue('9');
  await page.getByLabel('Physical count for QA-ALPHA2', { exact: true }).fill('6');
  await expect(header).toContainText('Ready For Review');
  await page.getByTestId('stocktake-submit-header').click();
  await page.getByRole('button', { name: 'Submit Once' }).click();
  await expect(header).toContainText('Submitted');
  await page.getByRole('button', { name: 'Approvals Queue' }).first().click();
  await expect(page.getByTestId('qa-approval-request')).toHaveCount(1);
  await page.screenshot({ path: evidence('pending-approval.png'), fullPage: false });
  await page.getByText('QA evidence state', { exact: true }).click();
  await page.getByTestId('qa-retry-submission').click();
  await expect(page.getByTestId('qa-approval-request')).toHaveCount(1);
  let state = JSON.parse(await page.getByTestId('qa-evidence-state').textContent() || '{}');
  expect(state.stock.alpha).toBe(10); expect(state.movements).toHaveLength(0);

  await page.getByLabel('QA role').selectOption('no_approval');
  await page.getByRole('button', { name: 'Approvals Queue' }).last().click();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await page.getByLabel('QA role').selectOption('manager');
  await page.getByRole('button', { name: 'Approvals Queue' }).last().click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByTestId('qa-approval-request')).toContainText('APPROVED');
  await page.getByRole('button', { name: 'Stocktake' }).click();
  await expect(header).toContainText('Approved');
  await page.screenshot({ path: evidence('approved-adjustment.png'), fullPage: false });
  await page.getByRole('button', { name: 'Approvals Queue' }).last().click();
  await page.getByRole('button', { name: 'Post Approved Adjustment' }).click();
  await page.getByRole('button', { name: 'Post Approved Adjustment' }).click({ force: true });
  state = JSON.parse(await page.getByTestId('qa-evidence-state').textContent() || '{}');
  expect(state.stock.alpha).toBe(9); expect(state.movements).toHaveLength(1);
  expect(state.movements[0]).toMatchObject({ before: 10, delta: -1, after: 9 });
  expect(state.audit.map((item: { status: string }) => item.status)).toEqual(expect.arrayContaining(['PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'COMPLETED']));
  await page.getByRole('button', { name: 'Stocktake' }).click();
  await expect(header).toContainText('Completed');

  await page.getByLabel('QA role').selectOption('counter');
  await selectDay(page, 2);
  await setCount(page, 'QA-BETA', '7');
  await page.getByTestId('stocktake-submit-header').click();
  await page.getByRole('button', { name: 'Submit Once' }).click();
  await page.getByLabel('QA role').selectOption('manager');
  await page.getByRole('button', { name: 'Approvals Queue' }).last().click();
  const day2Request = page.getByTestId('qa-approval-request').filter({ hasText: 'Working Day 2' });
  await day2Request.getByRole('button', { name: 'Reject' }).click();
  await expect(day2Request).toContainText('REJECTED');
  await page.screenshot({ path: evidence('rejected-adjustment.png'), fullPage: false });
  state = JSON.parse(await page.getByTestId('qa-evidence-state').textContent() || '{}');
  expect(state.stock.beta).toBe(8); expect(state.movements).toHaveLength(1);
  expect(state.audit.some((item: { status: string; reason?: string }) => item.status === 'REJECTED' && item.reason === 'QA recount required.')).toBe(true);
  await page.getByRole('button', { name: 'Stocktake' }).click();
  await selectDay(page, 2);
  await expect(header).toContainText('Rejected');

  state = JSON.parse(await page.getByTestId('qa-evidence-state').textContent() || '{}');
  const contextualEvents = state.biEvents.filter((item: { details: Record<string, unknown> }) => item.details.cycleId);
  expect(contextualEvents.length).toBeGreaterThanOrEqual(10);
  for (const event of contextualEvents) {
    expect(event.details).toEqual(expect.objectContaining({ tenantId: VENDOR_ID, actorId: expect.any(String), cycleId: expect.any(String), workingDayNumber: expect.any(Number), stockLocationId: 'qa-warehouse', shelfIds: expect.any(Array), productCount: expect.any(Number), outcome: expect.any(String), correlationId: expect.any(String), timestamp: expect.any(String) }));
  }
  const exportEvents = contextualEvents.filter((item: { details: Record<string, unknown> }) => item.details.exportFormat);
  expect(exportEvents.map((item: { details: { exportFormat: string } }) => item.details.exportFormat)).toEqual(expect.arrayContaining(['PDF', 'XLSX', 'CSV']));
});
