import Papa from 'papaparse';
import { mapRowsToSchema, SchemaRoot } from './schema-mapping';
import { RowRecord } from './types';

let lastHeader: string[] = [];

type ParseCsvOptions = {
  schema?: SchemaRoot;
};

export function parseCsv(text: string, options: ParseCsvOptions = {}): RowRecord[] {
  const result = Papa.parse<RowRecord>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => {
      const trimmed = header.trim();
      if (!trimmed.includes('_')) return trimmed;
      const parts = trimmed.split('_').filter((part) => part.length > 0);
      if (parts.length === 0) return trimmed;
      const [first, ...rest] = parts;
      const head = first.toLowerCase();
      const tail = rest
        .map((part) => part.toLowerCase())
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
      return `${head}${tail}`;
    },
    transform: (value) => (value ?? '').toString(),
  });

  if (result.meta.fields && result.meta.fields.length > 0) {
    lastHeader = result.meta.fields.filter((field) => field && field.trim().length > 0);
  }

  const rows = (result.data ?? [])
    .map((row) => {
      const record: RowRecord = {};
      for (const [key, value] of Object.entries(row)) {
        if (!key) continue;
        record[key] = value === undefined || value === null ? '' : String(value);
      }
      if (!record.id) {
        record.id = record.pointId || record.deviceId || '';
      }
      if (!record.name) {
        record.name = record.pointName || record.deviceName || '';
      }
      return record;
    })
    .filter((record) => Object.values(record).some((value) => String(value).trim() !== ''));

  if (options.schema) {
    return mapRowsToSchema(rows, options.schema);
  }

  return rows;
}

export function getLastHeader(): string[] {
  return [...lastHeader];
}

export function exportCsv(rows: RowRecord[]): string {
  const columns =
    lastHeader.length > 0
      ? lastHeader
      : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return Papa.unparse(rows, { columns });
}
