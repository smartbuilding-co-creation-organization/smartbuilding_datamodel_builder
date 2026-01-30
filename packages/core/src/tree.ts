import { Node, RowRecord } from './types';

let lastIndex = new Map<string, Node>();

function normalizeValue(value: string | undefined): string {
  return (value ?? '').trim();
}

const KIND_LABEL_MAP: Record<string, string> = {
  site: 'Site',
  building: 'Building',
  floor: 'Level',
  level: 'Level',
  space: 'Room',
  room: 'Room',
  zone: 'Zone',
  device: 'EquipmentExt',
  equipment: 'EquipmentExt',
  equipmentext: 'EquipmentExt',
  point: 'PointExt',
  pointext: 'PointExt',
};

function resolveKind(kind?: string): string | undefined {
  const normalized = normalizeValue(kind).toLowerCase();
  if (!normalized) return undefined;
  return KIND_LABEL_MAP[normalized] ?? kind;
}

function resolveId(row: RowRecord): string {
  return (
    normalizeValue(row.id) ||
    normalizeValue(row.pointId) ||
    normalizeValue(row.deviceId)
  );
}

function resolveName(row: RowRecord): string {
  return (
    normalizeValue(row.name) ||
    normalizeValue(row.pointName) ||
    normalizeValue(row.deviceName)
  );
}

function makeSlug(value: string): string {
  const trimmed = normalizeValue(value);
  if (!trimmed) return 'unnamed';
  const slug = trimmed
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._:;-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'unnamed';
}

function buildParentChildTree(rows: RowRecord[]): Node[] {
  const nodes = new Map<string, Node>();

  for (const [rowIndex, row] of rows.entries()) {
    const id = resolveId(row);
    if (!id) continue;

    nodes.set(id, {
      id,
      name: resolveName(row) || id,
      parentId: normalizeValue(row.parentId) || undefined,
      kind: resolveKind(row.kind),
      children: [],
    });
  }

  const roots: Node[] = [];

  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId) && node.parentId !== node.id) {
      nodes.get(node.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  lastIndex = nodes;
  return roots;
}

type HierarchySignals = {
  site?: string;
  building?: string;
  level?: string;
  room?: string;
  roomKind?: string;
  deviceId?: string;
  deviceName?: string;
  pointId?: string;
  pointName?: string;
};

const INVALID_HIERARCHY_VALUES = new Set(['-', '－']);

function normalizeHierarchyValue(value: string | undefined): string {
  const trimmed = normalizeValue(value);
  if (!trimmed) return '';
  return INVALID_HIERARCHY_VALUES.has(trimmed) ? '' : trimmed;
}

function pickFirst(row: RowRecord, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeHierarchyValue(row[key]);
    if (value) return value;
  }
  return '';
}

function pickFirstWithKind(
  row: RowRecord,
  keys: Array<{ key: string; kind: string }>,
): { value: string; kind: string } {
  for (const entry of keys) {
    const value = normalizeHierarchyValue(row[entry.key]);
    if (value) return { value, kind: entry.kind };
  }
  return { value: '', kind: '' };
}

function resolveHierarchySignals(row: RowRecord): HierarchySignals {
  const roomSignal = pickFirstWithKind(row, [
    { key: 'installationArea', kind: 'Room' },
    { key: 'room', kind: 'Room' },
    { key: 'space', kind: 'Room' },
    { key: 'targetArea', kind: 'Room' },
    { key: 'zone', kind: 'Zone' },
  ]);

  return {
    site: pickFirst(row, ['site', 'siteName', 'siteId']),
    building: pickFirst(row, ['building', 'buildingName', 'buildingId']),
    level: pickFirst(row, ['level', 'levelName', 'floor', 'floorName']),
    room: roomSignal.value,
    roomKind: roomSignal.kind,
    deviceId: normalizeValue(row.deviceId),
    deviceName: normalizeValue(row.deviceName),
    pointId: normalizeValue(row.pointId),
    pointName: normalizeValue(row.pointName),
  };
}

function hasHierarchySignals(rows: RowRecord[]): boolean {
  return rows.some((row) => {
    const signals = resolveHierarchySignals(row);
    return (
      signals.site ||
      signals.building ||
      signals.level ||
      signals.deviceId ||
      signals.deviceName ||
      signals.pointId ||
      signals.pointName
    );
  });
}

function buildHierarchyTree(rows: RowRecord[]): Node[] {
  const nodes = new Map<string, Node>();
  const keyToId = new Map<string, string>();

  const ensureUniqueId = (baseId: string): string => {
    if (!nodes.has(baseId)) return baseId;
    let counter = 1;
    let candidate = `${baseId}__${counter}`;
    while (nodes.has(candidate)) {
      counter += 1;
      candidate = `${baseId}__${counter}`;
    }
    return candidate;
  };

  const ensureNode = (
    logicalKey: string,
    fallbackBaseId: string,
    name: string,
    kind: string,
    parentId?: string,
  ): Node => {
    let id = keyToId.get(logicalKey);
    if (!id) {
      id = ensureUniqueId(fallbackBaseId);
      keyToId.set(logicalKey, id);
    }
    let node = nodes.get(id);
    if (!node) {
      node = { id, name: name || id, kind, parentId, children: [] };
      nodes.set(id, node);
    } else {
      if (name && node.name === node.id) node.name = name;
      if (!node.kind) node.kind = kind;
      if (!node.parentId && parentId) node.parentId = parentId;
    }
    return node;
  };

  const ensureChild = (parent: Node, child: Node) => {
    if (!parent.children.some((node) => node.id === child.id)) {
      parent.children.push(child);
    }
  };

  const roots: Node[] = [];
  const ensureRoot = (node: Node) => {
    if (!roots.some((root) => root.id === node.id)) {
      roots.push(node);
    }
  };

  for (const row of rows) {
    const signals = resolveHierarchySignals(row);
    const siteName = signals.site || 'Unknown Site';
    const siteKey = `site:${siteName}`;
    const siteNode = ensureNode(
      siteKey,
      `site:${makeSlug(siteName)}`,
      siteName,
      'Site',
    );

    const buildingName = signals.building || 'Unknown Building';
    const buildingKey = `building:${siteNode.id}:${buildingName}`;
    const buildingNode = ensureNode(
      buildingKey,
      `building:${siteNode.id}/${makeSlug(buildingName)}`,
      buildingName,
      'Building',
      siteNode.id,
    );
    ensureChild(siteNode, buildingNode);

    const levelName = signals.level || 'Unknown Level';
    const levelKey = `level:${buildingNode.id}:${levelName}`;
    const levelNode = ensureNode(
      levelKey,
      `level:${buildingNode.id}/${makeSlug(levelName)}`,
      levelName,
      'Level',
      buildingNode.id,
    );
    ensureChild(buildingNode, levelNode);

    const canUseRoom = Boolean(signals.level);
    let roomParent = levelNode;
    if (canUseRoom && signals.room) {
      const roomName = signals.room;
      const roomKind = signals.roomKind || 'Room';
      const roomKey = `room:${levelNode.id}:${roomName}`;
      const roomNode = ensureNode(
        roomKey,
        `room:${levelNode.id}/${makeSlug(roomName)}`,
        roomName,
        roomKind,
        levelNode.id,
      );
      ensureChild(levelNode, roomNode);
      roomParent = roomNode;
    }

    const deviceKeyValue = signals.deviceId || signals.deviceName || '';
    const deviceLogicalKey = deviceKeyValue
      ? `equipment:${roomParent.id}:${deviceKeyValue}`
      : `equipment:${roomParent.id}:row:${normalizeValue(row.__rowId) || rowIndex}`;
    const deviceBaseId = signals.deviceId
      ? signals.deviceId
      : `equipment:${roomParent.id}/${makeSlug(signals.deviceName || 'equipment')}`;
    const deviceName = signals.deviceName || signals.deviceId || 'Equipment';
    const deviceNode = ensureNode(
      deviceLogicalKey,
      deviceBaseId,
      deviceName,
      'EquipmentExt',
      roomParent.id,
    );
    ensureChild(roomParent, deviceNode);

    const pointKeyValue = signals.pointId || signals.pointName || '';
    const pointLogicalKey = pointKeyValue
      ? `point:${deviceNode.id}:${pointKeyValue}`
      : `point:${deviceNode.id}:row:${normalizeValue(row.__rowId) || rowIndex}`;
    const pointBaseId = signals.pointId
      ? signals.pointId
      : `point:${deviceNode.id}/${makeSlug(signals.pointName || 'point')}`;
    const pointName = signals.pointName || signals.pointId || 'Point';
    const pointNode = ensureNode(
      pointLogicalKey,
      pointBaseId,
      pointName,
      'PointExt',
      deviceNode.id,
    );
    ensureChild(deviceNode, pointNode);

    ensureRoot(siteNode);
  }

  lastIndex = nodes;
  return roots;
}

export function buildTree(rows: RowRecord[]): Node[] {
  const hasParentIds = rows.some((row) => normalizeValue(row.parentId));
  if (hasParentIds || !hasHierarchySignals(rows)) {
    return buildParentChildTree(rows);
  }
  return buildHierarchyTree(rows);
}

export function computeDescendants(nodeId: string): string[] {
  const start = lastIndex.get(nodeId);
  if (!start) return [];

  const results: string[] = [];
  const stack = [...start.children];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    results.push(current.id);
    stack.push(...current.children);
  }

  return results;
}
