import { RowRecord } from './types';

type RdfOptions = {
  baseIri?: string;
  includePrefixes?: boolean;
};

const DEFAULT_BASE = 'https://www.sbco.or.jp/ont/resource/';

const KIND_CLASS: Record<string, string> = {
  site: 'Site',
  building: 'Building',
  floor: 'Level',
  space: 'Room',
  device: 'Equipment',
  point: 'Point',
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

function escapeLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

function iriFor(baseIri: string, id: string): string {
  const encoded = encodeURIComponent(id);
  return `<${baseIri}${encoded}>`;
}

export function exportRdf(rows: RowRecord[], options: RdfOptions = {}): string {
  const baseIri = options.baseIri ?? DEFAULT_BASE;
  const includePrefixes = options.includePrefixes ?? true;

  const lines: string[] = [];
  if (includePrefixes) {
    lines.push('@prefix sbco: <https://www.sbco.or.jp/ont/> .');
    lines.push(`@prefix sbr: <${baseIri}> .`);
    lines.push('@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .');
    lines.push('');
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const id = resolveId(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const name = resolveName(row, id);
    const kind = normalizeValue(row.kind);
    const className = KIND_CLASS[kind] ?? 'Resource';
    const parentId = normalizeValue(row.parentId);

    const subject = iriFor(baseIri, id);
    const props: string[] = [
      `a sbco:${className}`,
      `sbco:id "${escapeLiteral(id)}"`,
      `sbco:name "${escapeLiteral(name)}"`,
    ];
    if (parentId) {
      props.push(`sbco:isPartOf ${iriFor(baseIri, parentId)}`);
    }

    lines.push(`${subject} ${props.join(' ;\n  ')} .`);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
