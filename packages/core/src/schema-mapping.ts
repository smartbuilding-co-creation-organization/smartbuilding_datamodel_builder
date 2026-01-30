import { RowRecord } from './types';

type SchemaDefinition = {
  properties?: Record<string, unknown>;
  required?: string[];
};

export type SchemaRoot = {
  properties?: Record<string, unknown>;
  required?: string[];
  $defs?: Record<string, SchemaDefinition>;
};

type SchemaCache = {
  byKind: Map<string, Set<string>>;
  root: Set<string>;
};

const KIND_TO_DEF: Record<string, string> = {
  site: 'Site',
  building: 'Building',
  floor: 'Level',
  space: 'Room',
  device: 'Equipment',
  point: 'Point',
};

const INTERNAL_KEYS = new Set([
  '__rowId',
  'parentId',
  'kind',
  'pointId',
  'pointName',
  'deviceId',
  'deviceName',
]);

function toPropSet(def?: SchemaDefinition): Set<string> {
  const props = def?.properties ? Object.keys(def.properties) : [];
  const required = def?.required ?? [];
  return new Set([...props, ...required]);
}

function buildCache(schema: SchemaRoot): SchemaCache {
  const root = toPropSet(schema);
  const byKind = new Map<string, Set<string>>();

  if (schema.$defs) {
    for (const [defName, def] of Object.entries(schema.$defs)) {
      byKind.set(defName.toLowerCase(), toPropSet(def));
    }
  }

  return { byKind, root };
}

function getSchemaProps(cache: SchemaCache, kind?: string): Set<string> {
  const key = kind ? KIND_TO_DEF[kind] ?? kind : undefined;
  if (!key) return cache.root;
  const props = cache.byKind.get(key.toLowerCase());
  return props ?? cache.root;
}

function parseCustomProperties(value: string | undefined): Record<string, string> {
  if (!value) return {};
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, unknown>);
      const normalized: Record<string, string> = {};
      for (const [key, val] of entries) {
        normalized[key] = val === undefined || val === null ? '' : String(val);
      }
      return normalized;
    }
  } catch {
    // fall through to store raw value
  }
  return { __raw: trimmed };
}

export function mapRowsToSchema(rows: RowRecord[], schema: SchemaRoot): RowRecord[] {
  const cache = buildCache(schema);

  return rows.map((row) => {
    const kind = row.kind ? row.kind.trim().toLowerCase() : undefined;
    const propSet = getSchemaProps(cache, kind);
    const mapped: RowRecord = {};

    for (const prop of propSet) {
      mapped[prop] = row[prop] ?? '';
    }

    for (const key of INTERNAL_KEYS) {
      if (row[key] !== undefined) {
        mapped[key] = row[key];
      }
    }

    const unknown: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (INTERNAL_KEYS.has(key)) continue;
      if (propSet.has(key)) {
        mapped[key] = value ?? '';
      } else {
        unknown[key] = value ?? '';
        // Keep original columns for CSV round-trip while still capturing them.
        mapped[key] = value ?? '';
      }
    }

    const existingCustom = parseCustomProperties(mapped.customProperties);
    const merged = { ...existingCustom, ...unknown };
    if (Object.keys(merged).length > 0) {
      mapped.customProperties = JSON.stringify(merged);
    } else if (propSet.has('customProperties') && !mapped.customProperties) {
      mapped.customProperties = '';
    }

    if (mapped.parentId && propSet.has('isPartOf') && !mapped.isPartOf) {
      mapped.isPartOf = mapped.parentId;
    }

    return mapped;
  });
}
