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
      // resource.parentId and resource.className are the graph-computed parent/type --
      // synthesized from Site/Building/Level/Room/Device columns, or resolved from an explicit
      // kind column -- but they live on the ResourceNode, not in row/resource.row, and both
      // `parentId`/`kind` are filtered out of mergeRowValues as internal keys. Every output row
      // downstream (RDF/YAML export, buildResourceModelMap) re-derives its own resource graph
      // from these rows via buildResourceGraph(rows) rather than reusing this pass's resources,
      // so without restoring both here, that second pass has to re-guess `kind` per row
      // (resource-graph.ts's `node.kind ?? inferRowKind(row)` -- a heuristic that only
      // recognizes point/device signals, not space/equipment.ext ones) instead of trusting what
      // was already correctly resolved once. See smartbuilding_datamodel_builder#34.
      if (resource.parentId) {
        mergedRow.parentId = resource.parentId;
      }
      if (!normalizeValue(mergedRow.kind)) {
        mergedRow.kind = resource.className;
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
