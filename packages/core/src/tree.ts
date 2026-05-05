import { Node, RowRecord } from './types';
import { hasHierarchySignals, normalizeValue, resolveHierarchySignals } from './row-utils';
import { KIND_TO_CLASS } from './constants';

let lastIndex = new Map<string, Node>();

function resolveKind(kind?: string): string | undefined {
  const normalized = normalizeValue(kind).toLowerCase();
  if (!normalized) return undefined;
  return KIND_TO_CLASS[normalized] ?? kind;
}

function resolveId(row: RowRecord): string {
  return normalizeValue(row.id) || normalizeValue(row.pointId) || normalizeValue(row.deviceId);
}

function resolveName(row: RowRecord): string {
  return (
    normalizeValue(row.name) || normalizeValue(row.pointName) || normalizeValue(row.deviceName)
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

  for (const row of rows) {
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
    if (!signals.site || !signals.building || !signals.level) {
      continue;
    }

    if ((signals.pointId || signals.pointName) && !(signals.deviceId || signals.deviceName)) {
      continue;
    }

    const siteName = signals.site;
    const siteKey = `site:${siteName}`;
    const siteNode = ensureNode(siteKey, `site:${makeSlug(siteName)}`, siteName, 'Site');

    const buildingName = signals.building;
    const buildingKey = `building:${siteNode.id}:${buildingName}`;
    const buildingNode = ensureNode(
      buildingKey,
      `building:${siteNode.id}/${makeSlug(buildingName)}`,
      buildingName,
      'Building',
      siteNode.id,
    );
    ensureChild(siteNode, buildingNode);

    const levelName = signals.level;
    const levelKey = `level:${buildingNode.id}:${levelName}`;
    const levelNode = ensureNode(
      levelKey,
      `level:${buildingNode.id}/${makeSlug(levelName)}`,
      levelName,
      'Level',
      buildingNode.id,
    );
    ensureChild(buildingNode, levelNode);

    let roomParent = levelNode;
    if (signals.room) {
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

    if (signals.deviceId || signals.deviceName) {
      const deviceKeyValue = signals.deviceId || signals.deviceName;
      const deviceLogicalKey = `equipment:${roomParent.id}:${deviceKeyValue}`;
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

      if (signals.pointId || signals.pointName) {
        const pointKeyValue = signals.pointId || signals.pointName;
        const pointLogicalKey = `point:${deviceNode.id}:${pointKeyValue}`;
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
      }
    }

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
