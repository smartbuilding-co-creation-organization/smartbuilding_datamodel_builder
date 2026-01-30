import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { SimpleTreeView, TreeItem } from '@mui/x-tree-view';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildSchemaCache,
  computeDescendants,
  exportCsv,
  exportRdf,
  exportYaml,
  getLastHeader,
  getRequiredPropsFromCache,
  inferRowKind,
  parseCsv,
  RowRecord,
  Node,
} from '@repo/core';
import { useAppStore } from './state/store';
import schema from '../../../schema/building_model.schema.json';

type SchemaDefinition = {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
};

type EditMode = 'csv' | 'model';

const KIND_TO_DEF: Record<string, string> = {
  site: 'Site',
  building: 'Building',
  floor: 'Level',
  level: 'Level',
  space: 'Room',
  room: 'Room',
  device: 'EquipmentExt',
  equipment: 'EquipmentExt',
  equipmentext: 'EquipmentExt',
  point: 'PointExt',
  pointext: 'PointExt',
};

function buildColumns(rows: RowRecord[]): string[] {
  const header = getLastHeader();
  const baseColumns =
    header.length > 0
      ? header
      : Array.from(
          new Set(rows.flatMap((row) => Object.keys(row)).filter((key) => !key.startsWith('__'))),
        );

  return baseColumns;
}

function resolveSchemaDefinition(
  schemaRoot: SchemaDefinition,
  defMap: Map<string, SchemaDefinition>,
  kind?: string,
): SchemaDefinition | undefined {
  const normalized = kind ? kind.trim().toLowerCase() : '';
  if (!normalized) return schemaRoot;
  const mapped = KIND_TO_DEF[normalized] ?? normalized;
  return defMap.get(mapped.toLowerCase()) ?? schemaRoot;
}

function descriptionForProperty(
  schemaDef: SchemaDefinition | undefined,
  schemaRoot: SchemaDefinition,
  property: string,
): string | undefined {
  const fromDef = schemaDef?.properties?.[property];
  const fromRoot = schemaRoot.properties?.[property];
  if (fromDef && typeof fromDef === 'object' && 'description' in fromDef) {
    const value = fromDef.description;
    return typeof value === 'string' ? value : undefined;
  }
  if (fromRoot && typeof fromRoot === 'object' && 'description' in fromRoot) {
    const value = fromRoot.description;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function addRowIds(rows: RowRecord[]): RowRecord[] {
  return rows.map((row, index) => ({
    ...row,
    __rowId: row.id ? `${row.id}__${index}` : `row__${index}`,
  }));
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

const uiScales = {
  compact: {
    label: '小',
    fontSize: 13,
    lineHeight: 1.35,
    gridRowHeight: 36,
    gridHeaderHeight: 36,
  },
  regular: {
    label: '中',
    fontSize: 14,
    lineHeight: 1.45,
    gridRowHeight: 42,
    gridHeaderHeight: 40,
  },
  large: {
    label: '大',
    fontSize: 15,
    lineHeight: 1.55,
    gridRowHeight: 48,
    gridHeaderHeight: 44,
  },
} as const;

type UiScaleKey = keyof typeof uiScales;

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { csvRows, csvColumns, rows, tree, selectedId, issues, setData, setSelectedId, updateRow } =
    useAppStore();
  const [search, setSearch] = useState('');
  const [expandedItems, setExpandedItems] = useState<string[]>(['root']);
  const schemaCache = useMemo(() => buildSchemaCache(schema), []);
  const [uiScale, setUiScale] = useState<UiScaleKey>('compact');
  const [editMode, setEditMode] = useState<EditMode>('csv');
  const [newProperty, setNewProperty] = useState('');
  const [newPropertyValue, setNewPropertyValue] = useState('');
  const [newPropertyDescription, setNewPropertyDescription] = useState('');
  const [customPropertyDescriptions, setCustomPropertyDescriptions] = useState<
    Record<string, string>
  >({});
  const scale = uiScales[uiScale];

  const theme = useMemo(
    () =>
      createTheme({
        typography: {
          fontFamily: "'Space Grotesk', 'Segoe UI', sans-serif",
          fontSize: scale.fontSize,
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: {
                lineHeight: scale.lineHeight,
              },
            },
          },
        },
      }),
    [scale.fontSize, scale.lineHeight],
  );

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

  const filteredCsvRows = useMemo(() => {
    if (!selectedId || selectedId === 'root') return csvRows;
    const descendantIds = new Set([selectedId, ...computeDescendants(selectedId)]);
    return csvRows.filter((row) => descendantIds.has(row.id));
  }, [csvRows, selectedId]);

  const searchedRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return filteredCsvRows;
    return filteredCsvRows.filter((row) =>
      Object.values(row).some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [filteredCsvRows, search]);

  const schemaDefinitions = useMemo(() => {
    const map = new Map<string, SchemaDefinition>();
    if (schema.$defs) {
      for (const [key, def] of Object.entries(schema.$defs)) {
        map.set(key.toLowerCase(), def as SchemaDefinition);
      }
    }
    return map;
  }, []);

  const selectedRow = useMemo(() => {
    if (!selectedId || selectedId === 'root') return undefined;
    return rows.find((row) => row.id === selectedId);
  }, [rows, selectedId]);

  const selectedKind = useMemo(() => {
    if (!selectedRow) return undefined;
    return selectedRow.kind?.trim() || inferRowKind(selectedRow);
  }, [selectedRow]);

  const selectedSchemaDef = useMemo(
    () => resolveSchemaDefinition(schema, schemaDefinitions, selectedKind),
    [schemaDefinitions, selectedKind],
  );

  const requiredProperties = useMemo(
    () => getRequiredPropsFromCache(schemaCache, selectedKind),
    [schemaCache, selectedKind],
  );

  const selectedIssueFields = useMemo(() => {
    if (!selectedRow) return new Set<string>();
    const rowKey = selectedRow.__rowId ? String(selectedRow.__rowId) : String(selectedRow.id);
    return issueMap.get(rowKey) ?? new Set<string>();
  }, [issueMap, selectedRow]);

  const propertyRows = useMemo(() => {
    if (!selectedRow) return [];
    const rowsMap = new Map<string, { id: string; property: string; value: string }>();
    const schemaProps = selectedSchemaDef?.properties
      ? Object.keys(selectedSchemaDef.properties)
      : [];
    for (const prop of schemaProps) {
      rowsMap.set(prop, {
        id: prop,
        property: prop,
        value: selectedRow[prop] ?? '',
      });
    }
    for (const key of Object.keys(selectedRow)) {
      if (key === '__rowId') continue;
      if (!rowsMap.has(key)) {
        rowsMap.set(key, {
          id: key,
          property: key,
          value: selectedRow[key] ?? '',
        });
      }
    }
    return Array.from(rowsMap.values()).map((entry) => ({
      ...entry,
      required: requiredProperties.has(entry.property),
      description:
        descriptionForProperty(selectedSchemaDef, schema, entry.property) ??
        customPropertyDescriptions[entry.property],
    }));
  }, [customPropertyDescriptions, requiredProperties, selectedRow, selectedSchemaDef]);

  useEffect(() => {
    setExpandedItems((prev) => {
      const validIds = new Set(['root', ...collectTreeIds(tree)]);
      const next = prev.filter((id) => validIds.has(id));
      if (!next.includes('root')) next.unshift('root');
      return next.length > 0 ? next : ['root'];
    });
  }, [tree]);

  const csvGridColumns = useMemo<GridColDef[]>(
    () =>
      csvColumns.map((field) => ({
        field,
        headerName: field,
        flex: 1,
        minWidth: 120,
        editable: false,
      })),
    [csvColumns],
  );

  const propertyColumns = useMemo<GridColDef[]>(
    () => [
      {
        field: 'property',
        headerName: 'プロパティ',
        flex: 1,
        minWidth: 160,
        renderCell: (params) => {
          const description = params.row.description as string | undefined;
          return (
            <Tooltip title={description ?? ''} arrow placement="top-start">
              <Box className="property-name-cell">
                <Typography variant="body2">{params.value}</Typography>
                {params.row.required ? <Chip size="small" label="必須" /> : null}
              </Box>
            </Tooltip>
          );
        },
      },
      {
        field: 'value',
        headerName: '値',
        flex: 1.4,
        minWidth: 200,
        editable: true,
      },
      {
        field: 'description',
        headerName: '説明',
        flex: 1.6,
        minWidth: 260,
      },
    ],
    [],
  );

  const handleFile = async (file: File) => {
    const text = await file.text();
    const rawRows = addRowIds(parseCsv(text));
    const parsedRows = addRowIds(parseCsv(text, { schema }));
    const nextColumns = buildColumns(rawRows);
    setData(rawRows, nextColumns, parsedRows, schema);
  };

  const handleAddProperty = () => {
    if (!selectedRow) return;
    const key = newProperty.trim();
    if (!key) return;
    const rowKey = String(selectedRow.__rowId ?? selectedRow.id);
    const nextRow = {
      ...selectedRow,
      [key]: newPropertyValue,
    } as RowRecord;
    updateRow(rowKey, nextRow);
    if (newPropertyDescription.trim()) {
      setCustomPropertyDescriptions((prev) => ({
        ...prev,
        [key]: newPropertyDescription.trim(),
      }));
    }
    setNewProperty('');
    setNewPropertyValue('');
    setNewPropertyDescription('');
  };

  const handlePropertyValueChange = (property: string, value: string) => {
    if (!selectedRow) return;
    const rowKey = String(selectedRow.__rowId ?? selectedRow.id);
    const nextRow = {
      ...selectedRow,
      [property]: value,
    } as RowRecord;
    updateRow(rowKey, nextRow);
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
    const rdf = exportRdf(rows, { schema });
    const blob = new Blob([rdf], { type: 'text/turtle;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'export.ttl';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportYaml = () => {
    const yaml = exportYaml(rows, { schema });
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
    <ThemeProvider theme={theme}>
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
          <Stack direction="row" spacing={2} alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                表示サイズ
              </Typography>
              <ButtonGroup size="small" aria-label="UI scale">
                {(Object.keys(uiScales) as UiScaleKey[]).map((key) => (
                  <Button
                    key={key}
                    variant={uiScale === key ? 'contained' : 'outlined'}
                    onClick={() => setUiScale(key)}
                    data-testid={`ui-scale-${key}`}
                  >
                    {uiScales[key].label}
                  </Button>
                ))}
              </ButtonGroup>
            </Stack>
            <Box minWidth={320} data-testid="validation-summary">
              {issues.length > 0 ? (
                <Alert severity="error" variant="outlined">
                  {`バリデーションエラー: ${issues.length}件`}
                  <ul className="issue-list">
                    {issues.slice(0, 4).map((issue, index) => {
                      const rowLabel = issue.rowId
                        ? (issueRowLabelMap.get(issue.rowId) ?? `id:${issue.rowId}`)
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
          </Stack>
        </Box>

        <Box className="main">
          <Box className="panel tree-panel">
            <Typography className="panel-title" variant="subtitle1">
              階層ツリー
            </Typography>
            <SimpleTreeView
              selectedItems={selectedId ?? ''}
              expandedItems={expandedItems}
              onExpandedItemsChange={(_, itemIds) => {
                const next = Array.isArray(itemIds) ? itemIds : [itemIds];
                setExpandedItems(next.filter(Boolean));
              }}
              onSelectedItemsChange={(_, itemIds) => {
                const id = Array.isArray(itemIds) ? itemIds[0] : itemIds;
                if (id) setSelectedId(id);
              }}
              data-testid="tree"
              sx={{ fontSize: scale.fontSize, lineHeight: scale.lineHeight }}
            >
              <TreeItem itemId="root" label={<Box data-testid="tree-item-root">All</Box>}>
                {tree.map(renderTree)}
              </TreeItem>
            </SimpleTreeView>
          </Box>

          <Box className="panel grid-panel">
            <Typography className="panel-title" variant="subtitle1">
              データ表示
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center" className="mode-row">
              <Typography variant="caption" color="text.secondary">
                表示モード
              </Typography>
              <ButtonGroup size="small" aria-label="data-view-mode">
                <Button
                  variant={editMode === 'csv' ? 'contained' : 'outlined'}
                  onClick={() => setEditMode('csv')}
                  data-testid="mode-csv"
                >
                  CSV表示
                </Button>
                <Button
                  variant={editMode === 'model' ? 'contained' : 'outlined'}
                  onClick={() => setEditMode('model')}
                  data-testid="mode-model"
                >
                  データモデル編集
                </Button>
              </ButtonGroup>
              {editMode === 'model' && (
                <Typography variant="caption" color="text.secondary">
                  {selectedRow
                    ? `選択: ${selectedRow.name || selectedRow.id || '未設定'}`
                    : 'Treeから対象を選択してください'}
                </Typography>
              )}
            </Stack>
            {editMode === 'csv' ? (
              <>
                <Alert severity="info" variant="outlined" className="mode-alert">
                  CSV 表示モードは参照専用です。編集は「データモデル編集」モードで行います。
                </Alert>
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
                <Box className="grid-wrapper" data-testid="grid-csv">
                  <DataGrid
                    rows={searchedRows}
                    columns={csvGridColumns}
                    getRowId={(row) => row.__rowId ?? row.id}
                    rowHeight={scale.gridRowHeight}
                    columnHeaderHeight={scale.gridHeaderHeight}
                    disableRowSelectionOnClick
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
                      const fields = rowKey
                        ? issueMap.get(rowKey)
                        : rowId
                          ? issueMap.get(rowId)
                          : undefined;
                      return fields?.has(params.field) ? 'cell-error' : '';
                    }}
                    sx={{ fontSize: scale.fontSize, lineHeight: scale.lineHeight }}
                  />
                </Box>
              </>
            ) : (
              <>
                <Box className="property-form" data-testid="property-form">
                  <TextField
                    size="small"
                    label="プロパティ名"
                    value={newProperty}
                    onChange={(event) => setNewProperty(event.target.value)}
                  />
                  <TextField
                    size="small"
                    label="値"
                    value={newPropertyValue}
                    onChange={(event) => setNewPropertyValue(event.target.value)}
                  />
                  <TextField
                    size="small"
                    label="説明（任意）"
                    value={newPropertyDescription}
                    onChange={(event) => setNewPropertyDescription(event.target.value)}
                  />
                  <Button
                    variant="contained"
                    onClick={handleAddProperty}
                    disabled={!selectedRow || !newProperty.trim()}
                    data-testid="property-add-button"
                  >
                    追加
                  </Button>
                </Box>
                <Box className="grid-wrapper" data-testid="grid-model">
                  <DataGrid
                    rows={propertyRows}
                    columns={propertyColumns}
                    getRowId={(row) => row.id}
                    editMode="cell"
                    rowHeight={scale.gridRowHeight}
                    columnHeaderHeight={scale.gridHeaderHeight}
                    disableRowSelectionOnClick
                    processRowUpdate={(newRow) => {
                      handlePropertyValueChange(newRow.property, newRow.value);
                      return newRow;
                    }}
                    onProcessRowUpdateError={(error) => console.error(error)}
                    getCellClassName={(params) =>
                      params.field === 'value' && selectedIssueFields.has(params.row.property)
                        ? 'cell-error'
                        : ''
                    }
                    sx={{ fontSize: scale.fontSize, lineHeight: scale.lineHeight }}
                  />
                </Box>
              </>
            )}
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
