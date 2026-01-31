import { buildResourceGraph } from './resource-graph';
import { buildSchemaCache, getRequiredPropsFromCache, SchemaRoot } from './schema-mapping';
import { RowRecord } from './types';
import { collectOutputFields, resolveOutputValue } from './output-utils';

type YamlOptions = {
  baseIri?: string;
  schema?: SchemaRoot;
  autoFill?: boolean;
};

const DEFAULT_BASE = 'https://www.sbco.or.jp/ont/resource/';

function escapeYaml(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function iriFor(baseIri: string, id: string): string {
  const encoded = encodeURIComponent(id);
  return `${baseIri}${encoded}`;
}

export function exportYaml(rows: RowRecord[], options: YamlOptions = {}): string {
  const baseIri = options.baseIri ?? DEFAULT_BASE;
  const autoFill = options.autoFill ?? true;
  const schemaCache = options.schema ? buildSchemaCache(options.schema) : undefined;
  const { resources, relations } = buildResourceGraph(rows);

  const relationMap = new Map<string, Map<string, string[]>>();
  for (const relation of relations) {
    if (!relationMap.has(relation.subjectId)) {
      relationMap.set(relation.subjectId, new Map());
    }
    const predicateMap = relationMap.get(relation.subjectId);
    if (!predicateMap?.has(relation.predicate)) {
      predicateMap?.set(relation.predicate, []);
    }
    predicateMap?.get(relation.predicate)?.push(relation.objectId);
  }

  const requiredFallback = new Set(['id', 'name']);
  const lines: string[] = ['resources:'];

  for (const resource of resources) {
    const className = resource.className || 'Resource';
    const required = schemaCache
      ? getRequiredPropsFromCache(schemaCache, className)
      : requiredFallback;

    const name = resolveOutputValue(resource, 'name', { autoFill });

    lines.push(`  - id: "${escapeYaml(resource.id)}"`);
    if (name) {
      lines.push(`    name: "${escapeYaml(name)}"`);
    }
    lines.push(`    class: "sbco:${className}"`);
    lines.push(`    iri: "${escapeYaml(iriFor(baseIri, resource.id))}"`);

    const fields = collectOutputFields(resource.row, required).filter(
      (field) => field !== 'id' && field !== 'name',
    );
    for (const field of fields) {
      const value = resolveOutputValue(resource, field, { autoFill });
      if (!value) continue;
      lines.push(`    ${field}: "${escapeYaml(value)}"`);
    }

    const predicateMap = relationMap.get(resource.id);
    if (predicateMap) {
      for (const [predicate, targets] of predicateMap.entries()) {
        if (targets.length === 1) {
          lines.push(`    ${predicate}: "${escapeYaml(iriFor(baseIri, targets[0]))}"`);
        } else if (targets.length > 1) {
          lines.push(`    ${predicate}:`);
          for (const target of targets) {
            lines.push(`      - "${escapeYaml(iriFor(baseIri, target))}"`);
          }
        }
      }
    }
  }

  return lines.join('\n') + '\n';
}
