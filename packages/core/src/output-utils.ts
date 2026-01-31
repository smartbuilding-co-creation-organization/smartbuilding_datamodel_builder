import { ResourceNode } from './resource-graph';
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

const RELATION_KEYS = new Set([
  'isPointOf',
  'hasPoint',
  'locatedIn',
  'isLocationOf',
  'isPartOf',
  'hasPart',
]);

type OutputValueOptions = {
  autoFill?: boolean;
};

export function collectOutputFields(row: RowRecord | undefined, required: Set<string>): string[] {
  const fields = new Set<string>();

  for (const field of required) {
    if (RELATION_KEYS.has(field)) continue;
    fields.add(field);
  }

  if (row) {
    for (const key of Object.keys(row)) {
      if (INTERNAL_KEYS.has(key)) continue;
      if (RELATION_KEYS.has(key)) continue;
      fields.add(key);
    }
  }

  return Array.from(fields);
}

export function resolveOutputValue(
  resource: ResourceNode,
  field: string,
  options: OutputValueOptions = {},
): string {
  const autoFill = options.autoFill ?? true;

  if (field === 'id') {
    return resource.id;
  }

  if (field === 'kind' || field === 'className') {
    return resource.className || '';
  }

  if (field === 'name') {
    const value = normalizeValue(resource.name);
    return value || (autoFill ? resource.id : '');
  }

  const rowValue = normalizeValue(resource.row?.[field]);
  if (rowValue) return rowValue;

  if (field === 'pointType') {
    const fallback =
      normalizeValue(resource.row?.pointSpecification) ||
      normalizeValue(resource.row?.objectTypeBacnet) ||
      '';
    return fallback;
  }

  return '';
}
