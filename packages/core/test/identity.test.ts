import { readFileSync } from 'node:fs';
import schema from '../../../schema/building_model.schema.json';
import { describe, expect, it } from 'vitest';
import { Parser } from 'n3';
import {
  buildTree,
  buildResourceGraph,
  exportRdf,
  exportYaml,
  exportCsv,
  validateRdfWithShacl,
  parseCsv,
  runOutputPlugin,
  buildResourceModelMap,
  buildOutputRows,
  hasHierarchySignalChange,
} from '../src/index';
import type { RowRecord } from '../src/types';

const row = (overrides: RowRecord = {}): RowRecord => ({
  id: overrides.pointId || 'BPT-1',
  hierarchyIdVersion: '2',
  site: 'キャンパス',
  siteId: 'site-boptest',
  building: '本館',
  buildingId: 'bldg-boptest',
  floor: 'L1',
  installationArea: 'Room',
  deviceId: 'DEV-1',
  pointId: 'BPT-1',
  pointName: '温度',
  ...overrides,
});
const ids = (rows: RowRecord[]) =>
  buildResourceGraph(rows).resources.map((r) => [r.className, r.id, r.name, r.parentId]);

describe('hierarchy identity v2 (#45)', () => {
  it('preserves explicit IDs separately from labels and internal keys', () => {
    const rows = [row({ levelId: 'level-1', roomId: 'room-1' })];
    const tree = buildTree(rows);
    expect(tree[0].id).toBe('site-boptest');
    expect(tree[0].name).toBe('キャンパス');
    expect(tree[0]).toHaveProperty('treeKey');
    expect(tree[0].children[0].id).toBe('bldg-boptest');
    expect(buildResourceGraph(rows).resources.map((r) => r.id)).toEqual(
      expect.arrayContaining(['level-1', 'room-1', 'DEV-1', 'BPT-1']),
    );
    const point = buildResourceGraph(rows).resources.find((r) => r.id === 'BPT-1');
    expect(point?.buildingId).toBe('bldg-boptest');
    expect(point?.row?.building).toBe('本館');
    expect(rows[0].building).toBe('本館');
  });

  it('keeps same-named levels and rooms in different buildings distinct and deterministic', async () => {
    const rows = [row(), row({ buildingId: 'bldg-2', deviceId: 'DEV-2', pointId: 'BPT-2' })];
    const resources = buildResourceGraph(rows).resources;
    for (const kind of ['Level', 'Room']) {
      const matching = resources.filter((r) => r.className === kind);
      expect(matching).toHaveLength(2);
      expect(new Set(matching.map((r) => r.id)).size).toBe(2);
    }
    expect(ids(rows)).toEqual(ids([...rows].reverse()));
    const a = await runOutputPlugin('RDF', 'Turtle', { rows });
    const b = await runOutputPlugin('RDF', 'Turtle', { rows: [...rows].reverse() });
    expect(a.content).toBe(b.content);
    expect(a.content).toBe((await runOutputPlugin('RDF', 'Turtle', { rows })).content);
    expect(a.content).toContain('sbco:building "bldg-boptest"');
  });

  it('preserves explicit IDs through rename and move; fallback identity follows its scope', () => {
    const original = row({ levelId: 'L-explicit', roomId: 'R-explicit' });
    const moved = row({
      siteId: 'other-site',
      buildingId: 'other-building',
      levelId: 'L-explicit',
      roomId: 'R-explicit',
      floor: 'renamed',
      installationArea: 'renamed room',
    });
    for (const id of ['L-explicit', 'R-explicit', 'DEV-1', 'BPT-1']) {
      expect(buildResourceGraph([original]).resources.some((r) => r.id === id)).toBe(true);
      expect(buildResourceGraph([moved]).resources.some((r) => r.id === id)).toBe(true);
    }
    expect(ids([row()])).not.toEqual(ids([row({ buildingId: 'moved' })]));
  });

  it('rejects ambiguous IDs and mixed or unknown versions rather than renumbering', () => {
    expect(() =>
      buildTree([row(), row({ buildingId: 'other', deviceId: 'DEV-1', pointId: 'BPT-2' })]),
    ).toThrow(/identity/i);
    expect(() => buildTree([row(), row({ hierarchyIdVersion: '' })])).toThrow(/version/i);
    expect(() => buildTree([row({ hierarchyIdVersion: '3' })])).toThrow(/version/i);
    expect(() => buildTree([row(), row({ building: 'contradictory' })])).toThrow(/identity/i);
  });

  it('retains legacy IDs and building literals without opt-in', () => {
    const rows = [row({ hierarchyIdVersion: '' })];
    expect(buildTree(rows)[0].id).toBe('site:キャンパス');
    expect(exportRdf(rows)).toContain('sbco:building "本館"');
  });

  it('parses all 35 points, spatial levels, and links with safe special-character IRIs', async () => {
    const rows = Array.from({ length: 35 }, (_, i) =>
      row({
        siteId: 'サイト / % : < > # ? "',
        buildingId: '建物 / % : #',
        levelId: '階 <1>',
        roomId: '部屋 "A"',
        pointId: `BPT-${i}`,
        deviceId: 'Device-A',
      }),
    );
    const direct = exportRdf(rows);
    const plugin = await runOutputPlugin('RDF', 'Turtle', { rows });
    for (const content of [direct, plugin.content]) {
      const quads = new Parser().parse(content);
      expect(
        quads.filter(
          (q) => q.predicate.value.endsWith('type') && q.object.value.endsWith('PointExt'),
        ),
      ).toHaveLength(35);
      expect(quads.filter((q) => q.predicate.value.endsWith('hasPoint'))).toHaveLength(35);
      expect(quads.filter((q) => q.predicate.value.endsWith('hasPart'))).toHaveLength(3);
      expect(quads.filter((q) => q.predicate.value.endsWith('locatedIn'))).toHaveLength(1);
      const building = quads.find(
        (q) => q.predicate.value.endsWith('type') && q.object.value.endsWith('Building'),
      )!;
      const id = quads.find(
        (q) =>
          q.subject.equals(building.subject) &&
          q.predicate.value === 'https://www.sbco.or.jp/ont/id',
      )!.object.value;
      expect(
        quads
          .filter((q) => q.predicate.value === 'https://www.sbco.or.jp/ont/building')
          .every((q) => q.object.value === id),
      ).toBe(true);
    }
  });

  it('reads explicit snake_case IDs through the schema-mapped CSV path', () => {
    const rows = parseCsv(
      'hierarchy_id_version,site_id,site_name,building_id,building_name,level_id,room_id,device_id,point_id\n2,S,Site,B,Building,L,R,D,P',
      { schema },
    );
    expect(buildResourceGraph(rows).resources.map((r) => r.id)).toEqual(
      expect.arrayContaining(['S', 'B', 'L', 'R', 'D', 'P']),
    );
  });
});

describe('identity compatibility through output aggregation', () => {
  it('keeps model labels and references separate and survives model-row merging', async () => {
    const rows = [row({ levelId: 'L', roomId: 'R' })];
    const models = [...buildResourceModelMap(rows).values()];
    expect(models.find((r) => r.id === 'BPT-1')?.building).toBe('本館');
    const result = await runOutputPlugin('RDF', 'Turtle', { rows, modelRows: models });
    expect(result.content).toContain('sbco:building "bldg-boptest"');
    expect(new Parser().parse(result.content).length).toBeGreaterThan(0);
    expect(buildOutputRows(buildOutputRows(rows))).toEqual(buildOutputRows(rows));
  });

  it('rejects an explicit ID colliding with a generated ID', () => {
    const generated = buildTree([row({ siteId: '' })])[0].id;
    expect(() =>
      buildTree([
        row({ siteId: '' }),
        row({ siteId: generated, site: 'Other', deviceId: 'D2', pointId: 'P2' }),
      ]),
    ).toThrow(/identity/i);
  });

  it('rebuilds when only an explicit hierarchy ID changes', () => {
    expect(hasHierarchySignalChange(row(), row({ buildingId: 'changed' }))).toBe(true);
  });

  it('exports the BOPTEST bestest_air 35-point fixture without changing point/device IDs', async () => {
    const original = parseCsv(
      readFileSync(new URL('./fixtures/boptest-bestest-air.csv', import.meta.url), 'utf8'),
      { schema },
    );
    expect(original).toHaveLength(35);
    const rows = original.map((r) => ({
      ...r,
      hierarchyIdVersion: '2',
      siteId: r.site,
      buildingId: r.building,
    }));
    const modelRows = [...buildResourceModelMap(rows).values()];
    const result = await runOutputPlugin('RDF', 'Turtle', { rows, modelRows, schema });
    const quads = new Parser().parse(result.content);
    const graph = buildResourceGraph(rows);
    expect(
      graph.resources
        .filter((r) => r.className === 'PointExt')
        .map((r) => r.id)
        .sort(),
    ).toEqual(original.map((r) => r.pointId).sort());
    expect(
      graph.resources
        .filter((r) => r.className === 'EquipmentExt')
        .map((r) => r.id)
        .sort(),
    ).toEqual([...new Set(original.map((r) => r.deviceId))].sort());
    expect(graph.resources.filter((r) => r.className === 'Building').map((r) => r.id)).toEqual([
      'bldg-boptest',
    ]);
    expect(
      quads.filter((q) => q.predicate.value === 'https://www.sbco.or.jp/ont/building'),
    ).toHaveLength(35);
    expect(
      quads
        .filter((q) => q.predicate.value === 'https://www.sbco.or.jp/ont/building')
        .every((q) => q.object.value === 'bldg-boptest'),
    ).toBe(true);
    expect(graph.resources.some((r) => r.id === 'BPT-0001')).toBe(false);
    expect(result.content).toBe(
      (await runOutputPlugin('RDF', 'Turtle', { rows: [...rows].reverse(), schema })).content,
    );
  });
});

describe('v2 reference and label boundaries', () => {
  it('emits a resolved building reference with ID-only spatial columns in RDF and YAML', () => {
    const rows = parseCsv(
      'hierarchy_id_version,site_id,building_id,level_id,room_id,device_id,point_id\n2,S,B,L,R,D,P',
      { schema },
    );
    expect(exportRdf(rows)).toContain('sbco:building "B"');
    expect(exportYaml(rows)).toContain('"building": "B"');
    const csv = exportCsv(rows);
    expect(parseCsv(csv)[0]).toMatchObject({
      hierarchyIdVersion: '2',
      buildingId: 'B',
      pointId: 'P',
    });
  });

  it('preserves Zone classification when its display name is supplied independently', () => {
    const rows = [
      row({ installationArea: '', zone: 'zone-label', roomName: 'Renamed zone', roomId: 'Z' }),
    ];
    const zone = buildResourceGraph(rows).resources.find((r) => r.id === 'Z');
    expect(zone).toMatchObject({ className: 'Zone', name: 'Renamed zone' });
  });

  it('keeps BOPTEST RDF conformant to the vendored SHACL', async () => {
    const original = parseCsv(
      readFileSync(new URL('./fixtures/boptest-bestest-air.csv', import.meta.url), 'utf8'),
      { schema },
    );
    const rows = original.map((r) => ({
      ...r,
      hierarchyIdVersion: '2',
      siteId: r.site,
      buildingId: r.building,
    }));
    const shapeText = readFileSync(
      new URL('../../../schema/building_model.shacl.ttl', import.meta.url),
      'utf8',
    );
    const result = await validateRdfWithShacl(exportRdf(rows, { schema }), shapeText);
    expect(result.issues.filter((issue) => issue.severity === 'violation')).toEqual([]);
  });
});

it('distinguishes fallback labels that would collide under slug normalization', () => {
  const rows = ['a/b', 'a b', 'a:b', '日本語 部屋'].map((installationArea, i) =>
    row({ installationArea, deviceId: `D${i}`, pointId: `P${i}` }),
  );
  const rooms = buildResourceGraph(rows).resources.filter((r) => r.className === 'Room');
  expect(rooms).toHaveLength(4);
  expect(new Set(rooms.map((r) => r.id)).size).toBe(4);
  expect(ids(rows)).toEqual(ids([...rows].reverse()));
});

it('rejects conflicting source Point IDs before output merging can collapse them', async () => {
  const rows = [row(), row({ buildingId: 'other', deviceId: 'D-other' })];
  await expect(runOutputPlugin('RDF', 'Turtle', { rows })).rejects.toThrow(/identity/i);
});
