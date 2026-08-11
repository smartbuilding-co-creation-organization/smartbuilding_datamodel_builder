import { buildResourceGraph } from './resource-graph';
import { buildSchemaCache, getRequiredPropsFromCache, SchemaRoot } from './schema-mapping';
import { RowRecord } from './types';
import { collectOutputFields, resolveOutputValue } from './output-utils';
import { getOriginalHeaderName } from './csv';
import { isTruthyValue } from './row-utils';

type RdfOptions = {
  baseIri?: string;
  includePrefixes?: boolean;
  schema?: SchemaRoot;
  autoFill?: boolean;
};

const DEFAULT_BASE = 'https://www.sbco.or.jp/ont/resource/';
const SBCO_BASE = 'https://www.sbco.or.jp/ont/';
const UNKNOWN_PROPERTY_BASE = `${SBCO_BASE}property/`;

const REC_FIELDS = new Set([
  'IPAddress',
  'MACAddress',
  'address',
  'adjacentElement',
  'architectedBy',
  'area',
  'assetTag',
  'capacity',
  'checksum',
  'commissionedBy',
  'commissioningDate',
  'constructedBy',
  'containsElement',
  'customProperties',
  'customTags',
  'description',
  'documentation',
  'format',
  'geometry',
  'georeference',
  'hasPart',
  'hasPoint',
  'identifiers',
  'initialCost',
  'installationDate',
  'installedBy',
  'intersectingElement',
  'isFedBy',
  'isLocationOf',
  'isPartOf',
  'language',
  'levelNumber',
  'locatedIn',
  'maintenanceInterval',
  'manufacturedBy',
  'memberOf',
  'modelNumber',
  'mountedOn',
  'name',
  'operatedBy',
  'ownedBy',
  'owns',
  'serialNumber',
  'servicedBy',
  'size',
  'turnoverDate',
  'url',
  'version',
  'weight',
]);

const BRICK_FIELDS = new Set([
  'aggregate',
  'feeds',
  'hasQuantity',
  'hasSubstance',
  'isPointOf',
  'operationalStageCount',
]);

const SBCO_FIELDS = new Set([
  'building',
  'deviceIdBacnet',
  'deviceType',
  'entries',
  'flag',
  'gatewayId',
  'id',
  'installationArea',
  'instanceNoBacnet',
  'interval',
  'key',
  'localId',
  'maxPresValue',
  'minPresValue',
  'objectTypeBacnet',
  'panel',
  'pointSpecification',
  'pointType',
  'scale',
  'targetArea',
  'unit',
  'value',
  'writable',
]);

const DATE_FIELDS = new Set(['commissioningDate', 'installationDate', 'turnoverDate']);
// datamodels' schema (range: integer/boolean) is the source of truth for these -- see
// smartbuilding_datamodel_builder#27: `interval`/`writable` used to serialize as plain string
// literals, which SHACL's sh:datatype check on the current schema flags as a violation (1,865
// points x 2 fields = 3,730 violations on the THX fixture). `size` was miscategorized under
// DECIMAL_FIELDS below even though the schema declares it integer.
const INTEGER_FIELDS = new Set([
  'levelNumber',
  'operationalStageCount',
  'interval',
  'intervalCapability',
  'size',
]);
// area/capacity are deliberately NOT here even though they look numeric: the synced schema
// declares rec:area/rec:capacity as sh:nodeKind sh:IRI, sh:class rec:ArchitectureArea/
// rec:ArchitectureCapacity -- i.e. object properties pointing at a value+unit node, not scalar
// literals. This tool doesn't construct that node shape (pre-existing gap, out of scope here),
// so they fall through to a plain untyped string literal like before -- tagging them
// `^^xsd:decimal` would assert a datatype the schema doesn't allow at all.
const DECIMAL_FIELDS = new Set(['weight']);
const FLOAT_FIELDS = new Set(['maxPresValue', 'minPresValue', 'scale']);
// Boolean-valued fields normalize through isTruthyValue (row-utils.ts) rather than echoing the
// raw CSV token, since xsd:boolean's lexical space is only true/false/1/0 -- a raw "FALSE" or
// "Y" survives Turtle syntax but is not a valid xsd:boolean value.
const BOOLEAN_FIELDS = new Set(['writable', 'flag']);
const REC_CLASSES = new Set(['Site', 'Building', 'Level', 'Room', 'Space', 'Zone', 'OutdoorSpace']);
const STRUCTURED_FIELDS = new Set(['customProperties', 'customTags', 'identifiers']);

function escapeLiteral(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  return Array.from(escaped, (character) => {
    const code = character.charCodeAt(0);
    return (code <= 0x1f || code === 0x7f) && character !== '\\'
      ? `\\u${code.toString(16).padStart(4, '0')}`
      : character;
  }).join('');
}

function strictPercentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function predicateFor(field: string): string {
  if (REC_FIELDS.has(field)) return `rec:${field}`;
  if (BRICK_FIELDS.has(field)) return `brick:${field}`;
  if (SBCO_FIELDS.has(field)) return `sbco:${field}`;
  return `<${UNKNOWN_PROPERTY_BASE}${strictPercentEncode(getOriginalHeaderName(field))}>`;
}

function literalFor(field: string, value: string): string {
  if (BOOLEAN_FIELDS.has(field)) return `"${isTruthyValue(value)}"^^xsd:boolean`;
  const literal = `"${escapeLiteral(value)}"`;
  if (DATE_FIELDS.has(field)) return `${literal}^^xsd:date`;
  if (INTEGER_FIELDS.has(field)) return `${literal}^^xsd:integer`;
  if (DECIMAL_FIELDS.has(field)) return `${literal}^^xsd:decimal`;
  if (FLOAT_FIELDS.has(field)) return `${literal}^^xsd:float`;
  return literal;
}

// encodeURIComponent leaves ! ~ * ' ( ) unescaped (they're "unreserved" in
// older URI encoding tables), but Turtle's PN_LOCAL grammar doesn't accept
// them unescaped, and a trailing/leading '.' is disallowed too. Prefixed
// names (sbr:xyz) are only used when the encoded id avoids all of these,
// so the shorthand never produces invalid Turtle; anything else falls back
// to a full bracketed IRI, which has no such restriction.
function isSafeTurtleLocalName(local: string): boolean {
  if (!local || local.startsWith('.') || local.endsWith('.')) return false;
  return !/[!~*'()]/.test(local);
}

function iriFor(baseIri: string, id: string, prefix?: string): string {
  const encoded = encodeURIComponent(id);
  if (prefix && isSafeTurtleLocalName(encoded)) {
    return `${prefix}:${encoded}`;
  }
  return `<${baseIri}${encoded}>`;
}

export function exportRdf(rows: RowRecord[], options: RdfOptions = {}): string {
  const baseIri = options.baseIri ?? DEFAULT_BASE;
  const includePrefixes = options.includePrefixes ?? true;
  const autoFill = options.autoFill ?? true;
  const schemaCache = options.schema ? buildSchemaCache(options.schema) : undefined;

  const { resources, relations } = buildResourceGraph(rows);
  const relationMap = new Map<string, { predicate: string; objectId: string }[]>();
  for (const relation of relations) {
    if (!relationMap.has(relation.subjectId)) {
      relationMap.set(relation.subjectId, []);
    }
    relationMap.get(relation.subjectId)?.push({
      predicate: relation.predicate,
      objectId: relation.objectId,
    });
  }

  const requiredFallback = new Set(['id', 'name']);

  const lines: string[] = [];
  if (includePrefixes) {
    lines.push('@prefix sbco: <https://www.sbco.or.jp/ont/> .');
    lines.push(`@prefix sbr: <${baseIri}> .`);
    lines.push('@prefix rec: <https://w3id.org/rec/> .');
    lines.push('@prefix brick: <https://brickschema.org/schema/Brick#> .');
    lines.push('@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .');
    lines.push('');
  }

  const resourcePrefix = includePrefixes ? 'sbr' : undefined;

  for (const resource of resources) {
    const subject = iriFor(baseIri, resource.id, resourcePrefix);
    const className = resource.className || 'Resource';
    const required = schemaCache
      ? getRequiredPropsFromCache(schemaCache, className)
      : requiredFallback;

    const safeClassName = /^[A-Za-z_][A-Za-z0-9._-]*$/.test(className)
      ? `${REC_CLASSES.has(className) ? 'rec' : 'sbco'}:${className}`
      : `<${SBCO_BASE}${strictPercentEncode(className)}>`;
    const props: string[] = [`a ${safeClassName}`];

    const fields = collectOutputFields(resource.row, required);
    for (const field of fields) {
      if (STRUCTURED_FIELDS.has(field)) continue;
      const value = resolveOutputValue(resource, field, { autoFill });
      if (!value) continue;
      props.push(`${predicateFor(field)} ${literalFor(field, value)}`);
    }

    const relationsForResource = relationMap.get(resource.id) ?? [];
    for (const relation of relationsForResource) {
      props.push(
        `${predicateFor(relation.predicate)} ${iriFor(baseIri, relation.objectId, resourcePrefix)}`,
      );
    }

    lines.push(`${subject} ${props.join(' ;\n  ')} .`);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
