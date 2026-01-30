import { RowRecord } from './types';

export function normalizeValue(value: string | undefined): string {
  return (value ?? '').toString().trim();
}

export function resolveRowId(row: RowRecord): string {
  return normalizeValue(row.id) || normalizeValue(row.pointId) || normalizeValue(row.deviceId);
}

export function resolveRowName(row: RowRecord, fallbackId: string): string {
  return (
    normalizeValue(row.name) ||
    normalizeValue(row.pointName) ||
    normalizeValue(row.deviceName) ||
    fallbackId
  );
}

export function inferRowKind(row: RowRecord): string | undefined {
  const explicit = normalizeValue(row.kind).toLowerCase();
  if (explicit) return explicit;

  if (
    normalizeValue(row.pointId) ||
    normalizeValue(row.pointName) ||
    normalizeValue(row.pointType) ||
    normalizeValue(row.pointSpecification)
  ) {
    return 'point';
  }

  if (
    normalizeValue(row.deviceId) ||
    normalizeValue(row.deviceName) ||
    normalizeValue(row.deviceType)
  ) {
    return 'device';
  }

  return undefined;
}
