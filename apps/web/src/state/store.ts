import { create } from 'zustand';
import { buildTree, Issue, Node, RowRecord, validate } from '@repo/core';

type AppState = {
  rows: RowRecord[];
  columns: string[];
  tree: Node[];
  selectedId: string;
  issues: Issue[];
  setData: (rows: RowRecord[], columns: string[]) => void;
  setSelectedId: (id: string) => void;
  updateRow: (oldRowId: string, row: RowRecord) => void;
};

function recompute(rows: RowRecord[]) {
  const tree = buildTree(rows);
  const { issues } = validate(rows);
  return { tree, issues };
}

export const useAppStore = create<AppState>((set, get) => ({
  rows: [],
  columns: [],
  tree: [],
  selectedId: 'root',
  issues: [],
  setData: (rows, columns) => {
    const { tree, issues } = recompute(rows);
    set({ rows, columns, tree, issues, selectedId: 'root' });
  },
  setSelectedId: (id) => set({ selectedId: id }),
  updateRow: (oldRowId, row) => {
    const current = get().rows;
    const nextRows = current.map((item) =>
      (item.__rowId ?? item.id) === oldRowId ? row : item,
    );
    const { tree, issues } = recompute(nextRows);
    set({ rows: nextRows, tree, issues });
  },
}));
