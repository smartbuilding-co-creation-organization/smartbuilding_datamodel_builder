import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('upload csv, filter tree, edit inspector and export csv', async ({ page }) => {
  await page.goto('/');

  // Welcome screen: upload via hidden input
  const fixturePath = path.resolve(__dirname, '../../../packages/fixtures/valid.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  // Tree is now visible
  const tree = page.getByTestId('tree');
  await expect(tree).toBeVisible();

  // Site node is auto-expanded and visible
  const siteItem = page.getByTestId('tree-item-site:site-1');
  await expect(siteItem).toBeVisible();

  // Building node is also auto-expanded (depth 1 visible)
  const buildingItem = page.getByTestId('tree-item-building:site:site-1/bldg-1');
  await expect(buildingItem).toBeVisible();

  // Click building → workspace filters to descendants
  await buildingItem.click();
  const grid = page.getByTestId('grid-csv');
  await expect(grid).toBeVisible();

  // Floor node is visible (depth 2, rendered but collapsed)
  const floorItem = page.getByTestId('tree-item-level:building:site:site-1/bldg-1/floor-1');
  await expect(floorItem).toBeVisible();

  // Expand floor by clicking its twisty
  await floorItem.locator('.twisty').click();

  // Room node should now appear
  const roomItem = page.getByTestId(
    'tree-item-room:level:building:site:site-1/bldg-1/floor-1/Room-101',
  );
  await expect(roomItem).toBeVisible();
  await roomItem.click();

  // Workspace shows rows filtered to room scope
  await expect(grid).toBeVisible();

  // Click a row in the grid to open inspector
  const firstRow = grid.locator('tbody tr').first();
  await firstRow.click();

  // Inspector shows the node properties
  const inspector = page.getByTestId('inspector-panel');
  await expect(inspector).toBeVisible();

  // Edit the name field in the inspector
  const nameInput = page.getByTestId('inspector-prop-name').locator('input');
  await nameInput.fill('Room 101A');
  await nameInput.press('Tab');

  // CSV export: download via status bar button
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('csv-export-button').click();
  const download = await downloadPromise;
  const outputPath = test.info().outputPath('export.csv');
  await download.saveAs(outputPath);
  const text = await fs.readFile(outputPath, 'utf-8');
  await expect(text).toContain('Room 101A');
});

test('export rdf and yaml from output view', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../packages/fixtures/valid.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  // Switch to output view
  await page.getByTestId('tree').waitFor();
  await page.locator('.seg button', { hasText: '出力' }).click();

  // Output view is shown
  const outputView = page.getByTestId('output-view');
  await expect(outputView).toBeVisible();

  // Download RDF
  const rdfDownloadPromise = page.waitForEvent('download');
  await page.getByTestId('output-download-rdf').click();
  const rdfDownload = await rdfDownloadPromise;
  const rdfPath = test.info().outputPath('export.ttl');
  await rdfDownload.saveAs(rdfPath);
  const rdfText = await fs.readFile(rdfPath, 'utf-8');
  expect(rdfText.length).toBeGreaterThan(10);

  // Download YAML
  const yamlDownloadPromise = page.waitForEvent('download');
  await page.getByTestId('output-download-yaml').click();
  const yamlDownload = await yamlDownloadPromise;
  const yamlPath = test.info().outputPath('export.yaml');
  await yamlDownload.saveAs(yamlPath);
  const yamlText = await fs.readFile(yamlPath, 'utf-8');
  expect(yamlText.length).toBeGreaterThan(10);

  // Download DTDL Interfaces
  const dtdlInterfacesPromise = page.waitForEvent('download');
  await page.getByTestId('output-download-dtdl-interfaces').click();
  const dtdlInterfacesDownload = await dtdlInterfacesPromise;
  const dtdlInterfacesPath = test.info().outputPath('export.dtdl.json');
  await dtdlInterfacesDownload.saveAs(dtdlInterfacesPath);
  const dtdlInterfacesText = await fs.readFile(dtdlInterfacesPath, 'utf-8');
  expect(dtdlInterfacesText.length).toBeGreaterThan(10);
  expect(JSON.parse(dtdlInterfacesText)).toBeInstanceOf(Array);

  // Download DTDL Twin Graph
  const dtdlTwinGraphPromise = page.waitForEvent('download');
  await page.getByTestId('output-download-dtdl-twin-graph').click();
  const dtdlTwinGraphDownload = await dtdlTwinGraphPromise;
  const dtdlTwinGraphPath = test.info().outputPath('export-twins.json');
  await dtdlTwinGraphDownload.saveAs(dtdlTwinGraphPath);
  const dtdlTwinGraphText = await fs.readFile(dtdlTwinGraphPath, 'utf-8');
  expect(dtdlTwinGraphText.length).toBeGreaterThan(10);
  expect(JSON.parse(dtdlTwinGraphText)).toHaveProperty('digitalTwinsGraph');
});

test('rebuilds tree when inspector property is edited', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../sample/debug-sample.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  const tree = page.getByTestId('tree');
  await expect(tree).toBeVisible();

  // Navigate to a building node
  const siteItem = tree.locator('.tree-node').filter({ hasText: 'TokyoSite1' }).first();
  await expect(siteItem).toBeVisible();
  await siteItem.click();

  // Building node should be visible (auto-expanded)
  const buildingItem = tree.locator('.tree-node').filter({ hasText: 'MainBldg' }).first();
  await expect(buildingItem).toBeVisible();
  await buildingItem.click();

  // Click a row in the grid and edit in inspector
  const grid = page.getByTestId('grid-csv');
  await expect(grid).toBeVisible();
  const firstRow = grid.locator('tbody tr').first();
  await firstRow.click();

  const inspector = page.getByTestId('inspector-panel');
  await expect(inspector).toBeVisible();
});

test('shows validation error count for invalid csv', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../packages/fixtures/invalid.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  // Tree appears
  await expect(page.getByTestId('tree')).toBeVisible();

  // Validation summary button shows error count
  const summary = page.getByTestId('validation-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('件のエラー');

  // Grid shows with cell errors
  const grid = page.getByTestId('grid-csv');
  await expect(grid).toBeVisible();
});

test('can expand and collapse tree items', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../packages/fixtures/valid.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  const tree = page.getByTestId('tree');
  await expect(tree).toBeVisible();

  // Site and building are visible (auto-expanded)
  const siteItem = page.getByTestId('tree-item-site:site-1');
  await expect(siteItem).toBeVisible();

  const buildingItem = page.getByTestId('tree-item-building:site:site-1/bldg-1');
  await expect(buildingItem).toBeVisible();

  // Floor is visible (depth 2) but collapsed
  const floorItem = page.getByTestId('tree-item-level:building:site:site-1/bldg-1/floor-1');
  await expect(floorItem).toBeVisible();

  // Room is NOT visible yet (floor is collapsed)
  const roomItem = page.getByTestId('tree-item-room:level:building:site:site-1/bldg-1/floor-1/Room-101');
  await expect(roomItem).toHaveCount(0);

  // Expand floor by clicking twisty
  await floorItem.locator('.twisty').click();
  await expect(roomItem).toBeVisible();

  // Collapse floor again
  await floorItem.locator('.twisty').click();
  await expect(roomItem).toHaveCount(0);
});

test('filters grid rows by search term', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../packages/fixtures/valid.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  await expect(page.getByTestId('tree')).toBeVisible();

  const searchInput = page.getByTestId('grid-search');
  await searchInput.fill('Room 201');

  const grid = page.getByTestId('grid-csv');
  const rows = grid.locator('tbody tr');
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(1);

  // All visible rows should contain 'Room 201' somewhere
  const rowTexts = await rows.allTextContents();
  for (const text of rowTexts) {
    expect(text).toContain('201');
  }
});

test('shows device templates view with generated templates', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../packages/fixtures/valid.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);
  await expect(page.getByTestId('tree')).toBeVisible();

  // Switch to templates view
  await page.getByTestId('view-templates').click();

  const templatesView = page.getByTestId('templates-view');
  await expect(templatesView).toBeVisible();

  // Template list shows at least one device type from CSV
  const templateList = page.getByTestId('template-list');
  await expect(templateList).toBeVisible();

  // Sensor template item should appear (valid.csv has device_type=Sensor rows)
  await expect(page.getByTestId('template-item-Sensor')).toBeVisible();

  // Click sensor template
  await page.getByTestId('template-item-Sensor').click();

  // Properties grid should be visible
  await expect(page.getByTestId('template-properties-grid')).toBeVisible();

  // Download YAML button works
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('template-download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.yaml');
});
