import type { Quad } from '@rdfjs/types';
import { z } from 'zod';
import { DataFactory, Writer } from 'n3';
import { buildResourceGraph } from './resource-graph';
import { normalizeValue, resolveRowId } from './row-utils';
import { RowRecord } from './types';

export const BOS_BASE = 'http://buildingos.gutp.jp/ontology#';
export const RESOURCE_BASE = 'https://www.sbco.or.jp/ont/resource/';
const { namedNode, literal, quad } = DataFactory;
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const iri = z
  .string()
  .min(1)
  .refine((value) => {
    if (
      !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ||
      /[\s<>"{}|\\^`]/u.test(value) ||
      Array.from(value).some(
        (character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f,
      ) ||
      /%(?![0-9A-Fa-f]{2})/.test(value)
    )
      return false;
    try {
      new URL(value);
      encodeURIComponent(value);
      return true;
    } catch {
      return false;
    }
  }, 'Expected a safe absolute IRI');
const identifier = z
  .string()
  .min(1)
  .refine(
    (value) => value.trim() === value && value.trim().length > 0,
    'Expected a nonblank identifier without surrounding whitespace',
  );
const nativeSchema = z
  .object({
    bindingId: iri,
    protocol: z.literal('bacnet'),
    gatewayId: identifier,
    connectorId: identifier,
    deviceInstance: z.number().int().min(0).max(4194302),
    objectType: z.enum(['analogValue', 'analogInput']),
    objectInstance: z.number().int().min(0).max(4194303),
    property: z.literal('presentValue'),
    unit: z.literal('seconds'),
  })
  .strict();
const sidecarSchema = z
  .object({
    schemaVersion: z.literal('builder-clocks/1-draft'),
    clockSources: z.array(
      z
        .object({
          clockId: iri,
          clockDomain: z.literal('simulation'),
          unit: z.literal('s'),
          readOnly: z.literal(true),
          acquisitionMode: z.literal('poll'),
          native: nativeSchema,
        })
        .strict(),
    ),
    clockBindings: z.array(z.object({ equipmentId: identifier, clockId: iri }).strict()),
  })
  .strict();

export type ClockSidecar = z.infer<typeof sidecarSchema>;
export class ClockInputError extends Error {
  constructor(message: string) {
    super(`Clock input: ${message}`);
    this.name = 'ClockInputError';
  }
}

export function parseClockSidecar(text: string): ClockSidecar {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ClockInputError('invalid JSON');
  }
  return readSidecar(value);
}
function readSidecar(value: unknown): ClockSidecar {
  const result = sidecarSchema.safeParse(value);
  if (!result.success)
    throw new ClockInputError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  return result.data;
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function serializeClockSidecar(value: unknown): string {
  const sidecar = readSidecar(value);
  sidecar.clockSources.sort((a, b) => compare(a.clockId, b.clockId));
  sidecar.clockBindings.sort((a, b) => compare(a.equipmentId, b.equipmentId));
  return JSON.stringify(sidecar, null, 2) + '\n';
}

/** Validate against the actual equipment graph, before any output-row deduplication. */
export function validateClockSidecar(
  rows: RowRecord[],
  value: unknown,
  baseIri = RESOURCE_BASE,
): ClockSidecar {
  const sidecar = readSidecar(value);
  let graph: ReturnType<typeof buildResourceGraph>;
  try {
    graph = buildResourceGraph(rows);
  } catch (error) {
    throw new ClockInputError((error as Error).message);
  }
  const resources = new Map(graph.resources.map((resource) => [resource.id, resource]));
  const occupied = new Set(
    graph.resources.map((resource) => baseIri + encodeURIComponent(resource.id)),
  );
  const clockById = new Map<string, ClockSidecar['clockSources'][number]>();
  for (const clock of sidecar.clockSources) {
    for (const id of [clock.clockId, clock.native.bindingId]) {
      if (occupied.has(id))
        throw new ClockInputError('duplicate clock/native IRI or collision with a model resource');
      occupied.add(id);
    }
    clockById.set(clock.clockId, clock);
  }
  const pointsByEquipment = new Map<string, typeof graph.resources>();
  for (const point of graph.resources) {
    if (point.className !== 'PointExt' || !point.parentId) continue;
    const points = pointsByEquipment.get(point.parentId) ?? [];
    points.push(point);
    pointsByEquipment.set(point.parentId, points);
  }
  const sourcePointsByDevice = new Map<string, string[]>();
  const pointIds = new Set<string>();
  for (const row of rows) {
    const kind = normalizeValue(row.kind).toLowerCase();
    if (
      ['clocksource', 'bacnetclockbinding', 'bos:clocksource', 'bos:bacnetclockbinding'].includes(
        kind,
      )
    )
      throw new ClockInputError('clock definitions belong in the sidecar, never in point rows');
    const pointId =
      normalizeValue(row.pointId) ||
      (['point', 'pointext'].includes(kind) ? resolveRowId(row) : '');
    if (!pointId) continue;
    if (pointIds.has(pointId)) throw new ClockInputError('duplicate canonical Point ID');
    pointIds.add(pointId);
    const deviceId = normalizeValue(row.deviceId);
    if (deviceId) {
      const ids = sourcePointsByDevice.get(deviceId) ?? [];
      ids.push(pointId);
      sourcePointsByDevice.set(deviceId, ids);
    }
    if (pointId === 'BPT-0001') throw new ClockInputError('retired BPT-0001 must not be a Point');
    if (resources.get(pointId)?.className !== 'PointExt')
      throw new ClockInputError('a Point row is missing from the resource graph');
  }
  const boundEquipment = new Set<string>();
  for (const binding of sidecar.clockBindings) {
    if (boundEquipment.has(binding.equipmentId))
      throw new ClockInputError('multiple/duplicate clock bindings for Equipment');
    boundEquipment.add(binding.equipmentId);
    const equipment = resources.get(binding.equipmentId);
    if (equipment?.className !== 'EquipmentExt')
      throw new ClockInputError(
        'binding target must be an existing Equipment public ID; Point overrides are unsupported',
      );
    const clock = clockById.get(binding.clockId);
    if (!clock) throw new ClockInputError('binding references an undefined ClockSource');
    const points = pointsByEquipment.get(equipment.id) ?? [];
    if (points.length === 0)
      throw new ClockInputError('clock Equipment must own at least one Point');
    for (const point of points) {
      if (normalizeValue(point.row?.gatewayId) !== clock.native.gatewayId)
        throw new ClockInputError('every Equipment Point must have the same gateway as its clock');
    }
    // Legacy splitting must not silently apply the clock to just one fragment of a device.
    for (const pointId of sourcePointsByDevice.get(equipment.id) ?? []) {
      if (resources.get(pointId)?.parentId !== equipment.id)
        throw new ClockInputError('ambiguous split Equipment ID');
    }
  }
  return sidecar;
}

/** Static extension triples only. Point count and point/device addressing are untouched. */
export function exportClockRdf(rows: RowRecord[], value: unknown, baseIri = RESOURCE_BASE): string {
  const sidecar = validateClockSidecar(rows, value, baseIri);
  const triples: Quad[] = [];
  const addIri = (subject: string, predicate: string, object: string) =>
    triples.push(quad(namedNode(subject), namedNode(predicate), namedNode(object)));
  const addLiteral = (subject: string, property: string, value: string | number | boolean) =>
    triples.push(
      quad(
        namedNode(subject),
        namedNode(BOS_BASE + property),
        literal(
          String(value),
          namedNode(
            XSD +
              (typeof value === 'number'
                ? 'integer'
                : typeof value === 'boolean'
                  ? 'boolean'
                  : 'string'),
          ),
        ),
      ),
    );
  for (const clock of [...sidecar.clockSources].sort((a, b) => compare(a.clockId, b.clockId))) {
    addIri(clock.clockId, RDF_TYPE, BOS_BASE + 'ClockSource');
    addLiteral(clock.clockId, 'clockDomain', clock.clockDomain);
    addLiteral(clock.clockId, 'clockUnit', clock.unit);
    addLiteral(clock.clockId, 'readOnly', clock.readOnly);
    addLiteral(clock.clockId, 'acquisitionMode', clock.acquisitionMode);
    addIri(clock.clockId, BOS_BASE + 'nativeBinding', clock.native.bindingId);
    const n = clock.native;
    addIri(n.bindingId, RDF_TYPE, BOS_BASE + 'BacnetClockBinding');
    addLiteral(n.bindingId, 'gatewayId', n.gatewayId);
    addLiteral(n.bindingId, 'connectorId', n.connectorId);
    addLiteral(n.bindingId, 'deviceInstance', n.deviceInstance);
    addLiteral(n.bindingId, 'objectType', n.objectType);
    addLiteral(n.bindingId, 'objectInstance', n.objectInstance);
    addLiteral(n.bindingId, 'property', n.property);
    addLiteral(n.bindingId, 'nativeUnit', n.unit);
  }
  for (const binding of [...sidecar.clockBindings].sort((a, b) =>
    compare(a.equipmentId, b.equipmentId),
  ))
    addIri(
      baseIri + encodeURIComponent(binding.equipmentId),
      BOS_BASE + 'usesClockSource',
      binding.clockId,
    );
  return new Writer().quadsToString(triples);
}
