import { z } from 'zod';
import { getRequiredPropsFromCache, SchemaRoot, buildSchemaCache } from './schema-mapping';
import { inferRowKind, listMissingHierarchyParents, normalizeValue } from './row-utils';
import { Issue, RowRecord } from './types';

const KindSchema = z.enum(['site', 'building', 'floor', 'space', 'device', 'point']);

const POINTLIST_REQUIRED_FIELDS = [
  'gatewayId',
  'pointId',
  'pointName',
  'pointType',
  'pointSpecification',
  'writable',
  'deviceId',
  'deviceName',
  'deviceType',
  'site',
  'building',
  'floor',
  'installationArea',
  'localId',
];

const RowSchema = z
  .object({
    id: z.string().min(1, 'Required'),
    name: z.string().min(1, 'Required'),
    parentId: z.string().optional(),
    kind: KindSchema.optional(),
  })
  .passthrough();

function normalizeRow(row: RowRecord): RowRecord {
  const normalized: RowRecord = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = (value ?? '').toString().trim();
  }
  return normalized;
}

function hasKey(row: RowRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function resolveIdKey(row: RowRecord): string {
  if (row.id) return 'id';
  if (hasKey(row, 'pointId') || hasKey(row, 'pointName')) return 'pointId';
  if (hasKey(row, 'deviceId') || hasKey(row, 'deviceName')) return 'deviceId';
  return 'id';
}

function resolveNameKey(row: RowRecord): string {
  if (row.name) return 'name';
  if (hasKey(row, 'pointName') || hasKey(row, 'pointId')) return 'pointName';
  if (hasKey(row, 'deviceName') || hasKey(row, 'deviceId')) return 'deviceName';
  return 'name';
}

function resolveRow(row: RowRecord): RowRecord {
  const idKey = resolveIdKey(row);
  const nameKey = resolveNameKey(row);
  const id = row[idKey] ? String(row[idKey]).trim() : '';
  const name = row[nameKey] ? String(row[nameKey]).trim() : '';
  const parentId = row.parentId ? String(row.parentId).trim() : '';
  const kind = row.kind ? String(row.kind).trim() : '';
  return {
    ...row,
    id,
    name,
    parentId,
    kind,
  };
}

type ValidateOptions = {
  schema?: SchemaRoot;
};

function isPointlistRow(row: RowRecord): boolean {
  return (
    hasKey(row, 'pointId') ||
    hasKey(row, 'pointName') ||
    hasKey(row, 'pointType') ||
    hasKey(row, 'pointSpecification') ||
    hasKey(row, 'gatewayId')
  );
}

export function validate(rows: RowRecord[], options: ValidateOptions = {}): { issues: Issue[] } {
  const issues: Issue[] = [];
  const issueKeys = new Set<string>();
  const addIssue = (issue: Issue) => {
    const key = `${issue.code}:${issue.rowId ?? ''}:${issue.field ?? ''}:${issue.message}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push(issue);
  };

  const rowIdForIssue = (row: RowRecord) => {
    const id = row.id ? String(row.id).trim() : '';
    if (id) return id;
    const fallback = row['__rowId'] ? String(row['__rowId']).trim() : '';
    return fallback || undefined;
  };

  const normalizedRows = rows.map((row) => resolveRow(normalizeRow(row)));
  const ids = new Set<string>();
  const idCounts = new Map<string, number>();
  const schemaCache = options.schema ? buildSchemaCache(options.schema) : undefined;

  for (const row of normalizedRows) {
    const schemaRow = {
      ...row,
      parentId: row.parentId ? String(row.parentId).trim() : undefined,
      kind: row.kind ? String(row.kind).trim() : undefined,
    };
    const result = RowSchema.safeParse(schemaRow);
    if (!result.success) {
      for (const detail of result.error.issues) {
        let field = detail.path[0] ? String(detail.path[0]) : undefined;
        if (field === 'id') field = resolveIdKey(row);
        if (field === 'name') field = resolveNameKey(row);
        addIssue({
          code: 'schema',
          message: detail.message,
          rowId: rowIdForIssue(row),
          field,
        });
      }
    }

    if (row.id) {
      ids.add(row.id);
      idCounts.set(row.id, (idCounts.get(row.id) ?? 0) + 1);
    }

    if (schemaCache) {
      const kind = row.kind ? normalizeValue(row.kind) : inferRowKind(row);
      const required = getRequiredPropsFromCache(schemaCache, kind);
      for (const field of required) {
        if (field === 'id' || field === 'name') continue;
        const value = field === 'id' ? row.id : field === 'name' ? row.name : row[field];
        if (!normalizeValue(value)) {
          addIssue({
            code: 'schema',
            message: 'Required',
            rowId: rowIdForIssue(row),
            field,
          });
        }
      }
    }

    if (isPointlistRow(row)) {
      for (const field of POINTLIST_REQUIRED_FIELDS) {
        const value = row[field];
        if (!normalizeValue(value)) {
          addIssue({
            code: 'schema',
            message: 'Required',
            rowId: rowIdForIssue(row),
            field,
          });
        }
      }
    }

    const hierarchyMissing = listMissingHierarchyParents(row);
    if (hierarchyMissing.length > 0) {
      for (const missingField of hierarchyMissing) {
        addIssue({
          code: 'hierarchy_missing',
          message: `Hierarchy parent missing: ${missingField}`,
          rowId: rowIdForIssue(row),
          field: missingField,
        });
      }
    }
  }

  for (const [id, count] of idCounts.entries()) {
    if (count > 1) {
      addIssue({
        code: 'id_duplicate',
        message: `Duplicate id: ${id}`,
        rowId: id,
        field: 'id',
      });
    }
  }

  for (const row of normalizedRows) {
    if (row.parentId && !ids.has(row.parentId)) {
      addIssue({
        code: 'parent_missing',
        message: `Parent id not found: ${row.parentId}`,
        rowId: rowIdForIssue(row),
        field: 'parentId',
      });
    }
  }

  const parentMap = new Map<string, string | undefined>();
  for (const row of normalizedRows) {
    if (row.id) {
      parentMap.set(row.id, row.parentId || undefined);
    }
  }

  const state = new Map<string, number>();
  const visit = (id: string, stack: string[]) => {
    const currentState = state.get(id) ?? 0;
    if (currentState === 1) {
      const cycleStart = stack.indexOf(id);
      const cycleNodes = cycleStart >= 0 ? stack.slice(cycleStart) : [id];
      for (const nodeId of cycleNodes) {
        addIssue({
          code: 'cycle',
          message: `Cycle detected at ${nodeId}`,
          rowId: nodeId,
          field: 'parent_id',
        });
      }
      return;
    }
    if (currentState === 2) return;

    state.set(id, 1);
    const parent = parentMap.get(id);
    if (parent && parentMap.has(parent)) {
      visit(parent, [...stack, id]);
    }
    state.set(id, 2);
  };

  for (const id of parentMap.keys()) {
    visit(id, []);
  }

  return { issues };
}
