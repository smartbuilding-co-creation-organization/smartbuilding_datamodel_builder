import { create } from 'zustand';
import type { SchemaRoot } from '@repo/core';
import {
  buildTree,
  buildResourceModelMap,
  Issue,
  Node,
  normalizeValue,
  RowRecord,
  validate,
} from '@repo/core';

type AppState = {
  csvRows: RowRecord[];
  csvColumns: string[];
  rows: RowRecord[];
  modelRows: RowRecord[];
  tree: Node[];
  selectedId: string;
  expandedItems: string[];
  view: 'data' | 'templates';
  search: string;
  issues: Issue[];
  outputIssues: Issue[];
  schema?: SchemaRoot;
  setData: (
    csvRows: RowRecord[],
    csvColumns: string[],
    rows: RowRecord[],
    schema?: SchemaRoot,
  ) => void;
  setSelectedId: (id: string) => void;
  setExpandedItems: (ids: string[]) => void;
  setView: (view: 'data' | 'templates') => void;
  setSearch: (search: string) => void;
  updateModelRow: (id: string, row: RowRecord) => void;
  setRows: (rows: RowRecord[]) => void;
  setOutputIssues: (issues: Issue[]) => void;
};

function recompute(rows: RowRecord[], schema?: SchemaRoot) {
  const tree = buildTree(rows);
  const { issues } = validate(rows, schema ? { schema } : undefined);
  return { tree, issues };
}

function initialExpandedItems(tree: Node[]): string[] {
  const items = ['root'];
  const visit = (nodes: Node[], depth: number) => {
    for (const node of nodes) {
      if (depth < 2 && node.children.length > 0) items.push(node.id);
      visit(node.children, depth + 1);
    }
  };
  visit(tree, 0);
  return items;
}

export const useAppStore = create<AppState>((set, get) => ({
  csvRows: [],
  csvColumns: [],
  rows: [],
  modelRows: [],
  tree: [],
  selectedId: 'root',
  expandedItems: ['root'],
  view: 'data',
  search: '',
  issues: [],
  outputIssues: [],
  schema: undefined,
  setData: (csvRows, csvColumns, rows, schema) => {
    const { tree, issues } = recompute(rows, schema);
    const modelRows = Array.from(buildResourceModelMap(rows).values());
    set({
      csvRows,
      csvColumns,
      rows,
      modelRows,
      tree,
      issues,
      outputIssues: [],
      selectedId: 'root',
      expandedItems: initialExpandedItems(tree),
      view: 'data',
      search: '',
      schema,
    });
  },
  setSelectedId: (id) => set({ selectedId: id }),
  setExpandedItems: (expandedItems) => set({ expandedItems }),
  setView: (view) => set({ view }),
  setSearch: (search) => set({ search }),
  updateModelRow: (id, row) => {
    const currentModelRows = get().modelRows;
    const hasModelRow = currentModelRows.some((item) => item.id === id);
    const prevModelRow = currentModelRows.find((item) => item.id === id);
    const nextModelRows = hasModelRow
      ? currentModelRows.map((item) => (item.id === id ? row : item))
      : [...currentModelRows, row];
    const currentRows = get().rows;
    const nextRows = currentRows.map((item) => {
      if (item.id !== id) return item;
      const { kind: _kind, parentId: _parentId, ...rest } = row;
      const merged = { ...item, ...rest } as RowRecord;
      if (item.kind !== undefined) merged.kind = item.kind;
      if (item.parentId !== undefined) merged.parentId = item.parentId;
      return merged;
    });
    const matchedRow = nextRows.some((item) => item.id === id);
    let resolvedRows = nextRows;
    let resolvedModelRows = nextModelRows;
    if (!matchedRow && prevModelRow) {
      const prevName = normalizeValue(prevModelRow.name);
      const nextName = normalizeValue(row.name);
      const kind = normalizeValue(row.kind || prevModelRow.kind).toLowerCase();
      const hierarchyColumns: Record<string, string[]> = {
        site: ['site'],
        building: ['building'],
        level: ['level', 'floor'],
        floor: ['level', 'floor'],
        room: ['installationArea', 'room', 'space', 'targetArea'],
        space: ['installationArea', 'room', 'space', 'targetArea'],
        zone: ['zone', 'targetArea'],
        siteext: ['site'],
        buildingext: ['building'],
        levelext: ['level', 'floor'],
        roomext: ['installationArea', 'room', 'space', 'targetArea'],
      };
      const columns = hierarchyColumns[kind] ?? [];
      if (prevName && nextName && prevName !== nextName && columns.length > 0) {
        resolvedRows = currentRows.map((item) => {
          let updated = item;
          for (const column of columns) {
            if (normalizeValue(item[column]) === prevName) {
              if (updated === item) updated = { ...item } as RowRecord;
              updated[column] = nextName;
            }
          }
          return updated;
        });
        resolvedModelRows = nextModelRows.map((item) => {
          let updated = item;
          for (const column of columns) {
            if (normalizeValue(item[column]) === prevName) {
              if (updated === item) updated = { ...item } as RowRecord;
              updated[column] = nextName;
            }
          }
          return updated;
        });
      }
    }
    const { tree, issues } = recompute(resolvedRows, get().schema);
    const selectedId = get().selectedId;
    const nextSelectedId = selectedId === id && row.id && row.id !== id ? row.id : selectedId;
    const validTreeIds = new Set<string>(['root']);
    const stack = [...tree];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      validTreeIds.add(node.id);
      stack.push(...node.children);
    }
    set({
      modelRows: resolvedModelRows,
      rows: resolvedRows,
      tree,
      issues,
      outputIssues: [],
      selectedId: nextSelectedId,
      expandedItems: get().expandedItems.filter((item) => validTreeIds.has(item)),
    });
  },
  setRows: (rows) => {
    const { tree, issues } = recompute(rows, get().schema);
    const modelRows = Array.from(buildResourceModelMap(rows).values());
    set({ rows, modelRows, tree, issues, outputIssues: [] });
  },
  setOutputIssues: (issues) => set({ outputIssues: issues }),
}));
