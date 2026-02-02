import { buildResourceGraph } from './resource-graph';
import { normalizeValue } from './row-utils';
import { RowRecord } from './types';

export type ResourceModelMap = Map<string, RowRecord>;

export function buildResourceModelMap(rows: RowRecord[]): ResourceModelMap {
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
  const map: ResourceModelMap = new Map();

  for (const resource of resources) {
    if (resource.row) {
      const row: RowRecord = {
        ...resource.row,
        id: normalizeValue(resource.row.id) || resource.id,
        name: normalizeValue(resource.row.name) || resource.name,
        kind: normalizeValue(resource.row.kind) || resource.className,
      };
      if (resource.parentId && !row.parentId) {
        row.parentId = resource.parentId;
      }
      const predicateMap = relationMap.get(resource.id);
      if (predicateMap) {
        for (const [predicate, targets] of predicateMap.entries()) {
          if (normalizeValue(row[predicate])) continue;
          row[predicate] = targets.length > 1 ? targets.join(', ') : targets[0] ?? '';
        }
      }
      map.set(resource.id, row);
      continue;
    }

    const record: RowRecord = {
      id: resource.id,
      name: resource.name || resource.id,
      kind: resource.className,
    };
    if (resource.parentId) {
      record.parentId = resource.parentId;
    }
    const predicateMap = relationMap.get(resource.id);
    if (predicateMap) {
      for (const [predicate, targets] of predicateMap.entries()) {
        if (normalizeValue(record[predicate])) continue;
        record[predicate] = targets.length > 1 ? targets.join(', ') : targets[0] ?? '';
      }
    }
    map.set(resource.id, record);
  }

  return map;
}
