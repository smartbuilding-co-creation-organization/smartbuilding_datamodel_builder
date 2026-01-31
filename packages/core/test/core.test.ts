import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  applyTemplateToRows,
  buildTree,
  buildTemplatesZip,
  buildDeviceTemplatesFromCsv,
  diffDeviceTemplate,
  exportCsv,
  exportRdf,
  exportYaml,
  getSchemaPropertyDescription,
  hasHierarchySignalChange,
  parseCsv,
  parseDeviceTemplateYaml,
  resolveHierarchySignals,
  serializeDeviceTemplate,
  validate,
} from '../src/index';
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
  it('creates parent-child relationships', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const tree = buildTree(rows);

    const site = tree.find((node) => node.id === 'site-1');
    expect(site?.children.some((node) => node.id === 'bldg-1')).toBe(true);

    const building = site?.children.find((node) => node.id === 'bldg-1');
    expect(building?.children.some((node) => node.id === 'floor-1')).toBe(true);
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

  it('skips rows with missing hierarchy parents', () => {
    const rows = [
      {
        building: 'Building X',
        level: 'Level X',
        deviceName: 'Device X',
        pointName: 'Point X',
      },
    ];
    const tree = buildTree(rows);
    expect(tree).toHaveLength(0);
  });

  it('omits point node when point signals are missing', () => {
    const rows = [
      {
        site: 'Site X',
        building: 'Building X',
        level: 'Level X',
        deviceName: 'Device X',
      },
    ];
    const tree = buildTree(rows);
    const equipment = tree[0]?.children[0]?.children[0]?.children[0];
    expect(equipment?.kind).toBe('EquipmentExt');
    expect(equipment?.children).toHaveLength(0);
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
    expect(issues.some((issue) => issue.code === 'parent_missing')).toBe(true);
    expect(issues.some((issue) => issue.code === 'cycle')).toBe(true);
    expect(issues.some((issue) => issue.code === 'schema')).toBe(true);
  });

  it('returns hierarchy issues when parent signals are missing', () => {
    const rows = [
      {
        building: 'Building X',
        level: 'Level X',
        deviceName: 'Device X',
        pointName: 'Point X',
      },
    ];
    const { issues } = validate(rows);
    expect(issues.some((issue) => issue.code === 'hierarchy_missing')).toBe(true);
    expect(issues.some((issue) => issue.field === 'site')).toBe(true);
  });
});

describe('exportCsv', () => {
  it('preserves unknown columns and header order from the last parse', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const csv = exportCsv(rows);
    const [headerLine, firstRowLine] = csv.split(/\r?\n/);

    expect(headerLine).toBe('id,name,parentId,kind,extra');
    expect(firstRowLine).toContain('site-1,Site A,,site,alpha');
  });
});

describe('exportRdf', () => {
  it('emits RDF with class and parent relationships', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const rdf = exportRdf(rows, { schema });

    expect(rdf).toContain('@prefix sbco: <https://www.sbco.or.jp/ont/> .');
    expect(rdf).toContain('<https://www.sbco.or.jp/ont/resource/site-1> a sbco:Site ;');
    expect(rdf).toContain('sbco:isPartOf <https://www.sbco.or.jp/ont/resource/site-1>');
  });
});

describe('exportYaml', () => {
  it('emits YAML resources aligned to the RDF mapping', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const yaml = exportYaml(rows, { schema });

    expect(yaml).toContain('resources:');
    expect(yaml).toContain('id: "site-1"');
    expect(yaml).toContain('class: "sbco:Site"');
    expect(yaml).toContain('isPartOf: "https://www.sbco.or.jp/ont/resource/site-1"');
  });
});

describe('schema mapping', () => {
  it('fills schema properties and stores unknown columns in customProperties', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const site = rows.find((row) => row.id === 'site-1');
    expect(site).toBeDefined();
    expect(site?.address).toBeDefined();

    const custom = site?.customProperties ? JSON.parse(site.customProperties) : {};
    expect(custom.extra).toBe('alpha');
  });

  it('maps parentId into isPartOf when available in the schema', () => {
    const rows = parseCsv(loadCsv('valid.csv'), { schema });
    const building = rows.find((row) => row.id === 'bldg-1');
    expect(building?.isPartOf).toBe('site-1');
  });
});

describe('hierarchy signal utilities', () => {
  it('detects hierarchy signal changes for monitored columns', () => {
    const before = {
      site: 'Site A',
      building: 'Building A',
      level: 'Level 1',
      deviceName: 'Device A',
      pointName: 'Point A',
      note: 'unchanged',
    };
    const after = {
      ...before,
      building: 'Building B',
    };
    const ignoreChange = {
      ...before,
      note: 'updated',
    };

    expect(hasHierarchySignalChange(before, after)).toBe(true);
    expect(hasHierarchySignalChange(before, ignoreChange)).toBe(false);
  });

  it('normalizes hierarchy signals consistently', () => {
    const signals = resolveHierarchySignals({
      siteName: 'Site A',
      buildingId: 'Building A',
      floorName: 'Level 1',
      zone: 'Zone A',
      deviceId: 'Device A',
      pointId: 'Point A',
    });
    expect(signals.site).toBe('Site A');
    expect(signals.building).toBe('Building A');
    expect(signals.level).toBe('Level 1');
    expect(signals.room).toBe('Zone A');
    expect(signals.roomKind).toBe('Zone');
  });
});

describe('schema descriptions', () => {
  it('returns property descriptions from schema definitions', () => {
    const description = getSchemaPropertyDescription(schema, 'site', 'name');
    expect(description).toBeTruthy();
  });
});

describe('large fixture', () => {
  it('parses and validates a large csv without errors', () => {
    const rows = parseCsv(loadCsv('large.csv'), { schema });
    expect(rows).toHaveLength(1000);

    const tree = buildTree(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children.some((node) => node.id === 'bldg-1')).toBe(true);

    const { issues } = validate(rows);
    expect(issues).toHaveLength(0);
  });
});

describe('device templates', () => {
  it('builds device templates from csv with point types', () => {
    const rows = parseCsv(loadSampleCsv(), { schema });
    const templates = buildDeviceTemplatesFromCsv(rows);
    const sensor = templates.find((template) => template.deviceType === 'Sensor');
    expect(sensor).toBeDefined();
    expect(sensor?.properties.some((prop) => prop.pointType === 'Temperature')).toBe(true);
  });

  it('detects template diffs between csv and yaml', () => {
    const rows = parseCsv(loadSampleCsv(), { schema });
    const templates = buildDeviceTemplatesFromCsv(rows);
    const sensor = templates.find((template) => template.deviceType === 'Sensor');
    expect(sensor).toBeDefined();
    if (!sensor) return;

    const altered = {
      ...sensor,
      properties: sensor.properties.map((prop) =>
        prop.name === sensor.properties[0]?.name ? { ...prop, access: 'readWrite' as const } : prop,
      ),
    };

    const diff = diffDeviceTemplate(sensor, altered);
    expect(diff.mismatched.length).toBeGreaterThan(0);
  });

  it('serializes and parses device template yaml', () => {
    const rows = parseCsv(loadSampleCsv(), { schema });
    const templates = buildDeviceTemplatesFromCsv(rows);
    const template = templates[0];
    expect(template).toBeDefined();
    if (!template) return;

    const yamlText = serializeDeviceTemplate(template);
    const parsed = parseDeviceTemplateYaml(yamlText, {
      namespace: template.namespace,
      deviceType: template.deviceType,
    });
    expect(parsed.className).toBe(template.className);
    expect(parsed.properties.length).toBeGreaterThan(0);
  });

  it('applies template point types back to rows', () => {
    const rows = parseCsv(loadSampleCsv(), { schema });
    const templates = buildDeviceTemplatesFromCsv(rows);
    const template = templates[0];
    expect(template).toBeDefined();
    if (!template) return;

    const updated = applyTemplateToRows(rows, template);
    expect(updated.some((row) => row.pointType)).toBe(true);
  });

  it('builds a zip output for templates', async () => {
    const rows = parseCsv(loadSampleCsv(), { schema });
    const templates = buildDeviceTemplatesFromCsv(rows);
    const zipBytes = await buildTemplatesZip(templates.slice(0, 1));
    expect(zipBytes.byteLength).toBeGreaterThan(0);
  });
});
