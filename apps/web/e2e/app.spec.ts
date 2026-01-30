import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('upload csv, filter tree, edit and export', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../packages/fixtures/valid.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  const siteItem = page.getByTestId('tree-item-site-1');
  await expect(siteItem).toBeVisible();
  const siteTreeItem = siteItem.locator('xpath=ancestor::*[@role="treeitem"][1]');
  const siteToggle = siteTreeItem.locator(
    ':scope > .MuiTreeItem-content > .MuiTreeItem-iconContainer',
  );
  await siteToggle.click();

  const buildingItem = page.getByTestId('tree-item-bldg-1');
  await expect(buildingItem).toBeVisible();
  await buildingItem.click();

  const gridRows = page.getByTestId('grid').locator('.MuiDataGrid-row');
  await expect(gridRows).toHaveCount(4);

  const cell = page.getByRole('gridcell', { name: 'Room 101' }).first();
  await cell.dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Room 101A');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('gridcell', { name: 'Room 101A' }).first()).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('csv-export-button').click();
  const download = await downloadPromise;
  const outputPath = test.info().outputPath('export.csv');
  await download.saveAs(outputPath);
  const text = await fs.readFile(outputPath, 'utf-8');
  await expect(text).toContain('Room 101A');

  const rdfDownloadPromise = page.waitForEvent('download');
  await page.getByTestId('rdf-export-button').click();
  const rdfDownload = await rdfDownloadPromise;
  const rdfPath = test.info().outputPath('export.ttl');
  await rdfDownload.saveAs(rdfPath);
  const rdfText = await fs.readFile(rdfPath, 'utf-8');
  await expect(rdfText).toContain('Room 101A');

  const yamlDownloadPromise = page.waitForEvent('download');
  await page.getByTestId('yaml-export-button').click();
  const yamlDownload = await yamlDownloadPromise;
  const yamlPath = test.info().outputPath('export.yaml');
  await yamlDownload.saveAs(yamlPath);
  const yamlText = await fs.readFile(yamlPath, 'utf-8');
  await expect(yamlText).toContain('Room 101A');
});

test('can expand and collapse tree items', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../packages/fixtures/valid.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  const siteItem = page.getByTestId('tree-item-site-1');
  await expect(siteItem).toBeVisible();

  const floorItem = page.getByTestId('tree-item-floor-1');
  await expect(floorItem).toHaveCount(0);

  await siteItem.click();
  await page.keyboard.press('ArrowRight');
  const buildingItem = page.getByTestId('tree-item-bldg-1');
  await expect(buildingItem).toBeVisible();

  const buildingTreeItem = buildingItem.locator(
    'xpath=ancestor::*[@role="treeitem"][1]',
  );
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
  await expect(summary).toContainText('Duplicate id');

  const errorRows = page.getByTestId('grid').locator('.row-error');
  expect(await errorRows.count()).toBeGreaterThan(0);
});

test('filters grid rows by search term', async ({ page }) => {
  await page.goto('/');

  const fixturePath = path.resolve(__dirname, '../../../packages/fixtures/valid.csv');
  await page.getByTestId('csv-input').setInputFiles(fixturePath);

  const searchInput = page.getByTestId('grid-search');
  await searchInput.fill('Room 201');

  const gridRows = page.getByTestId('grid').locator('.MuiDataGrid-row');
  await expect(gridRows).toHaveCount(1);
});
