import { RowRecord } from './types';

type YamlOptions = {
  baseIri?: string;
};

const DEFAULT_BASE = 'https://www.sbco.or.jp/ont/resource/';

const KIND_CLASS: Record<string, string> = {
  site: 'sbco:Site',
  building: 'sbco:Building',
  floor: 'sbco:Level',
  space: 'sbco:Room',
  device: 'sbco:Equipment',
  point: 'sbco:Point',
};

function normalizeValue(value: string | undefined): string {
  return (value ?? '').toString().trim();
}

function resolveId(row: RowRecord): string {
  return normalizeValue(row.id) || normalizeValue(row.pointId) || normalizeValue(row.deviceId);
}

function resolveName(row: RowRecord, fallbackId: string): string {
  return (
    normalizeValue(row.name) ||
    normalizeValue(row.pointName) ||
    normalizeValue(row.deviceName) ||
    fallbackId
  );
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\"/g, '\\"');
}

function iriFor(baseIri: string, id: string): string {
  const encoded = encodeURIComponent(id);
  return `${baseIri}${encoded}`;
}

export function exportYaml(rows: RowRecord[], options: YamlOptions = {}): string {
  const baseIri = options.baseIri ?? DEFAULT_BASE;
  const lines: string[] = ['resources:'];
  const seen = new Set<string>();

  for (const row of rows) {
    const id = resolveId(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const name = resolveName(row, id);
    const kind = normalizeValue(row.kind);
    const className = KIND_CLASS[kind] ?? 'sbco:Resource';
    const parentId = normalizeValue(row.parentId);

    lines.push(`  - id: "${escapeYaml(id)}"`);
    lines.push(`    name: "${escapeYaml(name)}"`);
    lines.push(`    class: "${className}"`);
    lines.push(`    iri: "${escapeYaml(iriFor(baseIri, id))}"`);
    if (parentId) {
      lines.push(`    isPartOf: "${escapeYaml(iriFor(baseIri, parentId))}"`);
    }
  }

  return lines.join('\n') + '\n';
}
