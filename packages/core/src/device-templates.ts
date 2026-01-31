import { normalizeValue } from './row-utils';
import { RowRecord } from './types';

export type TemplateAccess = 'read' | 'readWrite';

export type DeviceTemplateProperty = {
  name: string;
  description?: string;
  access: TemplateAccess;
  default?: string;
  pointType: string;
};

export type DeviceTemplate = {
  namespace: string;
  deviceType: string;
  className: string;
  description?: string;
  properties: DeviceTemplateProperty[];
};

export type DeviceTemplateMismatch = {
  name: string;
  expected: DeviceTemplateProperty;
  actual: DeviceTemplateProperty;
  differences: string[];
};

export type DeviceTemplateDiff = {
  namespace: string;
  deviceType: string;
  missing: DeviceTemplateProperty[];
  extra: DeviceTemplateProperty[];
  mismatched: DeviceTemplateMismatch[];
};

type TemplateBuildOptions = {
  namespaceResolver?: (row: RowRecord) => string;
};

type TemplateParseOptions = {
  namespace?: string;
  deviceType?: string;
};

const READWRITE_HINTS = new Set(['readwrite', 'read-write', 'rw', 'write', 'true', '1', 'yes']);

function resolveNamespace(row: RowRecord): string {
  return normalizeValue(row.namespace) || normalizeValue(row.domain) || 'default';
}

function resolveDeviceType(row: RowRecord): string {
  return (
    normalizeValue(row.deviceType) ||
    normalizeValue(row.equipmentType) ||
    normalizeValue(row.deviceName)
  );
}

function resolvePointType(row: RowRecord): string {
  return (
    normalizeValue(row.pointType) ||
    normalizeValue(row.pointSpecification) ||
    normalizeValue(row.objectTypeBacnet)
  );
}

function resolvePropertyName(row: RowRecord): string {
  return (
    normalizeValue(row.pointType) || normalizeValue(row.pointName) || normalizeValue(row.pointId)
  );
}

function resolvePropertyDescription(row: RowRecord): string {
  return (
    normalizeValue(row.pointSpecification) ||
    normalizeValue(row.pointName) ||
    normalizeValue(row.description)
  );
}

function resolveAccess(row: RowRecord): TemplateAccess {
  const raw = normalizeValue(row.access) || normalizeValue(row.writable);
  if (!raw) return 'read';
  return READWRITE_HINTS.has(raw.toLowerCase()) ? 'readWrite' : 'read';
}

function resolveDefaultValue(row: RowRecord): string {
  return normalizeValue(row.defaultValue) || normalizeValue(row.default);
}

function ensurePropertyDefaults(property: DeviceTemplateProperty): DeviceTemplateProperty {
  return {
    ...property,
    access: property.access || 'read',
    pointType: property.pointType || property.name,
  };
}

function parseYamlValue(raw: string | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseYamlKeyValue(line: string): { key: string; value: string } | undefined {
  const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
  if (!match) return undefined;
  return { key: match[1], value: parseYamlValue(match[2]) };
}

export function buildDeviceTemplatesFromCsv(
  rows: RowRecord[],
  options: TemplateBuildOptions = {},
): DeviceTemplate[] {
  const namespaceResolver = options.namespaceResolver ?? resolveNamespace;
  const templates = new Map<
    string,
    { template: DeviceTemplate; propertyMap: Map<string, DeviceTemplateProperty> }
  >();

  for (const row of rows) {
    const deviceType = resolveDeviceType(row);
    if (!deviceType) continue;
    const namespace = namespaceResolver(row);
    const key = `${namespace}:${deviceType}`;
    if (!templates.has(key)) {
      templates.set(key, {
        template: {
          namespace,
          deviceType,
          className: deviceType,
          description: '',
          properties: [],
        },
        propertyMap: new Map(),
      });
    }

    const propertyName = resolvePropertyName(row);
    if (!propertyName) continue;

    const templateEntry = templates.get(key);
    if (!templateEntry) continue;

    if (!templateEntry.propertyMap.has(propertyName)) {
      const property: DeviceTemplateProperty = ensurePropertyDefaults({
        name: propertyName,
        description: resolvePropertyDescription(row) || undefined,
        access: resolveAccess(row),
        default: resolveDefaultValue(row) || undefined,
        pointType: resolvePointType(row) || propertyName,
      });
      templateEntry.propertyMap.set(propertyName, property);
    } else {
      const existing = templateEntry.propertyMap.get(propertyName);
      if (existing) {
        templateEntry.propertyMap.set(propertyName, {
          ...existing,
          description: existing.description || resolvePropertyDescription(row) || undefined,
          pointType: existing.pointType || resolvePointType(row) || existing.name,
        });
      }
    }
  }

  for (const entry of templates.values()) {
    entry.template.properties = Array.from(entry.propertyMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  return Array.from(templates.values()).map((entry) => entry.template);
}

export function diffDeviceTemplate(
  expected: DeviceTemplate,
  actual: DeviceTemplate,
): DeviceTemplateDiff {
  const expectedMap = new Map(expected.properties.map((prop) => [prop.name, prop]));
  const actualMap = new Map(actual.properties.map((prop) => [prop.name, prop]));
  const missing: DeviceTemplateProperty[] = [];
  const extra: DeviceTemplateProperty[] = [];
  const mismatched: DeviceTemplateMismatch[] = [];

  for (const [name, prop] of expectedMap.entries()) {
    const actualProp = actualMap.get(name);
    if (!actualProp) {
      missing.push(prop);
      continue;
    }
    const differences: string[] = [];
    if (prop.access !== actualProp.access) differences.push('access');
    if (normalizeValue(prop.pointType) !== normalizeValue(actualProp.pointType)) {
      differences.push('pointType');
    }
    if (normalizeValue(prop.description) !== normalizeValue(actualProp.description)) {
      differences.push('description');
    }
    if (differences.length > 0) {
      mismatched.push({ name, expected: prop, actual: actualProp, differences });
    }
  }

  for (const [name, prop] of actualMap.entries()) {
    if (!expectedMap.has(name)) {
      extra.push(prop);
    }
  }

  return {
    namespace: expected.namespace,
    deviceType: expected.deviceType,
    missing,
    extra,
    mismatched,
  };
}

export function parseDeviceTemplateYaml(
  yaml: string,
  options: TemplateParseOptions = {},
): DeviceTemplate {
  const lines = yaml.split(/\r?\n/);
  const template: DeviceTemplate = {
    namespace: options.namespace ?? 'default',
    deviceType: options.deviceType ?? '',
    className: '',
    description: '',
    properties: [],
  };

  let inProperties = false;
  let current: Partial<DeviceTemplateProperty> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed === 'properties:') {
      inProperties = true;
      continue;
    }

    if (!inProperties) {
      const parsed = parseYamlKeyValue(trimmed);
      if (!parsed) continue;
      if (parsed.key === 'className') template.className = parsed.value;
      if (parsed.key === 'description') template.description = parsed.value;
      continue;
    }

    if (trimmed.startsWith('- ')) {
      if (current && current.name) {
        template.properties.push(ensurePropertyDefaults(current as DeviceTemplateProperty));
      }
      current = {};
      const entry = parseYamlKeyValue(trimmed.slice(2));
      if (entry) {
        if (entry.key === 'name') current.name = entry.value;
        if (entry.key === 'description') current.description = entry.value;
        if (entry.key === 'access') current.access = entry.value as TemplateAccess;
        if (entry.key === 'default') current.default = entry.value;
        if (entry.key === 'pointType') current.pointType = entry.value;
      }
      continue;
    }

    if (current) {
      const entry = parseYamlKeyValue(trimmed);
      if (!entry) continue;
      if (entry.key === 'name') current.name = entry.value;
      if (entry.key === 'description') current.description = entry.value;
      if (entry.key === 'access') current.access = entry.value as TemplateAccess;
      if (entry.key === 'default') current.default = entry.value;
      if (entry.key === 'pointType') current.pointType = entry.value;
    }
  }

  if (current && current.name) {
    template.properties.push(ensurePropertyDefaults(current as DeviceTemplateProperty));
  }

  template.properties = template.properties.filter((prop) => prop.name);
  return template;
}

export function serializeDeviceTemplate(template: DeviceTemplate): string {
  const lines: string[] = [];
  const push = (line: string) => lines.push(line);

  const escape = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

  push(`className: ${escape(template.className || template.deviceType)}`);
  if (template.description) {
    push(`description: ${escape(template.description)}`);
  }
  push('properties:');
  for (const property of template.properties) {
    push(`  - name: ${escape(property.name)}`);
    if (property.description) {
      push(`    description: ${escape(property.description)}`);
    }
    push(`    access: ${escape(property.access)}`);
    if (property.default) {
      push(`    default: ${escape(property.default)}`);
    }
    push(`    pointType: ${escape(property.pointType)}`);
  }
  return lines.join('\n') + '\n';
}

export async function buildTemplatesZip(templates: DeviceTemplate[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const files = templates.map((template) => {
    const namespace = normalizeValue(template.namespace) || 'default';
    const deviceType = normalizeValue(template.deviceType) || template.className || 'template';
    const path = `templates/${namespace}/${deviceType}.yaml`;
    const data = encoder.encode(serializeDeviceTemplate(template));
    return { path, data };
  });

  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const header = buildLocalFileHeader(file.data, nameBytes);
    localChunks.push(header, nameBytes, file.data);

    const central = buildCentralDirectoryHeader(file.data, nameBytes, offset);
    centralChunks.push(central, nameBytes);

    offset += header.length + nameBytes.length + file.data.length;
  }

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const endRecord = buildEndOfCentralDirectory(files.length, centralSize, offset);

  return concatUint8Arrays([...localChunks, ...centralChunks, endRecord]);
}

function buildLocalFileHeader(data: Uint8Array, name: Uint8Array): Uint8Array {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc32(data), true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  return header;
}

function buildCentralDirectoryHeader(
  data: Uint8Array,
  name: Uint8Array,
  offset: number,
): Uint8Array {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc32(data), true);
  view.setUint32(20, data.length, true);
  view.setUint32(24, data.length, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  return header;
}

function buildEndOfCentralDirectory(
  entries: number,
  centralSize: number,
  centralOffset: number,
): Uint8Array {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entries, true);
  view.setUint16(10, entries, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return header;
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function applyTemplateToRows(rows: RowRecord[], template: DeviceTemplate): RowRecord[] {
  if (!template.deviceType) return rows;
  const deviceType = normalizeValue(template.deviceType);
  const propertyMap = new Map(template.properties.map((prop) => [prop.name, prop]));

  return rows.map((row) => {
    const rowDeviceType = resolveDeviceType(row);
    if (!rowDeviceType || normalizeValue(rowDeviceType) !== deviceType) {
      return row;
    }
    const rowKey =
      normalizeValue(row.pointType) || normalizeValue(row.pointName) || normalizeValue(row.pointId);
    if (!rowKey) return row;
    const property = propertyMap.get(rowKey);
    if (!property) return row;
    return {
      ...row,
      pointType: property.pointType,
    };
  });
}
