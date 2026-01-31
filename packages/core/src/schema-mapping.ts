import { RowRecord } from './types';

export type SchemaRoot = {
  properties?: Record<string, unknown>;
  required?: string[];
  $defs?: Record<string, unknown>;
};

type SchemaDefinition = {
  properties?: Record<string, unknown>;
  required?: string[];
};

export type SchemaCache = {
  byKind: Map<string, Set<string>>;
  root: Set<string>;
  requiredByKind: Map<string, Set<string>>;
  requiredRoot: Set<string>;
};

const KIND_TO_DEF: Record<string, string> = {
  site: 'Site',
  building: 'Building',
  floor: 'Level',
  level: 'Level',
  space: 'Room',
  room: 'Room',
  device: 'EquipmentExt',
  equipment: 'EquipmentExt',
  equipmentext: 'EquipmentExt',
  point: 'PointExt',
  pointext: 'PointExt',
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toPropSet(def?: unknown): Set<string> {
  if (!isObject(def)) return new Set<string>();
  const props = isObject(def.properties) ? Object.keys(def.properties) : [];
  const required = Array.isArray(def.required) ? def.required : [];
  return new Set([...props, ...required]);
}

function toRequiredSet(def?: unknown): Set<string> {
  if (!isObject(def)) return new Set<string>();
  const required = Array.isArray(def.required) ? def.required : [];
  return new Set(required);
}

export function buildSchemaCache(schema: SchemaRoot): SchemaCache {
  const root = toPropSet(schema);
  const requiredRoot = toRequiredSet(schema);
  const byKind = new Map<string, Set<string>>();
  const requiredByKind = new Map<string, Set<string>>();

  if (schema.$defs) {
    for (const [defName, def] of Object.entries(schema.$defs)) {
      const propSet = toPropSet(def);
      if (propSet.size > 0) {
        byKind.set(defName.toLowerCase(), propSet);
      }
      const required = toRequiredSet(def);
      if (required.size > 0) {
        requiredByKind.set(defName.toLowerCase(), required);
      }
    }
  }

  return { byKind, root, requiredByKind, requiredRoot };
}

function normalizeKindKey(kind?: string): string | undefined {
  if (!kind) return undefined;
  const trimmed = kind.trim();
  if (!trimmed) return undefined;
  const mapped = KIND_TO_DEF[trimmed.toLowerCase()] ?? trimmed;
  return mapped;
}

function resolveSchemaDefinition(
  schemaRoot: SchemaRoot,
  kind?: string,
): SchemaDefinition | undefined {
  const normalized = normalizeKindKey(kind);
  if (!normalized) return schemaRoot;
  if (!schemaRoot.$defs) return schemaRoot;
  const def = schemaRoot.$defs[normalized];
  return (def as SchemaDefinition) ?? schemaRoot;
}

export function getSchemaPropertyDescription(
  schemaRoot: SchemaRoot,
  kind: string | undefined,
  property: string,
): string | undefined {
  const schemaDef = resolveSchemaDefinition(schemaRoot, kind);
  const fromDef = schemaDef?.properties?.[property];
  const fromRoot = schemaRoot.properties?.[property];
  if (fromDef && typeof fromDef === 'object' && 'description' in fromDef) {
    const value = (fromDef as Record<string, unknown>).description;
    return typeof value === 'string' ? value : undefined;
  }
  if (fromRoot && typeof fromRoot === 'object' && 'description' in fromRoot) {
    const value = (fromRoot as Record<string, unknown>).description;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function getSchemaProps(cache: SchemaCache, kind?: string): Set<string> {
  const key = normalizeKindKey(kind);
  if (!key) return cache.root;
  const props = cache.byKind.get(key.toLowerCase());
  return props ?? cache.root;
}

export function getRequiredPropsFromCache(cache: SchemaCache, kind?: string): Set<string> {
  const key = normalizeKindKey(kind);
  if (!key) return cache.requiredRoot;
  const required = cache.requiredByKind.get(key.toLowerCase());
  return required ?? cache.requiredRoot;
}

export function getRequiredProps(schema: SchemaRoot, kind?: string): string[] {
  const cache = buildSchemaCache(schema);
  return Array.from(getRequiredPropsFromCache(cache, kind));
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
  const cache = buildSchemaCache(schema);

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
