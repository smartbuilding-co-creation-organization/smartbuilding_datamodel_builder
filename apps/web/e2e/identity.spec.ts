import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('v2 keeps same-named rooms isolated during editing and exports consistent building references', async ({
  page,
}) => {
  const fixture = await fs.readFile(
    new URL('../../../packages/fixtures/valid.csv', import.meta.url),
    'utf8',
  );
  const [header, first] = fixture.trim().split('\n');
  const suffix = ',hierarchy_id_version,site_id,building_id,level_id,room_id';
  const content =
    header +
    suffix +
    '\n' +
    first +
    ',2,S,B1,L1,R1\n' +
    first.replace(/PT001/g, 'PT999').replace(/DEV001/g, 'DEV999') +
    ',2,S,B2,L2,R2\n';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await page
    .getByTestId('csv-input')
    .setInputFiles({ name: 'identity-v2.csv', mimeType: 'text/csv', buffer: Buffer.from(content) });
  await expect(page.getByTestId('tree-item-B1')).toBeVisible();
  await expect(page.getByTestId('tree-item-B2')).toBeVisible();

  for (const id of ['L1', 'L2']) {
    await page
      .getByTestId(`tree-item-${id}`)
      .locator('xpath=ancestor::*[@role="treeitem"][1]')
      .locator('.MuiTreeItem-iconContainer')
      .click();
  }
  await page.getByTestId('tree-item-R1').click();
  const cell = page.getByTestId('inspector-panel').locator('[data-id="name"] [data-field="value"]');
  await cell.dblclick();
  await cell.locator('input').fill('Renamed room');
  await cell.locator('input').press('Enter');
  await expect(page.getByTestId('tree-item-R1')).toContainText('Renamed room');
  await expect(page.getByTestId('tree-item-R2')).toContainText('Room 101');

  // Editing a point must not replace the source building label with its output reference.
  await page.getByTestId('grid-csv').locator('[role="row"][data-id="PT001__0"]').click();
  await cell.dblclick();
  await cell.locator('input').fill('Updated point');
  await cell.locator('input').press('Enter');
  await expect(cell).toContainText('Updated point');
  await expect(page.getByTestId('tree-item-B1')).toContainText('bldg-1');

  await page.getByTestId('output-format-select').getByRole('combobox').click();
  await page.getByRole('option', { name: 'RDF', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ダウンロード', exact: true }).click();
  const download = await pending;
  const target = test.info().outputPath('identity-v2.ttl');
  await download.saveAs(target);
  const ttl = await fs.readFile(target, 'utf8');
  expect(ttl).toContain('sbco:building "B1"');
  expect(ttl).toContain('sbco:building "B2"');
  expect(ttl).toContain('Renamed room');
  expect(errors).toEqual([]);
});
