import { Node, RowRecord } from './types';

let lastIndex = new Map<string, Node>();

function normalizeValue(value: string | undefined): string {
  return (value ?? '').trim();
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

export function buildTree(rows: RowRecord[]): Node[] {
  const nodes = new Map<string, Node>();

  for (const row of rows) {
    const id = resolveId(row);
    if (!id) continue;

    nodes.set(id, {
      id,
      name: resolveName(row) || id,
      parentId: normalizeValue(row.parentId) || undefined,
      kind: normalizeValue(row.kind) || undefined,
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
