import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildTree, exportCsv, exportRdf, exportYaml, parseCsv, validate } from '../src/index';
import schema from '../../../schema/building_model.schema.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../fixtures');
const samplePath = path.resolve(__dirname, '../../../sample/debug-sample.csv');

function loadCsv(name: string) {
  return readFileSync(path.join(fixturesDir, name), 'utf-8');
}

function loadSampleCsv() {
  return readFileSync(samplePath, 'utf-8');
}

describe('buildTree', () => {
  it('creates hierarchy from pointlist rows', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const tree = buildTree(rows);

    const site = tree.find((node) => node.name === 'TokyoSite1');
    expect(site?.kind).toBe('Site');

    const building = site?.children.find((node) => node.name === 'MainBldg');
    expect(building?.kind).toBe('Building');

    const level = building?.children.find((node) => node.name === '3F');
    expect(level?.kind).toBe('Level');
  });
});

describe('buildTree (hierarchy csv)', () => {
  it('builds site-building-level-equipment-point structure', () => {
    const rows = parseCsv(loadSampleCsv(), { schema });
    const tree = buildTree(rows);

    const site = tree.find((node) => node.name === 'TokyoSite1');
    expect(site?.kind).toBe('Site');

    const building = site?.children.find((node) => node.name === 'MainBldg');
    expect(building?.kind).toBe('Building');

    const level = building?.children.find((node) => node.name === '3F');
    expect(level?.kind).toBe('Level');

    const room = level?.children.find((node) => node.name === 'Room101');
    expect(room?.kind).toBe('Room');

    const equipment = room?.children.find((node) => node.name === 'Temperature Sensor 01');
    expect(equipment?.kind).toBe('EquipmentExt');

    const point = equipment?.children.find((node) => node.id === 'PT001');
    expect(point?.kind).toBe('PointExt');
  });

  it('generates ids when deviceId or pointId is missing', () => {
    const rows = [
      {
        site: 'Site X',
        building: 'Building X',
        level: 'Level X',
        deviceName: 'Device X',
        pointName: 'Point X',
      },
    ];
    const tree = buildTree(rows);
    const site = tree[0];
    const building = site?.children[0];
    const level = building?.children[0];
    const equipment = level?.children[0];
    const point = equipment?.children[0];

    expect(equipment?.id).toBeTruthy();
    expect(point?.id).toBeTruthy();
    expect(equipment?.id).not.toBe(point?.id);
  });

  it('allows equipment directly under level when level is empty', () => {
    const rows = [
      {
        site: 'Site X',
        building: 'Building X',
        level: '-',
        installationArea: 'Room X',
        deviceName: 'Device X',
        pointName: 'Point X',
      },
    ];
    const tree = buildTree(rows);
    const level = tree[0]?.children[0]?.children[0];
    expect(level?.kind).toBe('Level');
    expect(level?.children.some((node) => node.kind === 'Room')).toBe(false);
    expect(level?.children[0]?.kind).toBe('EquipmentExt');
  });
});

describe('validate', () => {
  it('returns no issues for valid rows', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const { issues } = validate(rows);
    expect(issues).toHaveLength(0);
  });

  it('returns issues for invalid rows', () => {
    const rows = parseCsv(loadCsv('invalid.csv'), { schema });
    const { issues } = validate(rows);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((issue) => issue.code === 'id_duplicate')).toBe(true);
    expect(issues.some((issue) => issue.code === 'schema')).toBe(true);
    expect(issues.some((issue) => issue.code === 'schema' && issue.field === 'gatewayId')).toBe(
      true,
    );
    expect(issues.some((issue) => issue.code === 'schema' && issue.field === 'pointType')).toBe(
      true,
    );
  });
});

describe('exportCsv', () => {
  it('preserves unknown columns and header order from the last parse', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const csv = exportCsv(rows);
    const [headerLine, firstRowLine] = csv.split(/\r?\n/);

    expect(headerLine).toBe(
      'gatewayId,deviceId,deviceName,deviceType,site,building,floor,installationArea,targetArea,panel,pointType,pointSpecification,pointId,pointName,writable,interval,unit,maxPresValue,minPresValue,labels,scale,tags,supplier,owner,description,localId,deviceIdBacnet,instanceNoBacnet,objectTypeBacnet,extra',
    );
    expect(firstRowLine).toContain(
      'GW001,DEV001,Temperature Sensor 01,Sensor,TokyoSite1,MainBldg,3F,Room101',
    );
  });
});

describe('exportRdf', () => {
  it('emits RDF with class and parent relationships', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const rdf = exportRdf(rows, { schema });

    expect(rdf).toContain('@prefix sbco: <https://www.sbco.or.jp/ont/> .');
    expect(rdf).toContain('<https://www.sbco.or.jp/ont/resource/DEV001> a sbco:EquipmentExt ;');
    expect(rdf).toContain('<https://www.sbco.or.jp/ont/resource/PT001> a sbco:PointExt ;');
    expect(rdf).toContain('sbco:pointType "Temperature"');
    expect(rdf).toContain('sbco:isPointOf <https://www.sbco.or.jp/ont/resource/DEV001>');
  });
});

describe('exportYaml', () => {
  it('emits YAML resources aligned to the RDF mapping', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const yaml = exportYaml(rows, { schema });

    expect(yaml).toContain('resources:');
    expect(yaml).toContain('id: "DEV001"');
    expect(yaml).toContain('class: "sbco:EquipmentExt"');
    expect(yaml).toContain('id: "PT001"');
    expect(yaml).toContain('class: "sbco:PointExt"');
    expect(yaml).toContain('isPointOf: "https://www.sbco.or.jp/ont/resource/DEV001"');
  });
});

describe('schema mapping', () => {
  it('maps pointlist fields into schema props and custom tags/properties', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const point = rows.find((row) => row.id === 'PT001');
    expect(point).toBeDefined();

    expect(point?.pointType).toBe('Temperature');
    expect(point?.pointSpecification).toBe('Measurement');
    expect(point?.unit).toBe('C');
    expect(point?.maxPresValue).toBe('50');
    expect(point?.minPresValue).toBe('-10');
    expect(point?.scale).toBe('1.0');

    const tags = point?.customTags ? JSON.parse(point.customTags) : [];
    expect(tags).toEqual(
      expect.arrayContaining([
        { key: 'temperature', flag: true },
        { key: 'room101', flag: true },
      ]),
    );

    const custom = point?.customProperties ? JSON.parse(point.customProperties) : {};
    expect(custom.gatewayId).toBe('GW001');
    expect(point?.deviceId).toBe('DEV001');
    expect(point?.deviceName).toBe('Temperature Sensor 01');
    expect(custom.deviceType).toBe('Sensor');
    expect(custom.writable).toBe('false');
    expect(custom.interval).toBe('60');
    expect(custom.description).toBe('Room 101 temperature sensor');
    expect(custom.extra).toBe('alpha');
    expect(custom.deviceId).toBeUndefined();
    expect(custom.deviceName).toBeUndefined();
    expect(custom.tags).toBeUndefined();
  });
});

describe('schema mapping (pointlist)', () => {
  it('maps pointlist fields into schema props and custom tags/properties', () => {
    const rows = parseCsv(loadSampleCsv(), { schema });
    const point = rows.find((row) => row.id === 'PT001');
    expect(point).toBeDefined();

    expect(point?.pointType).toBe('Temperature');
    expect(point?.pointSpecification).toBe('Measurement');
    expect(point?.unit).toBe('℃');
    expect(point?.maxPresValue).toBe('50');
    expect(point?.minPresValue).toBe('-10');
    expect(point?.scale).toBe('1.0');

    const tags = point?.customTags ? JSON.parse(point.customTags) : [];
    expect(tags).toEqual(
      expect.arrayContaining([
        { key: 'temperature', flag: true },
        { key: 'room101', flag: true },
      ]),
    );

    const custom = point?.customProperties ? JSON.parse(point.customProperties) : {};
    expect(custom.gatewayId).toBe('GW001');
    expect(point?.deviceId).toBe('DEV001');
    expect(point?.deviceName).toBe('Temperature Sensor 01');
    expect(custom.deviceType).toBe('Sensor');
    expect(custom.writable).toBe('false');
    expect(custom.interval).toBe('60');
    expect(custom.description).toBe('Room 101 temperature sensor');
  });
});

describe('large fixture', () => {
  it('parses and validates a large csv without errors', () => {
    const rows = parseCsv(loadCsv('large.csv'), { schema });
    expect(rows).toHaveLength(1000);

    const tree = buildTree(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe('LargeSite');
    const building = tree[0]?.children[0];
    const level = building?.children[0];
    const room = level?.children[0];
    const equipment = room?.children[0];
    expect(equipment?.id).toBe('DEV-L');
    expect(equipment?.children).toHaveLength(1000);

    const { issues } = validate(rows);
    expect(issues).toHaveLength(0);
  });
});
