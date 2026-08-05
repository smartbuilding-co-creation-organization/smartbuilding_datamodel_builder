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

test('shows kind as a read-only Class in the Inspector', async ({ page }) => {
  await loadCsv(page);

  await page.getByTestId('grid-csv').locator('[role="row"][data-id="PT001__0"]').click();
  const inspector = page.getByTestId('inspector-panel');

  // kind isn't a column in pointlist.md-shaped CSVs, so it's synthesized
  // from the resolved class and appended last among the row's properties;
  // scroll the virtualized grid down to reach it.
  const scroller = inspector.locator('.MuiDataGrid-virtualScroller');
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  const classCell = inspector.locator('[data-id="kind"] [data-field="property"]');
  await expect(classCell).toHaveText('Class');
  const classValueCell = inspector.locator('[data-id="kind"] [data-field="value"]');
  await expect(classValueCell).toHaveText('PointExt');

  await page.getByRole('button', { name: '編集', exact: true }).click();
  await classValueCell.dblclick();
  await expect(inspector.locator('.MuiDataGrid-cell--editing')).toHaveCount(0);
});

test('shows the property description as a tooltip instead of a persistent column', async ({
  page,
}) => {
  await loadCsv(page);
  await page.getByTestId('grid-csv').locator('[role="row"][data-id="PT001__0"]').click();
  const inspector = page.getByTestId('inspector-panel');

  await expect(inspector.getByRole('columnheader', { name: '説明' })).toHaveCount(0);
  await expect(inspector.getByRole('columnheader', { name: 'プロパティ' })).toBeVisible();
  await expect(inspector.getByRole('columnheader', { name: '値' })).toBeVisible();

  // MUI sets the Tooltip's title as aria-label on the child, independent of
  // whether the visual popper is currently shown, so this checks the
  // tooltip is wired to the right content without fighting hover timing.
  const nameProperty = inspector.locator('[data-id="name"] [data-field="property"] span');
  await expect(nameProperty).toHaveAttribute('aria-label', 'Machine or Human-readable name');
});

test('highlights an Issue-referenced field even when the row never had that column', async ({
  page,
}) => {
  // point_name is entirely omitted (not just left blank), reproducing the
  // scenario where the Inspector previously had no row at all to highlight.
  await page.goto('./');
  await page.getByTestId('csv-input').setInputFiles({
    name: 'missing-point-name.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'gateway_id,device_id,device_name,device_type,site,building,floor,installation_area,' +
        'point_type,point_specification,point_id,writable,local_id\n' +
        'GW001,DEV001,Sensor 1,Sensor,Site1,Bldg1,1F,Room1,Temperature,Measurement,PT001,false,LOC001\n',
    ),
  });
  await expect(page.getByTestId('grid-csv')).toBeVisible();

  await page.getByTestId('validation-summary').click();
  const drawer = page.getByTestId('issues-drawer');
  const issue = drawer.getByText('PT001 / pointName');
  await expect(issue).toBeVisible();
  await issue.locator('xpath=following-sibling::button[contains(text(),"対象を表示")]').click();

  const inspector = page.getByTestId('inspector-panel');
  // Synthesized fields (present in the Issue but absent from the row) are
  // appended last among the row's properties; scroll down to reach it.
  const scroller = inspector.locator('.MuiDataGrid-virtualScroller');
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  const pointNameCell = inspector.locator('[data-id="pointName"] [data-field="value"]');
  await expect(pointNameCell).toBeVisible();
  await expect(pointNameCell).toHaveClass(/cell-error/);
  await expect(pointNameCell).toHaveCSS('background-color', 'rgb(251, 234, 231)');
});

test('loads the sample data cleanly and exports CSV matching the pointlist.md shape', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'サンプルデータで試す' }).click();
  await expect(page.getByTestId('tree')).toBeVisible();

  await expect(page.getByTestId('validation-summary')).toHaveText('検証OK');

  await selectFormat(page, 'CSV');
  await page.getByRole('button', { name: 'プレビュー', exact: true }).click();
  const headerLine = (await page.getByTestId('output-preview-content').innerText()).split(
    /\r?\n/,
  )[0];
  const columns = headerLine.split(',');

  expect(columns).not.toContain('kind');
  expect(columns).not.toContain('id');
  expect(columns).not.toContain('parentId');
  expect(columns).toContain('gatewayId');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();

  // regression: selecting any node below root must still scope the CSV
  // grid to that node's rows, not empty it out.
  await page.getByTestId('tree').getByText('本館', { exact: true }).click();
  await expect(page.getByTestId('grid-csv').locator('[role="row"][data-id]')).not.toHaveCount(0);
  expect(columns).toContain('pointId');
  expect(columns).toContain('pointName');
});

test('hides the serializer selector when a format has only one option', async ({ page }) => {
  await loadCsv(page);

  await selectFormat(page, 'CSV');
  await expect(page.getByTestId('output-serializer-select')).toBeHidden();

  await selectFormat(page, 'DTDL');
  await expect(page.getByTestId('output-serializer-select')).toBeVisible();
});

test('shows preview content despite blocking issues, but still blocks download', async ({
  page,
}) => {
  await loadCsv(page, invalidFixture);
  await selectFormat(page, 'RDF');

  await page.getByRole('button', { name: 'プレビュー', exact: true }).click();
  await expect(page.getByTestId('output-preview-content')).toContainText('@prefix');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();

  await page.getByRole('button', { name: 'ダウンロード', exact: true }).click();
  await expect(page.getByTestId('output-error')).toContainText('ダウンロードを中止');
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
