import { readFileSync } from 'node:fs';
import { Parser } from 'n3';
import { describe, expect, it } from 'vitest';
import type { RowRecord } from '../src/types';
import schema from '../../../schema/building_model.schema.json';
import {
  exportRdf,
  parseCsv,
  runOutputPlugin,
  parseClockSidecar,
  serializeClockSidecar,
  CLOCK_SOURCE_SHAPES,
  validateRdfWithShacl,
} from '../src/index';

const fixture = readFileSync(
  new URL('./fixtures/boptest-bestest-air.csv', import.meta.url),
  'utf8',
);
const rows = (): RowRecord[] =>
  parseCsv(fixture, { schema }).map((r) => ({
    ...r,
    hierarchyIdVersion: '2',
    siteId: r.site,
    buildingId: r.building,
  }));
const BOS = 'http://buildingos.gutp.jp/ontology#';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const sidecar = () => ({
  schemaVersion: 'builder-clocks/1-draft',
  clockSources: [
    {
      clockId: 'urn:example:clock:shared',
      clockDomain: 'simulation',
      unit: 's',
      readOnly: true,
      acquisitionMode: 'poll',
      native: {
        bindingId: 'urn:example:binding:clock',
        protocol: 'bacnet',
        gatewayId: 'GW-BOPTEST-001',
        connectorId: 'bacnet-example',
        deviceInstance: 1234,
        objectType: 'analogValue',
        objectInstance: 2,
        property: 'presentValue',
        unit: 'seconds',
      },
    },
  ],
  clockBindings: [...new Set(rows().map((r) => r.deviceId))].map((equipmentId) => ({
    equipmentId,
    clockId: 'urn:example:clock:shared',
  })),
});

function quads(text: string) {
  return new Parser().parse(text);
}

describe('RI 6e0fefee clock sidecar contract', () => {
  it('exports 35 points and stable Equipment IDs plus an independent clock and native binding', async () => {
    const input = rows();
    const clocks = sidecar();
    const result = await runOutputPlugin('RDF', 'Turtle', { rows: input, schema, clocks });
    const graph = quads(result.content);
    expect(result.issues?.filter((i) => i.severity === 'violation') ?? []).toEqual([]);
    expect(
      graph.filter((q) => q.predicate.value === TYPE && q.object.value.endsWith('/PointExt')),
    ).toHaveLength(35);
    expect(
      graph.filter((q) => q.predicate.value === TYPE && q.object.value === BOS + 'ClockSource'),
    ).toHaveLength(1);
    expect(
      graph.filter(
        (q) => q.predicate.value === TYPE && q.object.value === BOS + 'BacnetClockBinding',
      ),
    ).toHaveLength(1);
    expect(graph.filter((q) => q.predicate.value === BOS + 'protocol')).toHaveLength(35);
    expect(
      graph
        .filter((q) => q.predicate.value === BOS + 'usesClockSource')
        .map((q) => decodeURIComponent(q.subject.value.split('/').pop()!))
        .sort(),
    ).toEqual(clocks.clockBindings.map((b) => b.equipmentId).sort());
    expect(
      graph
        .filter((q) => q.predicate.value === 'https://www.sbco.or.jp/ont/building')
        .every((q) => q.object.value === 'bldg-boptest'),
    ).toBe(true);
    expect(graph.some((q) => q.object.value === 'BPT-0001')).toBe(false);
    expect(
      graph
        .filter(
          (q) => q.predicate.value === TYPE && q.subject.value === clocks.clockSources[0].clockId,
        )
        .map((q) => q.object.value),
    ).toEqual([BOS + 'ClockSource']);
    expect(quads(exportRdf(input, { schema, clocks })).length).toBe(graph.length);
  });

  it('is deterministic and round-trips the separate JSON without touching CSV rows', async () => {
    const input = rows();
    const original = JSON.stringify(input);
    const clocks = sidecar();
    const json = serializeClockSidecar(clocks);
    expect(serializeClockSidecar(parseClockSidecar(json))).toBe(json);
    const a = await runOutputPlugin('RDF', 'Turtle', { rows: input, clocks });
    const b = await runOutputPlugin('RDF', 'Turtle', {
      rows: [...input].reverse(),
      clocks: { ...clocks, clockBindings: [...clocks.clockBindings].reverse() },
    });
    expect(a.content).toBe(b.content);
    expect(JSON.stringify(input)).toBe(original);
    expect(exportRdf(input)).not.toContain('ClockSource');
  });

  it.each([
    [
      'dangling equipment',
      (c: ReturnType<typeof sidecar>) => {
        c.clockBindings[0].equipmentId = 'missing';
      },
    ],
    [
      'point override',
      (c: ReturnType<typeof sidecar>) => {
        c.clockBindings[0].equipmentId = 'BPT-0002';
      },
    ],
    [
      'dangling clock',
      (c: ReturnType<typeof sidecar>) => {
        c.clockBindings[0].clockId = 'urn:missing';
      },
    ],
    [
      'multiple clocks',
      (c: ReturnType<typeof sidecar>) => {
        c.clockBindings.push({ ...c.clockBindings[0] });
      },
    ],
    [
      'duplicate clock',
      (c: ReturnType<typeof sidecar>) => {
        c.clockSources.push({ ...c.clockSources[0] });
      },
    ],
    [
      'cross gateway',
      (c: ReturnType<typeof sidecar>) => {
        c.clockSources[0].native.gatewayId = 'other';
      },
    ],
    [
      'invalid IRI',
      (c: ReturnType<typeof sidecar>) => {
        c.clockSources[0].clockId = 'urn:bad> <urn:inject';
      },
    ],
    [
      'resource collision',
      (c: ReturnType<typeof sidecar>) => {
        c.clockSources[0].clockId = 'https://www.sbco.or.jp/ont/resource/BPT-0002';
      },
    ],
    [
      'native bounds',
      (c: ReturnType<typeof sidecar>) => {
        c.clockSources[0].native.deviceInstance = 4194303;
      },
    ],
  ])('rejects %s', async (_label, mutate) => {
    const clocks = sidecar();
    mutate(clocks);
    await expect(runOutputPlugin('RDF', 'Turtle', { rows: rows(), clocks })).rejects.toThrow(
      /clock/i,
    );
  });

  it.each(['CSV', 'YAML', 'JSON-LD', 'JSON', 'WoT', 'DTDL'])(
    'refuses lossy %s output',
    async (format) => {
      const serializer =
        ({ JSON: 'Tree', WoT: 'Thing Description', DTDL: 'Interfaces' } as Record<string, string>)[
          format
        ] ?? format;
      await expect(
        runOutputPlugin(format, serializer, { rows: rows(), clocks: sidecar() }),
      ).rejects.toThrow(/clock/i);
    },
  );

  it('rejects unknown/runtime fields, wrong boolean/numeric types and incomplete native input', () => {
    for (const extra of [
      { readOnly: false },
      { readOnly: 'true' },
      { unit: 'ms' },
      { acquisitionMode: 'cov' },
      { runId: 'run-1' },
    ]) {
      const c = sidecar();
      Object.assign(c.clockSources[0], extra);
      expect(() => parseClockSidecar(JSON.stringify(c))).toThrow(/clock/i);
    }
    for (const extra of [
      { objectInstance: -1 },
      { objectInstance: 1.5 },
      { objectInstance: '2' },
      { connectorId: '' },
      { objectType: 'binaryValue' },
      { unit: 'milliseconds' },
      { password: 'secret' },
    ]) {
      const c = sidecar();
      Object.assign(c.clockSources[0].native, extra);
      expect(() => parseClockSidecar(JSON.stringify(c))).toThrow(/clock/i);
    }
    expect(() => parseClockSidecar('{')).toThrow(/clock/i);
  });

  it('rejects duplicate, retired and dropped Point IDs before output aggregation', async () => {
    for (const input of [
      [...rows(), rows()[0]],
      rows().map((r, i) => (i === 0 ? { ...r, id: 'BPT-0001', pointId: 'BPT-0001' } : r)),
      rows().map((r, i) => (i === 0 ? { ...r, site: '', siteId: '' } : r)),
    ]) {
      await expect(
        runOutputPlugin('RDF', 'Turtle', { rows: input, clocks: sidecar() }),
      ).rejects.toThrow(/clock/i);
    }
  });

  it('runs SHACL on the serialized RDF, including native types and dual typing', async () => {
    const content = exportRdf(rows(), { clocks: sidecar() });
    expect((await validateRdfWithShacl(content, CLOCK_SOURCE_SHAPES)).conforms).toBe(true);
    const clock = '<urn:example:clock:shared>';
    for (const extra of [
      `${clock} a <https://www.sbco.or.jp/ont/PointExt> .`,
      `${clock} <${BOS}readOnly> false .`,
      `${clock} <${BOS}runId> "runtime" .`,
      `<urn:example:binding:clock> <${BOS}objectInstance> "wrong" .`,
    ])
      expect(
        (await validateRdfWithShacl(content + '\n' + extra, CLOCK_SOURCE_SHAPES)).conforms,
      ).toBe(false);
  });
});

it('keeps clock identity when native addressing changes and resolves Equipment with a custom base', () => {
  const clocks = sidecar();
  clocks.clockSources[0].clockId = 'urn:example:時計:%2F';
  clocks.clockBindings.forEach((binding) => {
    binding.clockId = clocks.clockSources[0].clockId;
  });
  const before = quads(exportRdf(rows(), { clocks, baseIri: 'urn:builder:resource:' }));
  clocks.clockSources[0].native.objectInstance += 1;
  const after = quads(exportRdf(rows(), { clocks, baseIri: 'urn:builder:resource:' }));
  const links = (graph: ReturnType<typeof quads>) =>
    graph
      .filter((q) => q.predicate.value === BOS + 'usesClockSource')
      .map((q) => [q.subject.value, q.object.value]);
  expect(links(after)).toEqual(links(before));
  expect(links(after)[0][0]).toBe('urn:builder:resource:' + clocks.clockBindings[0].equipmentId);
  expect(links(after)[0][1]).toBe(clocks.clockSources[0].clockId);
});

it('rejects missing native data, duplicate native IRIs, and a conflicting model-row gateway', async () => {
  const missing = sidecar();
  expect(() =>
    parseClockSidecar(
      JSON.stringify({
        ...missing,
        clockSources: [{ ...missing.clockSources[0], native: undefined }],
      }),
    ),
  ).toThrow(/clock/i);
  const duplicateNative = sidecar();
  duplicateNative.clockSources.push({
    ...duplicateNative.clockSources[0],
    clockId: 'urn:other:clock',
  });
  await expect(
    runOutputPlugin('RDF', 'Turtle', { rows: rows(), clocks: duplicateNative }),
  ).rejects.toThrow(/clock/i);
  await expect(
    runOutputPlugin('RDF', 'Turtle', {
      rows: rows(),
      clocks: sidecar(),
      modelRows: [{ id: 'BPT-0002', gatewayId: 'OTHER' }],
    }),
  ).rejects.toThrow(/clock/i);
});

it('accepts explicit removal without guessing protocol or adding a normal clock Point', async () => {
  const input = rows().map((row) => ({ ...row, protocol: '' }));
  const result = await runOutputPlugin('RDF', 'Turtle', {
    rows: input,
    clocks: { schemaVersion: 'builder-clocks/1-draft', clockSources: [], clockBindings: [] },
  });
  const graph = quads(result.content);
  expect(graph.filter((q) => q.predicate.value === BOS + 'protocol')).toHaveLength(0);
  expect(
    graph.filter((q) => q.predicate.value === TYPE && q.object.value === BOS + 'ClockSource'),
  ).toHaveLength(0);
  expect(
    graph.filter((q) => q.predicate.value === TYPE && q.object.value.endsWith('/PointExt')),
  ).toHaveLength(35);
});

it('shares one clock across two Equipment and rejects a second clock on either Equipment', async () => {
  const input = rows().slice(0, 2);
  input[1] = { ...input[1], deviceId: 'DEV-SECOND' };
  const clocks = sidecar();
  clocks.clockBindings.push({ equipmentId: 'DEV-SECOND', clockId: clocks.clockSources[0].clockId });
  const result = await runOutputPlugin('RDF', 'Turtle', { rows: input, clocks });
  expect(result.issues?.filter((i) => i.severity === 'violation') ?? []).toEqual([]);
  expect(
    quads(result.content).filter((q) => q.predicate.value === BOS + 'usesClockSource'),
  ).toHaveLength(2);
  clocks.clockSources.push({
    ...clocks.clockSources[0],
    clockId: 'urn:other:clock',
    native: { ...clocks.clockSources[0].native, bindingId: 'urn:other:native' },
  });
  clocks.clockBindings.push({ equipmentId: 'DEV-SECOND', clockId: 'urn:other:clock' });
  await expect(runOutputPlugin('RDF', 'Turtle', { rows: input, clocks })).rejects.toThrow(/clock/i);
});
