import Papa from 'papaparse';
import { mapRowsToSchema, SchemaRoot } from './schema-mapping';
import { RowRecord } from './types';

export type CsvInputLimits = {
  maxBytes: number;
  maxRows: number;
  maxColumns: number;
  maxCellBytes: number;
};

export const DEFAULT_CSV_INPUT_LIMITS: Readonly<CsvInputLimits> = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxRows: 20_000,
  maxColumns: 100,
  maxCellBytes: 32 * 1024,
});

export type CsvInputLimitKind = 'bytes' | 'rows' | 'columns' | 'cellBytes';

export class CsvInputLimitError extends Error {
  readonly code = 'CSV_INPUT_LIMIT_EXCEEDED';

  constructor(
    readonly kind: CsvInputLimitKind,
    readonly actual: number,
    readonly maximum: number,
    readonly row?: number,
    readonly column?: string,
  ) {
    const location = row === undefined ? '' : ` (${row}行目${column ? `、列「${column}」` : ''})`;
    super(
      `CSVの${limitLabel(kind)}が上限 ${formatLimit(kind, maximum)} を超えています${location}。`,
    );
    this.name = 'CsvInputLimitError';
  }
}

export class CsvParseError extends Error {
  readonly code = 'CSV_PARSE_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

type HeaderMapping = { source: string; key: string };

let lastHeaderMappings: HeaderMapping[] = [];

type ParseCsvOptions = {
  schema?: SchemaRoot;
  limits?: Partial<CsvInputLimits>;
};

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function limitLabel(kind: CsvInputLimitKind): string {
  switch (kind) {
    case 'bytes':
      return 'ファイルサイズ';
    case 'rows':
      return '行数';
    case 'columns':
      return '列数';
    case 'cellBytes':
      return 'セルサイズ';
  }
}

function formatLimit(kind: CsvInputLimitKind, value: number): string {
  if (kind === 'bytes' || kind === 'cellBytes') {
    return value % (1024 * 1024) === 0 ? `${value / (1024 * 1024)} MiB` : `${value / 1024} KiB`;
  }
  return `${value.toLocaleString('ja-JP')}${kind === 'rows' ? '行' : '列'}`;
}

export function normalizeCsvHeader(header: string): string {
  const trimmed = header.trim();
  if (!trimmed.includes('_')) return trimmed;
  const parts = trimmed.split('_').filter((part) => part.length > 0);
  if (parts.length === 0) return trimmed;
  const [first, ...rest] = parts;
  return `${first.toLowerCase()}${rest
    .map((part) => part.toLowerCase())
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')}`;
}

export function parseCsv(text: string, options: ParseCsvOptions = {}): RowRecord[] {
  const limits: CsvInputLimits = { ...DEFAULT_CSV_INPUT_LIMITS, ...options.limits };
  const inputBytes = byteLength(text);
  if (inputBytes > limits.maxBytes) {
    throw new CsvInputLimitError('bytes', inputBytes, limits.maxBytes);
  }

  const headerMappings: HeaderMapping[] = [];
  const result = Papa.parse<RowRecord>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header, index) => {
      const existing = headerMappings[index];
      if (existing) return existing.key;
      const source = header.trim();
      const key = normalizeCsvHeader(source);
      headerMappings[index] = { source, key };
      return key;
    },
    transform: (value) => (value ?? '').toString(),
  });

  const fatalParseError = result.errors.find((error) => error.code !== 'UndetectableDelimiter');
  if (fatalParseError) {
    throw new CsvParseError(`CSVを解析できません: ${fatalParseError.message}`);
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

  const columns = (result.meta.fields ?? []).filter((field) => field.trim().length > 0);
  if (columns.length > limits.maxColumns) {
    throw new CsvInputLimitError('columns', columns.length, limits.maxColumns);
  }
  if (rows.length > limits.maxRows) {
    throw new CsvInputLimitError('rows', rows.length, limits.maxRows);
  }
  for (const [rowIndex, row] of rows.entries()) {
    for (const [column, value] of Object.entries(row)) {
      const cellBytes = byteLength(value);
      if (cellBytes > limits.maxCellBytes) {
        const sourceColumn = headerMappings.find((entry) => entry.key === column)?.source ?? column;
        throw new CsvInputLimitError(
          'cellBytes',
          cellBytes,
          limits.maxCellBytes,
          rowIndex + 2,
          sourceColumn,
        );
      }
    }
  }

  lastHeaderMappings = headerMappings.filter(
    (entry) => entry && entry.source.length > 0 && columns.includes(entry.key),
  );

  if (options.schema) {
    return mapRowsToSchema(rows, options.schema);
  }

  return rows;
}

export function getLastHeader(): string[] {
  return lastHeaderMappings.map(({ source }) => source);
}

export function getOriginalHeaderName(key: string): string {
  return lastHeaderMappings.find((entry) => entry.key === key)?.source ?? key;
}

// Rebuilds the header mapping from a dataset that did not come through
// parseCsv() (e.g. the built-in sample data). Without this, exportCsv()
// keeps using whatever CSV was parsed last, silently mismatching a
// differently-shaped dataset now on screen.
export function resetHeaderFromRows(rows: RowRecord[]): void {
  const seen = new Set<string>();
  const mappings: HeaderMapping[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key.startsWith('__') || seen.has(key)) continue;
      seen.add(key);
      mappings.push({ source: key, key });
    }
  }
  lastHeaderMappings = mappings;
}

function fallbackColumns(rows: RowRecord[]): HeaderMapping[] {
  return Array.from(
    new Set(rows.flatMap((row) => Object.keys(row)).filter((key) => !key.startsWith('__'))),
  ).map((key) => ({ source: key, key }));
}

function escapeSpreadsheetFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function exportCsv(rows: RowRecord[]): string {
  const mappings = lastHeaderMappings.length > 0 ? lastHeaderMappings : fallbackColumns(rows);
  const exportRows = rows.map((row) =>
    Object.fromEntries(
      mappings.map(({ source, key }) => [source, escapeSpreadsheetFormula(String(row[key] ?? ''))]),
    ),
  );
  return Papa.unparse(exportRows, { columns: mappings.map(({ source }) => source) });
}
