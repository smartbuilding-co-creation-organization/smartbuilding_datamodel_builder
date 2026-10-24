import { Node, RowRecord } from './types';
import { getHierarchyDropReasons, normalizeValue, resolveHierarchySignals } from './row-utils';

// Dataset-wide opt-in: a partially migrated file must never silently mix identities.
export function resolveHierarchyIdVersion(rows: RowRecord[]): '1' | '2' {
  const versions = new Set(rows.map((row) => normalizeValue(row.hierarchyIdVersion) || '1'));
  if (versions.size > 1 || [...versions].some((version) => version !== '1' && version !== '2')) {
    throw new Error('Hierarchy ID version must be uniformly 1 (legacy) or 2.');
  }
  return versions.has('2') ? '2' : '1';
}

// FNV-1a 128 over UTF-8. This is a stable identifier, not a security hash.
// All IDs (explicit and generated) are checked for collisions below; never append counters.
function digest(value: string): string {
  let hash = 0x6c62272e07bb014262b821756295c58dn;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(128, hash * 0x1000000000000000000013bn);
  }
  return hash.toString(16).padStart(32, '0');
}

export function buildIdentityTree(rows: RowRecord[]): Node[] {
  const nodes = new Map<string, Node>();
  const byId = new Map<string, Node>();
  const roots: Node[] = [];

  const ensure = (kind: string, explicitId: string, name: string, parent?: Node): Node => {
    // JSON tuples preserve punctuation boundaries; labels never go through a lossy slug.
    const treeKey = JSON.stringify([
      kind,
      parent?.id ?? '',
      explicitId ? 'id' : 'name',
      explicitId || name,
    ]);
    const id = explicitId || `${kind.toLowerCase()}-${digest(treeKey)}`;
    const existing = nodes.get(treeKey);
    if (existing) {
      if (existing.name !== (name || id))
        throw new Error(`Hierarchy identity has conflicting labels: ${id}`);
      return existing;
    }
    if (byId.has(id)) throw new Error(`Hierarchy identity collision or conflicting parent: ${id}`);
    const node: Node = { id, treeKey, name: name || id, kind, parentId: parent?.id, children: [] };
    nodes.set(treeKey, node);
    byId.set(id, node);
    if (parent) parent.children.push(node);
    else roots.push(node);
    return node;
  };

  for (const row of rows) {
    if (getHierarchyDropReasons(row).length > 0) continue;
    const signals = resolveHierarchySignals(row);
    const site = ensure('Site', normalizeValue(row.siteId), signals.site);
    const building = ensure('Building', normalizeValue(row.buildingId), signals.building, site);
    let parent = building;
    if (signals.level) parent = ensure('Level', normalizeValue(row.levelId), signals.level, parent);
    if (signals.room)
      parent = ensure(signals.roomKind || 'Room', normalizeValue(row.roomId), signals.room, parent);
    if (signals.deviceId || signals.deviceName) {
      parent = ensure(
        'EquipmentExt',
        signals.deviceId,
        signals.deviceName || signals.deviceId,
        parent,
      );
      if (signals.pointId || signals.pointName) {
        ensure('PointExt', signals.pointId, signals.pointName || signals.pointId, parent);
      }
    }
  }
  // Canonical graph traversal also makes serialized output independent of CSV row order.
  const sort = (children: Node[]) => {
    children.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    children.forEach((child) => sort(child.children));
  };
  sort(roots);
  return roots;
}
