import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { SimpleTreeView, TreeItem } from '@mui/x-tree-view';
import { useMemo, useRef, useState } from 'react';
import {
  computeDescendants,
  exportCsv,
  exportRdf,
  exportYaml,
  getLastHeader,
  parseCsv,
  RowRecord,
  Node,
} from '@repo/core';
import { useAppStore } from './state/store';
import schema from '../../../schema/building_model.schema.json';

function buildColumns(rows: RowRecord[]): string[] {
  const header = getLastHeader();
  if (header.length > 0) return header;
  return Array.from(
    new Set(rows.flatMap((row) => Object.keys(row)).filter((key) => !key.startsWith('__'))),
  );
}

function collectTreeIds(nodes: Node[]): string[] {
  const ids: string[] = [];
  const stack = [...nodes];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    ids.push(current.id);
    stack.push(...current.children);
  }
  return ids;
}

function TreeLabel({ node }: { node: Node }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2">{node.name}</Typography>
      {node.kind && (
        <Typography variant="caption" color="text.secondary">
          {node.kind}
        </Typography>
      )}
    </Stack>
  );
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { rows, columns, tree, selectedId, issues, setData, setSelectedId, updateRow } =
    useAppStore();
  const [search, setSearch] = useState('');

  const issueMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const issue of issues) {
      if (issue.rowId === undefined || !issue.field) continue;
      const rowKey = String(issue.rowId);
      if (!map.has(rowKey)) {
        map.set(rowKey, new Set());
      }
      map.get(rowKey)?.add(issue.field);
    }
    return map;
  }, [issues]);

  const issueRows = useMemo(() => {
    const rowsWithIssues = new Set<string>();
    for (const issue of issues) {
      if (!issue.rowId) continue;
      rowsWithIssues.add(String(issue.rowId));
    }
    return rowsWithIssues;
  }, [issues]);

  const issueRowLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row, index) => {
      const rowKey = row['__rowId'] ? String(row['__rowId']) : '';
      const rowId = row.id ? String(row.id) : '';
      if (rowKey && !map.has(rowKey)) {
        map.set(rowKey, `行${index + 1}`);
      }
      if (rowId && !map.has(rowId)) {
        map.set(rowId, `id:${rowId}${rowKey ? ` (行${index + 1})` : ''}`);
      }
    });
    return map;
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!selectedId || selectedId === 'root') return rows;
    const descendantIds = new Set([selectedId, ...computeDescendants(selectedId)]);
    return rows.filter((row) => descendantIds.has(row.id));
  }, [rows, selectedId]);

  const searchedRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return filteredRows;
    return filteredRows.filter((row) =>
      Object.values(row).some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [filteredRows, search]);

  const expandedItems = useMemo(() => ['root', ...collectTreeIds(tree)], [tree]);

  const gridColumns = useMemo<GridColDef[]>(
    () =>
      columns.map((field) => ({
        field,
        headerName: field,
        flex: 1,
        minWidth: 120,
        editable: true,
      })),
    [columns],
  );

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text, { schema }).map((row, index) => ({
      ...row,
      __rowId: row.id ? `${row.id}__${index}` : `row__${index}`,
    }));
    const nextColumns = buildColumns(parsed);
    setData(parsed, nextColumns);
  };

  const handleExport = () => {
    const csv = exportCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'export.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportRdf = () => {
    const rdf = exportRdf(rows);
    const blob = new Blob([rdf], { type: 'text/turtle;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'export.ttl';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportYaml = () => {
    const yaml = exportYaml(rows);
    const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'export.yaml';
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderTree = (node: Node) => (
    <TreeItem
      key={node.id}
      itemId={node.id}
      label={
        <Box data-testid={`tree-item-${node.id}`}>
          <TreeLabel node={node} />
        </Box>
      }
    >
      {node.children.map(renderTree)}
    </TreeItem>
  );

  return (
    <Box className="app-shell">
      <Box className="toolbar">
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h6">Building Model CSV Explorer</Typography>
          <Button
            variant="contained"
            onClick={() => fileInputRef.current?.click()}
            data-testid="csv-import-button"
          >
            CSVを読み込む
          </Button>
          <Button
            variant="outlined"
            onClick={handleExport}
            disabled={rows.length === 0}
            data-testid="csv-export-button"
          >
            CSVを書き出す
          </Button>
          <Button
            variant="outlined"
            onClick={handleExportRdf}
            disabled={rows.length === 0}
            data-testid="rdf-export-button"
          >
            RDFを書き出す
          </Button>
          <Button
            variant="outlined"
            onClick={handleExportYaml}
            disabled={rows.length === 0}
            data-testid="yaml-export-button"
          >
            YAMLを書き出す
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            data-testid="csv-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                handleFile(file);
              }
              event.target.value = '';
            }}
          />
        </Stack>
        <Box minWidth={320} data-testid="validation-summary">
          {issues.length > 0 ? (
            <Alert severity="error" variant="outlined">
              {`バリデーションエラー: ${issues.length}件`}
              <ul className="issue-list">
                {issues.slice(0, 4).map((issue, index) => {
                  const rowLabel = issue.rowId
                    ? issueRowLabelMap.get(issue.rowId) ?? `id:${issue.rowId}`
                    : '行不明';
                  const fieldLabel = issue.field ? `/${issue.field}` : '';
                  return (
                    <li key={`${issue.code}-${index}`}>
                      {rowLabel}
                      {fieldLabel}: {issue.message}
                    </li>
                  );
                })}
              </ul>
            </Alert>
          ) : (
            <Alert severity="success" variant="outlined">
              エラーなし
            </Alert>
          )}
        </Box>
      </Box>

      <Box className="main">
        <Box className="panel tree-panel">
          <Typography className="panel-title" variant="subtitle1">
            階層ツリー
          </Typography>
          <SimpleTreeView
            selectedItems={selectedId ? [selectedId] : []}
            expandedItems={expandedItems}
            onSelectedItemsChange={(_, itemIds) => {
              const id = Array.isArray(itemIds) ? itemIds[0] : itemIds;
              if (id) setSelectedId(id);
            }}
            data-testid="tree"
          >
            <TreeItem
              itemId="root"
              label={<Box data-testid="tree-item-root">All</Box>}
            >
              {tree.map(renderTree)}
            </TreeItem>
          </SimpleTreeView>
        </Box>

        <Box className="panel grid-panel">
          <Typography className="panel-title" variant="subtitle1">
            CSVデータ
          </Typography>
          <Box className="search-row">
            <TextField
              size="small"
              placeholder="検索（ID/名称/任意列）"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              inputProps={{ 'data-testid': 'grid-search' }}
            />
            {search && (
              <Button
                size="small"
                variant="text"
                onClick={() => setSearch('')}
                data-testid="grid-search-clear"
              >
                クリア
              </Button>
            )}
          </Box>
          <Box className="grid-wrapper" data-testid="grid">
            <DataGrid
              rows={searchedRows}
              columns={gridColumns}
              getRowId={(row) => row.__rowId ?? row.id}
              editMode="cell"
              disableRowSelectionOnClick
              processRowUpdate={(newRow, oldRow) => {
                const rowWithId = {
                  ...newRow,
                  __rowId: oldRow.__rowId ?? newRow.__rowId ?? newRow.id,
                } as RowRecord;
                updateRow(String(oldRow.__rowId ?? oldRow.id), rowWithId);
                return rowWithId;
              }}
              onProcessRowUpdateError={(error) => console.error(error)}
              getRowClassName={(params) => {
                const rowKey = params.row['__rowId'] ? String(params.row['__rowId']) : '';
                const rowId = params.row.id ? String(params.row.id) : '';
                return (rowKey && issueRows.has(rowKey)) || (rowId && issueRows.has(rowId))
                  ? 'row-error'
                  : '';
              }}
              getCellClassName={(params) => {
                const rowKey = params.row['__rowId'] ? String(params.row['__rowId']) : '';
                const rowId = params.row.id ? String(params.row.id) : '';
                const fields = (rowKey && issueMap.get(rowKey)) || (rowId && issueMap.get(rowId));
                return fields?.has(params.field) ? 'cell-error' : '';
              }}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}


