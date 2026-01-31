import { create } from 'zustand';
import type { SchemaRoot } from '@repo/core';
import { buildTree, buildResourceModelMap, Issue, Node, RowRecord, validate } from '@repo/core';

type AppState = {
  csvRows: RowRecord[];
  csvColumns: string[];
  rows: RowRecord[];
  modelRows: RowRecord[];
  tree: Node[];
  selectedId: string;
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
  updateModelRow: (id: string, row: RowRecord) => void;
  setRows: (rows: RowRecord[]) => void;
  setOutputIssues: (issues: Issue[]) => void;
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
  modelRows: [],
  tree: [],
  selectedId: 'root',
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
      schema,
    });
  },
  setSelectedId: (id) => set({ selectedId: id }),
  updateModelRow: (id, row) => {
    const currentModelRows = get().modelRows;
    const hasModelRow = currentModelRows.some((item) => item.id === id);
    const nextModelRows = hasModelRow
      ? currentModelRows.map((item) => (item.id === id ? row : item))
      : [...currentModelRows, row];
    const currentRows = get().rows;
    const nextRows = currentRows.map((item) => (item.id === id ? row : item));
    const { tree, issues } = recompute(nextRows, get().schema);
    const selectedId = get().selectedId;
    const nextSelectedId = selectedId === id && row.id && row.id !== id ? row.id : selectedId;
    set({
      modelRows: nextModelRows,
      rows: nextRows,
      tree,
      issues,
      outputIssues: [],
      selectedId: nextSelectedId,
    });
  },
  setRows: (rows) => {
    const { tree, issues } = recompute(rows, get().schema);
    const modelRows = Array.from(buildResourceModelMap(rows).values());
    set({ rows, modelRows, tree, issues, outputIssues: [] });
  },
  setOutputIssues: (issues) => set({ outputIssues: issues }),
}));
