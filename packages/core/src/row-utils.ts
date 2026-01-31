import { RowRecord } from './types';

const INVALID_HIERARCHY_VALUES = new Set(['-', '－']);

const HIERARCHY_SIGNAL_GROUPS = {
  site: ['site', 'siteName', 'siteId'],
  building: ['building', 'buildingName', 'buildingId'],
  level: ['level', 'levelName', 'floor', 'floorName'],
  room: ['installationArea', 'room', 'space', 'targetArea', 'zone'],
  device: ['deviceId', 'deviceName'],
  point: ['pointId', 'pointName'],
} as const;

const ROOM_KIND_MAP: Record<string, string> = {
  installationArea: 'Room',
  room: 'Room',
  space: 'Room',
  targetArea: 'Room',
  zone: 'Zone',
};

export function normalizeValue(value: string | undefined): string {
  return (value ?? '').toString().trim();
}

function normalizeHierarchyValue(value: string | undefined): string {
  const trimmed = normalizeValue(value);
  if (!trimmed) return '';
  return INVALID_HIERARCHY_VALUES.has(trimmed) ? '' : trimmed;
}

function pickFirst(row: RowRecord, keys: readonly string[]): string {
  for (const key of keys) {
    const value = normalizeHierarchyValue(row[key]);
    if (value) return value;
  }
  return '';
}

function pickFirstWithKind(
  row: RowRecord,
  keys: readonly string[],
): { value: string; kind: string } {
  for (const key of keys) {
    const value = normalizeHierarchyValue(row[key]);
    if (value) return { value, kind: ROOM_KIND_MAP[key] ?? 'Room' };
  }
  return { value: '', kind: '' };
}

export function resolveHierarchySignals(row: RowRecord): {
  site: string;
  building: string;
  level: string;
  room: string;
  roomKind: string;
  deviceId: string;
  deviceName: string;
  pointId: string;
  pointName: string;
} {
  const roomSignal = pickFirstWithKind(row, HIERARCHY_SIGNAL_GROUPS.room);

  return {
    site: pickFirst(row, HIERARCHY_SIGNAL_GROUPS.site),
    building: pickFirst(row, HIERARCHY_SIGNAL_GROUPS.building),
    level: pickFirst(row, HIERARCHY_SIGNAL_GROUPS.level),
    room: roomSignal.value,
    roomKind: roomSignal.kind,
    deviceId: normalizeHierarchyValue(row.deviceId),
    deviceName: normalizeHierarchyValue(row.deviceName),
    pointId: normalizeHierarchyValue(row.pointId),
    pointName: normalizeHierarchyValue(row.pointName),
  };
}

export function hasHierarchySignals(rows: RowRecord[]): boolean {
  return rows.some((row) => {
    const signals = resolveHierarchySignals(row);
    return Boolean(
      signals.site ||
      signals.building ||
      signals.level ||
      signals.room ||
      signals.deviceId ||
      signals.deviceName ||
      signals.pointId ||
      signals.pointName,
    );
  });
}

export function getHierarchySignature(row: RowRecord): string {
  const signals = resolveHierarchySignals(row);
  return [
    signals.site,
    signals.building,
    signals.level,
    signals.room,
    signals.roomKind,
    signals.deviceId,
    signals.deviceName,
    signals.pointId,
    signals.pointName,
  ].join('|');
}

export function hasHierarchySignalChange(prevRow: RowRecord, nextRow: RowRecord): boolean {
  return getHierarchySignature(prevRow) !== getHierarchySignature(nextRow);
}

export function listMissingHierarchyParents(row: RowRecord): string[] {
  const signals = resolveHierarchySignals(row);
  const hasSite = Boolean(signals.site);
  const hasBuilding = Boolean(signals.building);
  const hasLevel = Boolean(signals.level);
  const hasRoom = Boolean(signals.room);
  const hasDevice = Boolean(signals.deviceId || signals.deviceName);
  const hasPoint = Boolean(signals.pointId || signals.pointName);
  const hasAnySignal = hasSite || hasBuilding || hasLevel || hasRoom || hasDevice || hasPoint;
  if (!hasAnySignal) return [];

  const missing: string[] = [];
  if ((hasBuilding || hasLevel || hasRoom || hasDevice || hasPoint) && !hasSite) {
    missing.push('site');
  }
  if ((hasLevel || hasRoom || hasDevice || hasPoint) && !hasBuilding) {
    missing.push('building');
  }
  if ((hasRoom || hasDevice || hasPoint) && !hasLevel) {
    missing.push('level');
  }
  if (hasPoint && !hasDevice) missing.push('device');
  return missing;
}

export function syncRowIdentifiers(prevRow: RowRecord, nextRow: RowRecord): RowRecord {
  const updated: RowRecord = { ...nextRow };

  const prevPointId = normalizeValue(prevRow.pointId);
  const nextPointId = normalizeValue(nextRow.pointId);
  const prevDeviceId = normalizeValue(prevRow.deviceId);
  const nextDeviceId = normalizeValue(nextRow.deviceId);

  const prevPointName = normalizeValue(prevRow.pointName);
  const nextPointName = normalizeValue(nextRow.pointName);
  const prevDeviceName = normalizeValue(prevRow.deviceName);
  const nextDeviceName = normalizeValue(nextRow.deviceName);

  if (nextPointId && (!normalizeValue(nextRow.id) || normalizeValue(prevRow.id) === prevPointId)) {
    updated.id = nextPointId;
  } else if (
    !nextPointId &&
    nextDeviceId &&
    (!normalizeValue(nextRow.id) || normalizeValue(prevRow.id) === prevDeviceId)
  ) {
    updated.id = nextDeviceId;
  }

  if (
    nextPointName &&
    (!normalizeValue(nextRow.name) || normalizeValue(prevRow.name) === prevPointName)
  ) {
    updated.name = nextPointName;
  } else if (
    !nextPointName &&
    nextDeviceName &&
    (!normalizeValue(nextRow.name) || normalizeValue(prevRow.name) === prevDeviceName)
  ) {
    updated.name = nextDeviceName;
  }

  return updated;
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
