import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv, validate } from '../src/index';
import schema from '../../../schema/building_model.schema.json';

const samplePath = path.resolve(__dirname, '../../../sample/debug-sample.csv');

function loadSample() {
  return readFileSync(samplePath, 'utf-8');
}

describe('sample debug csv', () => {
  it('maps snake_case headers to lowerCamel and fills point ids', () => {
    const rows = parseCsv(loadSample(), { schema });
    expect(rows.length).toBeGreaterThan(0);

    const first = rows[0];
    expect(first.deviceId).toBe('DEV001');
    expect(first.pointId).toBe('PT001');
    expect(first.deviceName).toBe('Temperature Sensor 01');
    expect(first.pointName).toBe('Room Temperature');
    expect(first.id).toBe('PT001');
    expect(first.name).toBe('Room Temperature');
    expect(first.objectTypeBacnet).toBe('Analog-Input');
  });

  it('produces no validation issues for the sample', () => {
    const rows = parseCsv(loadSample(), { schema });
    const { issues } = validate(rows);
    expect(issues).toHaveLength(0);
  });
});
