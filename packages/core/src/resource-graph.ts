import { buildTree } from './tree';
import { Node, RowRecord } from './types';
import { inferRowKind, normalizeValue, resolveRowId, resolveRowName } from './row-utils';

type ResourceCategory = 'space' | 'equipment' | 'point' | 'other';

const KIND_CLASS: Record<string, string> = {
  site: 'Site',
  building: 'Building',
  floor: 'Level',
  level: 'Level',
  space: 'Room',
  room: 'Room',
  zone: 'Zone',
  outdoorspace: 'OutdoorSpace',
  device: 'EquipmentExt',
  equipment: 'EquipmentExt',
  equipmentext: 'EquipmentExt',
  point: 'PointExt',
  pointext: 'PointExt',
};

const SPACE_CLASSES = new Set([
  'Site',
  'Building',
  'Level',
  'Room',
  'Space',
  'Zone',
  'OutdoorSpace',
]);

const EQUIPMENT_CLASSES = new Set(['Equipment', 'EquipmentExt']);
const POINT_CLASSES = new Set(['Point', 'PointExt']);

function resolveClassName(kind?: string): string {
  const normalized = normalizeValue(kind).toLowerCase();
  if (!normalized) return 'Resource';
  return KIND_CLASS[normalized] ?? kind?.trim() ?? 'Resource';
}

function classCategory(className: string): ResourceCategory {
  if (SPACE_CLASSES.has(className)) return 'space';
  if (EQUIPMENT_CLASSES.has(className)) return 'equipment';
  if (POINT_CLASSES.has(className)) return 'point';
  return 'other';
}

export type ResourceNode = {
  id: string;
  name: string;
  className: string;
  parentId?: string;
  row?: RowRecord;
};

export type ResourceRelation = {
  subjectId: string;
  predicate: string;
  objectId: string;
};

function flattenTree(nodes: Node[]): Node[] {
  const results: Node[] = [];
  const stack = [...nodes];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    results.push(current);
    stack.push(...current.children);
  }
  return results;
}

export function buildResourceGraph(rows: RowRecord[]) {
  const tree = buildTree(rows);
  const rowById = new Map<string, RowRecord>();

  for (const row of rows) {
    const id = resolveRowId(row);
    if (!id || rowById.has(id)) continue;
    rowById.set(id, row);
  }

  const resources: ResourceNode[] = [];
  const resourceById = new Map<string, ResourceNode>();

  for (const node of flattenTree(tree)) {
    const row = rowById.get(node.id);
    const kind = node.kind ?? inferRowKind(row ?? {});
    const className = resolveClassName(kind);
    const name = normalizeValue(node.name) || resolveRowName(row ?? {}, node.id) || node.id;

    const resource: ResourceNode = {
      id: node.id,
      name,
      className,
      parentId: node.parentId,
      row,
    };
    resources.push(resource);
    resourceById.set(resource.id, resource);
  }

  const relations: ResourceRelation[] = [];

  for (const resource of resources) {
    if (!resource.parentId) continue;
    const parent = resourceById.get(resource.parentId);
    if (!parent) continue;

    const childCategory = classCategory(resource.className);
    const parentCategory = classCategory(parent.className);

    if (childCategory === 'point' && (parentCategory === 'equipment' || parentCategory === 'space')) {
      relations.push({
        subjectId: parent.id,
        predicate: 'hasPoint',
        objectId: resource.id,
      });
      continue;
    }

    if (childCategory === 'equipment' && parentCategory === 'space') {
      relations.push({
        subjectId: resource.id,
        predicate: 'locatedIn',
        objectId: parent.id,
      });
      continue;
    }

    if (childCategory === 'space' && parentCategory === 'space') {
      relations.push({
        subjectId: parent.id,
        predicate: 'hasPart',
        objectId: resource.id,
      });
      continue;
    }

    relations.push({
      subjectId: parent.id,
      predicate: 'hasPart',
      objectId: resource.id,
    });
  }

  return { resources, relations };
}
