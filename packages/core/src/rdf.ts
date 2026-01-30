import { buildResourceGraph } from './resource-graph';
import {
  buildSchemaCache,
  getRequiredPropsFromCache,
  SchemaRoot,
} from './schema-mapping';
import { RowRecord } from './types';
import { normalizeValue } from './row-utils';

type RdfOptions = {
  baseIri?: string;
  includePrefixes?: boolean;
  schema?: SchemaRoot;
  autoFill?: boolean;
};

const DEFAULT_BASE = 'https://www.sbco.or.jp/ont/resource/';

function escapeLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

function iriFor(baseIri: string, id: string): string {
  const encoded = encodeURIComponent(id);
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
    lines.push('@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .');
    lines.push('');
  }

  for (const resource of resources) {
    const subject = iriFor(baseIri, resource.id);
    const className = resource.className || 'Resource';
    const required = schemaCache
      ? getRequiredPropsFromCache(schemaCache, className)
      : requiredFallback;

    const props: string[] = [`a sbco:${className}`];

    for (const field of required) {
      if (field === 'id') {
        props.push(`sbco:id "${escapeLiteral(resource.id)}"`);
        continue;
      }
      if (field === 'name') {
        const value = normalizeValue(resource.name) || (autoFill ? resource.id : '');
        if (value) {
          props.push(`sbco:name "${escapeLiteral(value)}"`);
        }
        continue;
      }

      const rowValue = normalizeValue(resource.row?.[field]);
      const fallbackValue =
        field === 'pointType'
          ? normalizeValue(resource.row?.pointSpecification) ||
            normalizeValue(resource.row?.objectTypeBacnet) ||
            ''
          : '';
      const finalValue = rowValue || fallbackValue || (autoFill ? 'Unknown' : '');
      if (finalValue) {
        props.push(`sbco:${field} "${escapeLiteral(finalValue)}"`);
      }
    }

    const relationsForResource = relationMap.get(resource.id) ?? [];
    for (const relation of relationsForResource) {
      props.push(`sbco:${relation.predicate} ${iriFor(baseIri, relation.objectId)}`);
    }

    lines.push(`${subject} ${props.join(' ;\n  ')} .`);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
