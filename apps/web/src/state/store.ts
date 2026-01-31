import { create } from 'zustand';
import type { SchemaRoot } from '@repo/core';
import {
  buildTree,
  Issue,
  Node,
  resolveRowId,
  RowRecord,
  syncRowIdentifiers,
  validate,
} from '@repo/core';

type AppState = {
  csvRows: RowRecord[];
  csvColumns: string[];
  rows: RowRecord[];
  tree: Node[];
  selectedId: string;
  issues: Issue[];
  schema?: SchemaRoot;
  setData: (
    csvRows: RowRecord[],
    csvColumns: string[],
    rows: RowRecord[],
    schema?: SchemaRoot,
  ) => void;
  setSelectedId: (id: string) => void;
  updateRow: (oldRowId: string, row: RowRecord) => void;
};

function recompute(rows: RowRecord[], schema?: SchemaRoot) {
  const tree = buildTree(rows);
  const { issues } = validate(rows, schema ? { schema } : undefined);
  return { tree, issues };
}

export const useAppStore = create<AppState>((set, get) => ({
  csvRows: [],
  csvColumns: [],
  rows: [],
  tree: [],
  selectedId: 'root',
  issues: [],
  schema: undefined,
  setData: (csvRows, csvColumns, rows, schema) => {
    const { tree, issues } = recompute(rows, schema);
    set({ csvRows, csvColumns, rows, tree, issues, selectedId: 'root', schema });
  },
  setSelectedId: (id) => set({ selectedId: id }),
  updateRow: (oldRowId, row) => {
    const current = get().rows;
    const oldRow = current.find((item) => (item.__rowId ?? item.id) === oldRowId);
    const nextRow = oldRow ? syncRowIdentifiers(oldRow, row) : row;
    const nextRows = current.map((item) =>
      (item.__rowId ?? item.id) === oldRowId ? nextRow : item,
    );
    const { tree, issues } = recompute(nextRows, get().schema);
    const selectedId = get().selectedId;
    let nextSelectedId = selectedId;
    if (oldRow) {
      const prevFocusId = resolveRowId(oldRow);
      const nextFocusId = resolveRowId(nextRow);
      if (selectedId === prevFocusId && nextFocusId && prevFocusId !== nextFocusId) {
        nextSelectedId = nextFocusId;
      }
    }
    set({ rows: nextRows, tree, issues, selectedId: nextSelectedId });
  },
}));
