import { create } from 'zustand';
import type { SchemaRoot } from '@repo/core';
import { buildTree, Issue, Node, RowRecord, validate } from '@repo/core';

type AppState = {
  rows: RowRecord[];
  columns: string[];
  tree: Node[];
  selectedId: string;
  issues: Issue[];
  schema?: SchemaRoot;
  setData: (rows: RowRecord[], columns: string[], schema?: SchemaRoot) => void;
  setSelectedId: (id: string) => void;
  updateRow: (oldRowId: string, row: RowRecord) => void;
};

function recompute(rows: RowRecord[], schema?: SchemaRoot) {
  const tree = buildTree(rows);
  const { issues } = validate(rows, schema ? { schema } : undefined);
  return { tree, issues };
}

export const useAppStore = create<AppState>((set, get) => ({
  rows: [],
  columns: [],
  tree: [],
  selectedId: 'root',
  issues: [],
  schema: undefined,
  setData: (rows, columns, schema) => {
    const { tree, issues } = recompute(rows, schema);
    set({ rows, columns, tree, issues, selectedId: 'root', schema });
  },
  setSelectedId: (id) => set({ selectedId: id }),
  updateRow: (oldRowId, row) => {
    const current = get().rows;
    const nextRows = current.map((item) =>
      (item.__rowId ?? item.id) === oldRowId ? row : item,
    );
    const { tree, issues } = recompute(nextRows, get().schema);
    set({ rows: nextRows, tree, issues });
  },
}));
