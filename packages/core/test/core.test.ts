import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  applyTemplateToRows,
  buildTree,
  buildBaseTemplatesFromRows,
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
  resolveDeviceTemplateInheritance,
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
    expect(issues.some((issue) => issue.code === 'schema')).toBe(true);
    expect(issues.some((issue) => issue.code === 'schema' && issue.field === 'gatewayId')).toBe(
      true,
    );
    expect(issues.some((issue) => issue.code === 'schema' && issue.field === 'pointType')).toBe(
      true,
    );
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

  it('builds base templates per namespace', () => {
    const rows = parseCsv(loadSampleCsv(), { schema });
    const bases = buildBaseTemplatesFromRows(rows);
    expect(bases.length).toBeGreaterThan(0);
    const base = bases[0];
    expect(base?.deviceType).toBe('Base');
  });

  it('resolves template inheritance and merges properties', () => {
    const base = {
      namespace: 'default',
      deviceType: 'Base',
      className: 'Base',
      description: 'Base template',
      properties: [
        {
          name: 'version',
          access: 'read' as const,
          pointType: 'version',
        },
      ],
    };
    const child = {
      namespace: 'default',
      deviceType: 'Sensor',
      className: 'Sensor',
      extends: 'Base',
      properties: [
        {
          name: 'temperature',
          access: 'read' as const,
          pointType: 'Temperature',
        },
      ],
    };
    const resolved = resolveDeviceTemplateInheritance([base, child], child);
    expect(resolved.properties.some((prop) => prop.name === 'version')).toBe(true);
    expect(resolved.properties.some((prop) => prop.name === 'temperature')).toBe(true);
  });

  it('detects circular template inheritance', () => {
    const first = {
      namespace: 'default',
      deviceType: 'A',
      className: 'A',
      extends: 'B',
      properties: [],
    };
    const second = {
      namespace: 'default',
      deviceType: 'B',
      className: 'B',
      extends: 'A',
      properties: [],
    };
    expect(() => resolveDeviceTemplateInheritance([first, second], first)).toThrow(/継承ループ/);
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
