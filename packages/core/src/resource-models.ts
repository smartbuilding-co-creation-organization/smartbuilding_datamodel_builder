import { buildResourceGraph } from './resource-graph';
import { normalizeValue } from './row-utils';
import { RowRecord } from './types';

export type ResourceModelMap = Map<string, RowRecord>;

export function buildResourceModelMap(rows: RowRecord[]): ResourceModelMap {
  const { resources } = buildResourceGraph(rows);
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
    map.set(resource.id, record);
  }

  return map;
}
