import { buildResourceGraph, ResourceNode } from './resource-graph';
import { RowRecord } from './types';
import { normalizeValue } from './row-utils';

const INTERNAL_KEYS = new Set([
  '__rowId',
  'parentId',
  'kind',
  'pointId',
  'pointName',
  'deviceId',
  'deviceName',
]);

function cloneRow(row: RowRecord): RowRecord {
  return { ...row };
}

function mergeRowValues(base: RowRecord, overrides: RowRecord): RowRecord {
  const result: RowRecord = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (INTERNAL_KEYS.has(key)) continue;
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function buildOutputRows(rows: RowRecord[]): RowRecord[] {
  const baseById = new Map<string, RowRecord>();
  for (const row of rows) {
    const id = normalizeValue(row.id);
    if (!id) continue;
    baseById.set(id, cloneRow(row));
  }

  const { resources } = buildResourceGraph(rows);
  const outputRows: RowRecord[] = [];

  for (const resource of resources) {
    const baseRow = baseById.get(resource.id);
    if (baseRow) {
      const mergedRow = mergeRowValues(baseRow, resource.row ?? {});
      // resource.parentId is the graph-computed parent (explicit column or synthesized
      // from Site/Building/Level/Room/Device columns) — it lives on the ResourceNode, not
      // in row/resource.row, and parentId is filtered out of mergeRowValues as an internal
      // key. Without restoring it here, every row that came from the original CSV (i.e. every
      // row with a baseRow) loses its parent link in the output, so downstream RDF export has
      // no hierarchy edge to emit for it (only synthesized rows, which never have a baseRow,
      // kept theirs via resourceRowFromResource).
      if (resource.parentId) {
        mergedRow.parentId = resource.parentId;
      }
      outputRows.push(mergedRow);
      continue;
    }
    outputRows.push(resourceRowFromResource(resource));
  }

  return outputRows;
}

function resourceRowFromResource(resource: ResourceNode): RowRecord {
  const row: RowRecord = {
    id: resource.id,
    name: resource.name || resource.id,
    kind: resource.className,
  };
  if (resource.parentId) {
    row.parentId = resource.parentId;
  }
  if (resource.row) {
    return mergeRowValues(row, resource.row);
  }
  return row;
}

export function mergeOutputRows(baseRows: RowRecord[], modelRows: RowRecord[]): RowRecord[] {
  const baseMap = new Map<string, RowRecord>();
  baseRows.forEach((row) => {
    const id = normalizeValue(row.id);
    if (id) baseMap.set(id, cloneRow(row));
  });

  for (const modelRow of modelRows) {
    const id = normalizeValue(modelRow.id);
    if (!id) continue;
    const existing = baseMap.get(id) ?? { id };
    baseMap.set(id, mergeRowValues(existing, modelRow));
  }

  return Array.from(baseMap.values());
}
