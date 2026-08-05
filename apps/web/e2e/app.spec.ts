import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const validFixture = path.resolve(__dirname, '../../../packages/fixtures/valid.csv');
const invalidFixture = path.resolve(__dirname, '../../../packages/fixtures/invalid.csv');

async function loadCsv(page: Page, fixture = validFixture) {
  page.on('pageerror', (error) => console.error(`pageerror: ${error.message}`));
  await page.goto('./');
  await page.getByTestId('csv-input').setInputFiles(fixture);
  await expect(page.getByTestId('tree')).toBeVisible();
  await expect(page.getByTestId('grid-csv')).toBeVisible();
}

async function selectFormat(page: Page, format: string) {
  await page.getByTestId('output-format-select').getByRole('combobox').click();
  await page.getByRole('option', { name: format, exact: true }).click();
}

test('shows the onboarding screen on a fresh visit and can proceed to the sample data', async ({
  page,
}) => {
  await page.goto('./');

  await expect(page.getByRole('heading', { name: /建物のデータモデルを/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'サンプルデータで試す' })).toBeVisible();
  await expect(page.getByTestId('csv-input')).toBeAttached();

  await page.getByRole('button', { name: 'CSV仕様を見る' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('CSV仕様');
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: 'サンプルデータで試す' }).click();
  await expect(page.getByTestId('tree')).toBeVisible();
  await expect(page.getByTestId('grid-csv')).toBeVisible();
  await expect(page.getByRole('heading', { name: /建物のデータモデルを/ })).toBeHidden();
});

test('loads CSV under the Pages subpath and exposes every column in the virtualized grid', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1') externalRequests.push(request.url());
  });
  await loadCsv(page);

  await expect(page.getByTestId('tree-item-site:site-1')).toBeVisible();
  await expect(page.getByTestId('tree-item-building:site:site-1/bldg-1')).toBeVisible();
  await expect(page.getByTestId('grid-csv').getByRole('grid')).toHaveAttribute(
    'aria-colcount',
    '30',
  );

  await page.getByTestId('grid-search').fill('Room 201');
  await expect(page.getByTestId('grid-csv').locator('[role="row"][data-id]')).toHaveCount(1);
  expect(externalRequests).toEqual([]);
});

test('edits through DataGrid and preserves Tree selection and expansion after rebuild', async ({
  page,
}) => {
  await loadCsv(page);

  const floor = page.getByTestId('tree-item-level:building:site:site-1/bldg-1/floor-1');
  await floor
    .locator('xpath=ancestor::*[@role="treeitem"][1]')
    .locator('.MuiTreeItem-iconContainer')
    .click();
  const room = page.getByTestId(
    'tree-item-room:level:building:site:site-1/bldg-1/floor-1/Room-101',
  );
  await expect(room).toBeVisible();

  await page.getByTestId('grid-csv').locator('[role="row"][data-id="PT001__0"]').click();
  await page.getByRole('button', { name: '編集', exact: true }).click();
  const nameCell = page
    .getByTestId('inspector-panel')
    .locator('[role="row"][data-id="name"] [role="gridcell"][data-field="value"]');
  await nameCell.dblclick();
  const editor = nameCell.locator('input');
  await editor.fill('Room Temperature Updated');
  await editor.press('Enter');

  await expect(nameCell).toContainText('Room Temperature Updated');
  await expect(room).toBeVisible();
});

test('downloads RDF, YAML, DTDL, and WoT through the async output registry', async ({ page }) => {
  await loadCsv(page);

  for (const format of ['RDF', 'YAML', 'DTDL', 'WoT']) {
    await selectFormat(page, format);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'ダウンロード', exact: true }).click();
    const download = await downloadPromise;
    const outputPath = test.info().outputPath(`${format}-${download.suggestedFilename()}`);
    await download.saveAs(outputPath);
    expect((await fs.readFile(outputPath)).byteLength).toBeGreaterThan(10);
  }
});

test('blocks download and opens Issue Drawer when SHACL validation fails', async ({ page }) => {
  await loadCsv(page, invalidFixture);
  await selectFormat(page, 'RDF');
  await page.getByRole('button', { name: 'ダウンロード', exact: true }).click();

  await expect(page.getByTestId('output-error')).toContainText('ダウンロードを中止');
  await expect(page.getByTestId('issues-drawer')).toBeVisible();
});

test('highlights the missing field an Issue points to and shows kind as a read-only Class', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'サンプルデータで試す' }).click();

  await page.getByTestId('validation-summary').click();
  const drawer = page.getByTestId('issues-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer).not.toContainText("received 'room'");

  const issue = drawer.getByText('pt-A101-temp / pointName');
  await issue.locator('xpath=following-sibling::button[contains(text(),"対象を表示")]').click();

  const inspector = page.getByTestId('inspector-panel');

  // The kind/Class row sits near the top, before any scrolling.
  const classCell = inspector.locator('[data-id="kind"] [data-field="property"]');
  await expect(classCell).toHaveText('Class');
  const classValueCell = inspector.locator('[data-id="kind"] [data-field="value"]');
  await expect(classValueCell).toHaveText('PointExt');

  // The virtualized grid only renders rows near the viewport; scroll to
  // reach pointName, which sits further down the property list.
  const scroller = inspector.locator('.MuiDataGrid-virtualScroller');
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  const pointNameCell = inspector.locator('[data-id="pointName"] [data-field="value"]');
  await expect(pointNameCell).toBeVisible();
  await expect(pointNameCell).toHaveClass(/cell-error/);
  await expect(pointNameCell).toHaveCSS('background-color', 'rgb(251, 234, 231)');

  await page.getByRole('button', { name: '編集', exact: true }).click();
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await classValueCell.dblclick();
  await expect(inspector.locator('.MuiDataGrid-cell--editing')).toHaveCount(0);
});

test('rejects over-limit input atomically and keeps the existing model', async ({ page }) => {
  await loadCsv(page);
  await expect(page.getByTestId('grid-csv').locator('[role="row"][data-id]')).toHaveCount(5);

  await page.getByTestId('csv-input').setInputFiles({
    name: 'too-large.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`id,name\n1,${'x'.repeat(5 * 1024 * 1024)}\n`),
  });

  await expect(page.getByTestId('csv-input-error')).toContainText('5 MiB');
  await expect(page.getByTestId('grid-csv').locator('[role="row"][data-id]')).toHaveCount(5);
});

test('shows generated device templates', async ({ page }) => {
  await loadCsv(page);
  await page.getByTestId('view-templates').click();
  await expect(page.getByTestId('templates-view')).toBeVisible();
  await expect(page.getByTestId('template-item-Sensor')).toBeVisible();
  await page.getByTestId('template-item-Sensor').click();
  await expect(page.getByTestId('template-properties-grid')).toBeVisible();
});
