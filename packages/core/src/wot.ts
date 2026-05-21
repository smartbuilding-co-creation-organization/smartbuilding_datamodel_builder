import { buildResourceGraph, ResourceNode, ResourceRelation } from './resource-graph';
import { RowRecord } from './types';
import { normalizeValue } from './row-utils';

const TD_CONTEXT = 'https://www.w3.org/2022/wot/td/v1.1';
const SBCO_NS = 'https://www.sbco.or.jp/ont/';
const SBCO_PREFIX = 'sbco';
const DEFAULT_BASE = 'https://www.sbco.or.jp/ont/resource/';
const HREF_BASE_PLACEHOLDER = '{{HREF_BASE}}';

type WotOptions = {
  baseIri?: string;
};

type WotForm = {
  href: string;
  op: string[];
  contentType: string;
};

type WotPropertyAffordance = {
  '@type': string;
  title: string;
  type: string;
  readOnly: boolean;
  observable: boolean;
  description?: string;
  unit?: string;
  minimum?: number;
  maximum?: number;
  'sbco:pointType'?: string;
  forms?: WotForm[];
};

type WotLink = {
  rel: string;
  href: string;
  type?: string;
};

type WotSecurityDefinition = { scheme: string };

type WotThing = {
  '@context': unknown[];
  '@type': string | string[];
  id: string;
  title: string;
  base: string;
  description?: string;
  properties?: Record<string, WotPropertyAffordance>;
  links?: WotLink[];
  securityDefinitions?: Record<string, WotSecurityDefinition>;
  security?: string;
};

const POINT_CLASSES = new Set(['Point', 'PointExt']);

function iriFor(baseIri: string, id: string): string {
  return `${baseIri}${encodeURIComponent(id)}`;
}

function thingIdFor(className: string, id: string): string {
  return `urn:sbco:${className}:${id}`;
}

function isTruthyWritable(value: string): boolean {
  const v = value.toLowerCase();
  return v === 'y' || v === 'yes' || v === 'true' || v === '1' || v === 'rw' || v === 'w';
}

function inferDataSchemaType(row?: RowRecord): string {
  const objType = normalizeValue(row?.objectTypeBacnet).toLowerCase();
  const ptype = normalizeValue(row?.pointType).toLowerCase();
  const pspec = normalizeValue(row?.pointSpecification).toLowerCase();
  const unit = normalizeValue(row?.unit);

  if (objType.includes('binary') || ptype.includes('binary') || ptype.includes('switch')) {
    return 'boolean';
  }
  if (objType.includes('multistate') || ptype.includes('mode') || pspec.includes('mode')) {
    return 'integer';
  }
  if (objType.includes('analog') || unit) {
    return 'number';
  }
  return 'string';
}

function buildPropertyAffordance(
  point: ResourceNode,
  opts: { asThingModel: boolean },
): WotPropertyAffordance {
  const row = point.row ?? {};
  const readOnly = !isTruthyWritable(normalizeValue(row.writable));

  const prop: WotPropertyAffordance = {
    '@type': `${SBCO_PREFIX}:${point.className}`,
    title: point.name || point.id,
    type: inferDataSchemaType(row),
    readOnly,
    observable: true,
  };

  const description = normalizeValue(row.description);
  if (description) prop.description = description;

  const unit = normalizeValue(row.unit);
  if (unit) prop.unit = unit;

  const min = normalizeValue(row.minPresValue);
  if (min) {
    const n = Number(min);
    if (Number.isFinite(n)) prop.minimum = n;
  }
  const max = normalizeValue(row.maxPresValue);
  if (max) {
    const n = Number(max);
    if (Number.isFinite(n)) prop.maximum = n;
  }

  const pointType =
    normalizeValue(row.pointType) ||
    normalizeValue(row.pointSpecification) ||
    normalizeValue(row.objectTypeBacnet);
  if (pointType) prop['sbco:pointType'] = pointType;

  if (!opts.asThingModel) {
    prop.forms = [
      {
        href: `${HREF_BASE_PLACEHOLDER}/properties/${encodeURIComponent(point.id)}`,
        op: readOnly ? ['readproperty', 'observeproperty'] : ['readproperty', 'writeproperty'],
        contentType: 'application/json',
      },
    ];
  }

  return prop;
}

function buildThings(
  rows: RowRecord[],
  opts: { asThingModel: boolean },
  baseIri: string,
): WotThing[] {
  const { resources, relations } = buildResourceGraph(rows);

  const resourceById = new Map<string, ResourceNode>();
  for (const r of resources) resourceById.set(r.id, r);

  const pointsByParent = new Map<string, ResourceNode[]>();
  for (const r of resources) {
    if (!POINT_CLASSES.has(r.className) || !r.parentId) continue;
    if (!pointsByParent.has(r.parentId)) pointsByParent.set(r.parentId, []);
    pointsByParent.get(r.parentId)!.push(r);
  }

  const relsBySubject = new Map<string, ResourceRelation[]>();
  for (const rel of relations) {
    if (!relsBySubject.has(rel.subjectId)) relsBySubject.set(rel.subjectId, []);
    relsBySubject.get(rel.subjectId)!.push(rel);
  }

  const linkType = opts.asThingModel ? 'application/tm+json' : 'application/td+json';
  const things: WotThing[] = [];

  for (const resource of resources) {
    if (POINT_CLASSES.has(resource.className)) continue;

    const thing: WotThing = {
      '@context': [TD_CONTEXT, { [SBCO_PREFIX]: SBCO_NS }],
      '@type': opts.asThingModel
        ? ['tm:ThingModel', `${SBCO_PREFIX}:${resource.className}`]
        : `${SBCO_PREFIX}:${resource.className}`,
      id: thingIdFor(resource.className, resource.id),
      title: resource.name || resource.id,
      base: `${iriFor(baseIri, resource.id)}/`,
    };

    const description = normalizeValue(resource.row?.description);
    if (description) thing.description = description;

    const childPoints = pointsByParent.get(resource.id) ?? [];
    if (childPoints.length > 0) {
      const properties: Record<string, WotPropertyAffordance> = {};
      for (const point of childPoints) {
        properties[point.id] = buildPropertyAffordance(point, opts);
      }
      thing.properties = properties;
    }

    const links: WotLink[] = [];
    for (const rel of relsBySubject.get(resource.id) ?? []) {
      if (rel.predicate === 'hasPoint') continue;
      const target = resourceById.get(rel.objectId);
      if (!target) continue;
      let linkRel = rel.predicate;
      if (rel.predicate === 'hasPart') linkRel = opts.asThingModel ? 'tm:submodel' : 'item';
      else if (rel.predicate === 'locatedIn') linkRel = 'related';
      links.push({
        rel: linkRel,
        href: thingIdFor(target.className, target.id),
        type: linkType,
      });
    }
    if (links.length > 0) thing.links = links;

    if (!opts.asThingModel) {
      thing.securityDefinitions = { nosec_sc: { scheme: 'nosec' } };
      thing.security = 'nosec_sc';
    }

    things.push(thing);
  }

  return things;
}

export function buildWotThings(
  rows: RowRecord[],
  options: WotOptions & { asThingModel: boolean },
): WotThing[] {
  const baseIri = options.baseIri ?? DEFAULT_BASE;
  return buildThings(rows, { asThingModel: options.asThingModel }, baseIri);
}

export function exportWotThingModel(rows: RowRecord[], options: WotOptions = {}): string {
  return JSON.stringify(buildWotThings(rows, { ...options, asThingModel: true }), null, 2);
}

export function exportWotTd(rows: RowRecord[], options: WotOptions = {}): string {
  return JSON.stringify(buildWotThings(rows, { ...options, asThingModel: false }), null, 2);
}
