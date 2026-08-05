import { buildResourceGraph } from './resource-graph';
import { buildSchemaCache, getRequiredPropsFromCache, SchemaRoot } from './schema-mapping';
import { RowRecord } from './types';
import { collectOutputFields, resolveOutputValue } from './output-utils';
import { getOriginalHeaderName } from './csv';
import { stringify } from 'yaml';

type YamlOptions = {
  baseIri?: string;
  schema?: SchemaRoot;
  autoFill?: boolean;
};

const DEFAULT_BASE = 'https://www.sbco.or.jp/ont/resource/';

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
  const outputResources: Record<string, unknown>[] = [];

  for (const resource of resources) {
    const className = resource.className || 'Resource';
    const required = schemaCache
      ? getRequiredPropsFromCache(schemaCache, className)
      : requiredFallback;

    const name = resolveOutputValue(resource, 'name', { autoFill });

    const outputResource: Record<string, unknown> = { id: resource.id };
    if (name) {
      outputResource.name = name;
    }
    outputResource.class = `sbco:${className}`;
    outputResource.iri = iriFor(baseIri, resource.id);

    const fields = collectOutputFields(resource.row, required).filter(
      (field) => field !== 'id' && field !== 'name',
    );
    for (const field of fields) {
      const value = resolveOutputValue(resource, field, { autoFill });
      if (!value) continue;
      outputResource[getOriginalHeaderName(field)] = value;
    }

    const predicateMap = relationMap.get(resource.id);
    if (predicateMap) {
      for (const [predicate, targets] of predicateMap.entries()) {
        if (targets.length === 1) {
          outputResource[predicate] = iriFor(baseIri, targets[0]);
        } else if (targets.length > 1) {
          outputResource[predicate] = targets.map((target) => iriFor(baseIri, target));
        }
      }
    }
    outputResources.push(outputResource);
  }

  return stringify(
    { resources: outputResources },
    {
      defaultKeyType: 'QUOTE_DOUBLE',
      defaultStringType: 'QUOTE_DOUBLE',
      lineWidth: 0,
    },
  );
}
