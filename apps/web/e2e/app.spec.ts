import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('upload csv, filter tree, edit and export', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../packages/fixtures/valid.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  const siteItem = page.getByTestId('tree-item-site:site-1');
  await expect(siteItem).toBeVisible();
  await siteItem.click();
  await page.keyboard.press('ArrowRight');

  const buildingItem = page.getByTestId('tree-item-building:site:site-1/bldg-1');
  await expect(buildingItem).toBeVisible();
  await buildingItem.click();

  const gridRows = page.getByTestId('grid-csv').locator('.MuiDataGrid-row');
  await expect(gridRows).toHaveCount(4);

  await buildingItem.click();
  await page.keyboard.press('ArrowRight');

  const floorItem = page.getByTestId('tree-item-level:building:site:site-1/bldg-1/floor-1');
  await expect(floorItem).toBeVisible();
  await floorItem.click();
  await page.keyboard.press('ArrowRight');

  const spaceItem = page.getByTestId(
    'tree-item-room:level:building:site:site-1/bldg-1/floor-1/Room-101',
  );
  await expect(spaceItem).toBeVisible();
  await spaceItem.click();

  await page.getByTestId('mode-model').click();
  const modelGrid = page.getByTestId('grid-model');
  await expect(modelGrid).toBeVisible();
  await expect(
    modelGrid.locator('[data-field="description"]').getByText(
      'Machine or Human-readable name',
    ),
  ).toBeVisible();

  const cell = modelGrid.getByRole('gridcell', { name: 'Room 101' }).first();
  await cell.dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Room 101A');
  await page.keyboard.press('Enter');
  await expect(modelGrid.getByRole('gridcell', { name: 'Room 101A' }).first()).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('csv-export-button').click();
  const download = await downloadPromise;
  const outputPath = test.info().outputPath('export.csv');
  await download.saveAs(outputPath);
  const text = await fs.readFile(outputPath, 'utf-8');
  await expect(text).toContain('Room 101A');

  await page.getByTestId('output-format-select').click();
  await page.getByRole('option', { name: 'RDF' }).click();
  await page.getByTestId('output-serializer-select').click();
  await page.getByRole('option', { name: 'Turtle' }).click();
  const rdfDownloadPromise = page.waitForEvent('download');
  await page.getByTestId('output-export-button').click();
  const rdfDownload = await rdfDownloadPromise;
  const rdfPath = test.info().outputPath('export.ttl');
  await rdfDownload.saveAs(rdfPath);
  const rdfText = await fs.readFile(rdfPath, 'utf-8');
  await expect(rdfText).toContain('Room 101A');

  await page.getByTestId('output-format-select').click();
  await page.getByRole('option', { name: 'YAML' }).click();
  await page.getByTestId('output-serializer-select').click();
  await page.getByRole('option', { name: 'YAML' }).click();
  const yamlDownloadPromise = page.waitForEvent('download');
  await page.getByTestId('output-export-button').click();
  const yamlDownload = await yamlDownloadPromise;
  const yamlPath = test.info().outputPath('export.yaml');
  await yamlDownload.saveAs(yamlPath);
  const yamlText = await fs.readFile(yamlPath, 'utf-8');
  await expect(yamlText).toContain('Room 101A');
});

test('rebuilds tree when hierarchy signal edits are committed', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../sample/debug-sample.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  const tree = page.getByTestId('tree');
  const siteItem = tree.getByText('TokyoSite1');
  await expect(siteItem).toBeVisible();
  await siteItem.click();
  await page.keyboard.press('ArrowRight');

  const buildingItem = tree.getByText('MainBldg');
  await expect(buildingItem).toBeVisible();
  await buildingItem.click();
  await page.keyboard.press('ArrowRight');

  const levelItem = tree.getByText('3F');
  await expect(levelItem).toBeVisible();
  await levelItem.click();
  await page.keyboard.press('ArrowRight');

  const roomItem = tree.getByText('Room101');
  await expect(roomItem).toBeVisible();
  await roomItem.click();
  await page.keyboard.press('ArrowRight');

  const deviceItem = tree.getByText('Temperature Sensor 01');
  await expect(deviceItem).toBeVisible();
  await deviceItem.click();
  await page.keyboard.press('ArrowRight');

  const pointItem = tree.getByText('Room Temperature');
  await expect(pointItem).toBeVisible();
  await pointItem.click();

  await page.getByTestId('mode-model').click();
  const modelGrid = page.getByTestId('grid-model');
  await expect(modelGrid).toBeVisible();

  const buildingRow = modelGrid
    .locator('[data-field="property"]')
    .getByText('building')
    .locator('xpath=ancestor::div[@role="row"][1]');
  const buildingCell = buildingRow.locator('[data-field="value"]').getByText('MainBldg');
  await buildingCell.dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('MainBldg-2');
  await page.keyboard.press('Enter');

  await expect(tree.getByText('MainBldg-2')).toBeVisible();
  await expect(page.getByText('選択: Room Temperature')).toBeVisible();
});

test('shows hierarchy validation errors when parent signals are missing', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../sample/debug-sample.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  const tree = page.getByTestId('tree');
  const siteItem = tree.getByText('TokyoSite1');
  await expect(siteItem).toBeVisible();
  await siteItem.click();
  await page.keyboard.press('ArrowRight');
  const buildingItem = tree.getByText('MainBldg');
  await expect(buildingItem).toBeVisible();
  await buildingItem.click();
  await page.keyboard.press('ArrowRight');
  const levelItem = tree.getByText('3F');
  await expect(levelItem).toBeVisible();
  await levelItem.click();
  await page.keyboard.press('ArrowRight');
  const roomItem = tree.getByText('Room101');
  await expect(roomItem).toBeVisible();
  await roomItem.click();
  await page.keyboard.press('ArrowRight');
  const deviceItem = tree.getByText('Temperature Sensor 01');
  await expect(deviceItem).toBeVisible();
  await deviceItem.click();
  await page.keyboard.press('ArrowRight');
  const pointItem = tree.getByText('Room Temperature');
  await expect(pointItem).toBeVisible();
  await pointItem.click();

  await page.getByTestId('mode-model').click();
  const modelGrid = page.getByTestId('grid-model');
  await expect(modelGrid).toBeVisible();

  const buildingRow = modelGrid
    .locator('[data-field="property"]')
    .getByText('building')
    .locator('xpath=ancestor::div[@role="row"][1]');
  const buildingCell = buildingRow.locator('[data-field="value"]').getByText('MainBldg');
  await buildingCell.dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');

  const summary = page.getByTestId('validation-summary');
  await expect(summary).toContainText('Hierarchy parent missing: building');
});

test('can expand and collapse tree items', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../packages/fixtures/valid.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  const siteItem = page.getByTestId('tree-item-site:site-1');
  await expect(siteItem).toBeVisible();

  const floorItem = page.getByTestId('tree-item-level:building:site:site-1/bldg-1/floor-1');
  await expect(floorItem).toHaveCount(0);

  await siteItem.click();
  await page.keyboard.press('ArrowRight');
  const buildingItem = page.getByTestId('tree-item-building:site:site-1/bldg-1');
  await expect(buildingItem).toBeVisible();

  const buildingTreeItem = buildingItem.locator('xpath=ancestor::*[@role="treeitem"][1]');
  const buildingToggle = buildingTreeItem.locator(
    ':scope > .MuiTreeItem-content > .MuiTreeItem-iconContainer',
  );
  await buildingToggle.click();
  await expect(floorItem).toHaveCount(1);

  await expect(buildingTreeItem).toHaveAttribute('aria-expanded', 'true');

  await buildingToggle.click();
  await expect(buildingTreeItem).toHaveAttribute('aria-expanded', 'false');
  await expect(floorItem).toHaveCount(0);
});

test('shows validation summary for invalid csv', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../packages/fixtures/invalid.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  const summary = page.getByTestId('validation-summary');
  await expect(summary).toContainText('バリデーションエラー');
  await expect(summary).toContainText('Duplicate id: PT001');

  const errorRows = page.getByTestId('grid-csv').locator('.row-error');
  expect(await errorRows.count()).toBeGreaterThan(0);
});

test('filters grid rows by search term', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../packages/fixtures/valid.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  const searchInput = page.getByTestId('grid-search');
  await searchInput.fill('Room 201');

  const gridRows = page.getByTestId('grid-csv').locator('.MuiDataGrid-row');
  await expect(gridRows).toHaveCount(1);
});
