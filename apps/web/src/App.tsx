import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { SimpleTreeView, TreeItem } from '@mui/x-tree-view';
import {
  computeDescendants,
  getLastHeader,
  getOutputPlugins,
  getSchemaPropertyDescription,
  KIND_TO_CLASS,
  normalizeCsvHeader,
  parseCsv,
  resetHeaderFromRows,
  runOutputPlugin,
  type Issue,
  type Node,
  type RowRecord,
} from '@repo/core';
import schema from '../../../schema/building_model.schema.json';
import shaclText from '../../../schema/building_model.shacl.ttl?raw';
import { TemplatesView } from './components/TemplatesView';
import { IssuesDrawer } from './components/IssuesDrawer';
import { HelpModal } from './components/HelpModal';
import { Welcome } from './components/Welcome';
import { SAMPLE_ROWS } from './data/sampleRows';
import { useAppStore } from './state/store';
import { buildTheme } from './theme';
import { downloadFile } from './utils/downloadFile';

function addRowIds(rows: RowRecord[]): RowRecord[] {
  return rows.map((row, index) => ({
    ...row,
    __rowId: row.id ? `${row.id}__${index}` : `row__${index}`,
  }));
}

function collectColumns(rows: RowRecord[]): { field: string; headerName: string }[] {
  const originalHeaders = getLastHeader();
  if (originalHeaders.length > 0) {
    return originalHeaders.map((headerName) => ({
      field: normalizeCsvHeader(headerName),
      headerName,
    }));
  }
  return Array.from(
    new Set(rows.flatMap((row) => Object.keys(row)).filter((key) => !key.startsWith('__'))),
  ).map((field) => ({ field, headerName: field }));
}

function findNode(nodes: Node[], id: string): Node | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return undefined;
}

function renderTreeNode(node: Node): ReactNode {
  return (
    <TreeItem
      key={node.id}
      itemId={node.id}
      label={
        <Stack direction="row" spacing={1} alignItems="center" data-testid={`tree-item-${node.id}`}>
          <Typography variant="body2" noWrap>
            {node.name || node.id}
          </Typography>
          {node.kind ? <Chip label={node.kind} size="small" variant="outlined" /> : null}
        </Stack>
      }
    >
      {node.children.map(renderTreeNode)}
    </TreeItem>
  );
}

function isBlockingIssue(issue: Issue): boolean {
  return issue.severity === undefined || issue.severity === 'violation';
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const theme = useMemo(() => buildTheme('compact'), []);
  const {
    csvRows,
    rows,
    modelRows,
    tree,
    selectedId,
    expandedItems,
    view,
    editMode,
    search,
    issues,
    outputIssues,
    setData,
    setSelectedId,
    setExpandedItems,
    setView,
    setEditMode,
    setSearch,
    updateModelRow,
    setRows,
    setOutputIssues,
  } = useAppStore();
  const [csvColumnDefs, setCsvColumnDefs] = useState<{ field: string; headerName: string }[]>([]);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [inputError, setInputError] = useState('');
  const [outputError, setOutputError] = useState('');
  const [outputBusy, setOutputBusy] = useState(false);
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);
  const [helpModal, setHelpModal] = useState<'csv' | 'glossary' | null>(null);

  const plugins = useMemo(() => getOutputPlugins(), []);
  const formats = useMemo(
    () => Array.from(new Set(plugins.map((plugin) => plugin.format))),
    [plugins],
  );
  const [outputFormat, setOutputFormat] = useState(formats[0] ?? '');
  const serializers = useMemo(
    () => plugins.filter((plugin) => plugin.format === outputFormat),
    [outputFormat, plugins],
  );
  const [outputSerializer, setOutputSerializer] = useState(serializers[0]?.serializer ?? '');
  const selectedPlugin =
    plugins.find(
      (plugin) => plugin.format === outputFormat && plugin.serializer === outputSerializer,
    ) ?? serializers[0];

  const allIssues = useMemo(() => [...issues, ...outputIssues], [issues, outputIssues]);
  const issueFields = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const issue of allIssues) {
      if (!issue.rowId) continue;
      const fields = map.get(issue.rowId) ?? new Set<string>();
      if (issue.field) fields.add(issue.field);
      map.set(issue.rowId, fields);
    }
    return map;
  }, [allIssues]);

  const scopedRows = useMemo(() => {
    let next = csvRows;
    if (selectedId && selectedId !== 'root') {
      const ids = new Set([selectedId, ...computeDescendants(selectedId)]);
      next = next.filter((row) => ids.has(row.id));
    }
    const term = search.trim().toLowerCase();
    if (term) {
      next = next.filter((row) =>
        Object.values(row).some((value) => value.toLowerCase().includes(term)),
      );
    }
    return next;
  }, [csvRows, search, selectedId, tree]);

  const csvColumns = useMemo<GridColDef[]>(
    () =>
      csvColumnDefs.map(({ field, headerName }) => ({
        field,
        headerName,
        minWidth: 140,
        flex: 1,
      })),
    [csvColumnDefs],
  );

  const selectedRow = useMemo(
    () => modelRows.find((row) => row.id === selectedId),
    [modelRows, selectedId],
  );
  const propertyRows = useMemo(() => {
    if (!selectedRow) return [];
    const describe = (property: string) =>
      getSchemaPropertyDescription(schema, selectedRow.kind, property) ?? '';
    const toRow = (property: string, value: string) =>
      property === 'kind'
        ? {
            id: property,
            property: 'Class',
            value: KIND_TO_CLASS[value.toLowerCase()] ?? value,
            description: 'RDFクラス。ノードの種別から自動的に決まります。',
          }
        : { id: property, property, value, description: describe(property) };

    const rows = Object.entries(selectedRow)
      .filter(([property]) => property !== '__rowId')
      .map(([property, value]) => toRow(property, value));

    const existingKeys = new Set(Object.keys(selectedRow));
    for (const field of issueFields.get(selectedId) ?? []) {
      if (existingKeys.has(field)) continue;
      rows.push(toRow(field, ''));
    }
    return rows;
  }, [selectedRow, issueFields, selectedId]);
  const propertyColumns = useMemo<GridColDef[]>(
    () => [
      { field: 'property', headerName: 'プロパティ', minWidth: 150, flex: 0.8 },
      { field: 'value', headerName: '値', minWidth: 180, flex: 1, editable: true },
      {
        field: 'description',
        headerName: '説明',
        minWidth: 220,
        flex: 1.2,
        renderCell: (params) => (
          <Tooltip title={params.value || ''}>
            <span>{params.value}</span>
          </Tooltip>
        ),
      },
    ],
    [],
  );

  const loadCsvText = (text: string) => {
    const rawRows = addRowIds(parseCsv(text));
    const parsedRows = addRowIds(parseCsv(text, { schema }));
    const columns = collectColumns(rawRows);
    setCsvColumnDefs(columns);
    setData(
      rawRows,
      columns.map((column) => column.field),
      parsedRows,
      schema,
    );
    setInputError('');
  };

  const handleFile = async (file: File) => {
    try {
      loadCsvText(await file.text());
    } catch (error) {
      setInputError(error instanceof Error ? error.message : 'CSVを読み込めませんでした。');
    }
  };

  const loadSample = () => {
    const sampleRows = addRowIds(SAMPLE_ROWS);
    resetHeaderFromRows(sampleRows);
    const columns = collectColumns(sampleRows);
    setCsvColumnDefs(columns);
    setData(
      sampleRows,
      columns.map((column) => column.field),
      sampleRows,
      schema,
    );
    setInputError('');
  };

  const executeOutput = async (download: boolean) => {
    if (!selectedPlugin || outputBusy) return;
    setOutputBusy(true);
    setOutputError('');
    setOutputIssues([]);
    try {
      const result = await runOutputPlugin(selectedPlugin.format, selectedPlugin.serializer, {
        rows,
        modelRows,
        schema,
        shacl:
          selectedPlugin.format === 'RDF' || selectedPlugin.format === 'YAML'
            ? { shapeText: shaclText }
            : undefined,
      });
      const nextIssues = result.issues ?? [];
      setOutputIssues(nextIssues);
      const blocking = nextIssues.some(isBlockingIssue);
      if (download) {
        if (blocking) {
          setOutputError('検証エラーがあるため、ダウンロードを中止しました。');
          setIssuesOpen(true);
          return;
        }
        downloadFile(result.content, `building-model.${result.extension}`, result.mimeType);
      } else {
        setPreview({ title: selectedPlugin.label, content: result.content });
        if (blocking) {
          setOutputError('検証エラーがあります。内容を確認してください。');
        }
      }
    } catch (error) {
      setOutputError(
        error instanceof Error ? `出力に失敗しました: ${error.message}` : '出力に失敗しました。',
      );
    } finally {
      setOutputBusy(false);
    }
  };

  const updateSelectedProperty = (property: string, value: string) => {
    if (!selectedRow) return;
    updateModelRow(selectedRow.id, { ...selectedRow, [property]: value });
  };

  if (rows.length === 0) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Welcome
          onLoadSample={loadSample}
          onUploadFile={(file) => void handleFile(file)}
          onShowHelp={() => setHelpModal('csv')}
        />
        <HelpModal open={helpModal !== null} view={helpModal} onClose={() => setHelpModal(null)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <AppBar position="static" color="default" elevation={0}>
          <Toolbar sx={{ gap: 1, flexWrap: 'wrap', py: 1 }}>
            <Typography variant="h6" sx={{ mr: 1 }}>
              Building Model CSV Explorer
            </Typography>
            <Button variant="contained" onClick={() => fileInputRef.current?.click()}>
              CSVを読み込む
            </Button>
            <Button variant="outlined" onClick={loadSample}>
              サンプル
            </Button>
            <input
              ref={fileInputRef}
              data-testid="csv-input"
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = '';
              }}
            />
            <ButtonGroup size="small" sx={{ ml: 1 }}>
              <Button
                data-testid="view-data"
                variant={view === 'data' ? 'contained' : 'outlined'}
                onClick={() => setView('data')}
              >
                データ
              </Button>
              <Button
                data-testid="view-templates"
                variant={view === 'templates' ? 'contained' : 'outlined'}
                onClick={() => setView('templates')}
              >
                テンプレート
              </Button>
            </ButtonGroup>
            <Box sx={{ flex: 1 }} />
            <TextField
              select
              size="small"
              label="形式"
              value={outputFormat}
              data-testid="output-format-select"
              onChange={(event) => {
                const format = event.target.value;
                setOutputFormat(format);
                setOutputSerializer(
                  plugins.find((plugin) => plugin.format === format)?.serializer ?? '',
                );
              }}
              sx={{ minWidth: 120 }}
            >
              {formats.map((format) => (
                <MenuItem key={format} value={format}>
                  {format}
                </MenuItem>
              ))}
            </TextField>
            {serializers.length > 1 ? (
              <TextField
                select
                size="small"
                label="シリアライザ"
                value={selectedPlugin?.serializer ?? ''}
                data-testid="output-serializer-select"
                onChange={(event) => setOutputSerializer(event.target.value)}
                sx={{ minWidth: 150 }}
              >
                {serializers.map((plugin) => (
                  <MenuItem key={plugin.id} value={plugin.serializer}>
                    {plugin.serializer}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
            <Button
              variant="outlined"
              disabled={rows.length === 0 || outputBusy}
              onClick={() => void executeOutput(false)}
            >
              プレビュー
            </Button>
            <Button
              variant="contained"
              disabled={rows.length === 0 || outputBusy}
              data-testid={
                selectedPlugin ? `output-download-${selectedPlugin.id}` : 'output-export-button'
              }
              onClick={() => void executeOutput(true)}
            >
              {outputBusy ? '出力中…' : 'ダウンロード'}
            </Button>
            <Button
              data-testid="validation-summary"
              color={allIssues.some(isBlockingIssue) ? 'error' : 'success'}
              onClick={() => setIssuesOpen(true)}
            >
              {allIssues.length > 0 ? `${allIssues.length}件のIssue` : '検証OK'}
            </Button>
          </Toolbar>
        </AppBar>

        <Stack spacing={2} sx={{ p: 2, height: 'calc(100vh - 72px)' }}>
          {inputError ? (
            <Alert severity="error" data-testid="csv-input-error">
              {inputError}
            </Alert>
          ) : null}
          {outputError ? (
            <Alert severity="error" data-testid="output-error">
              {outputError}
            </Alert>
          ) : null}
          {view === 'templates' ? (
            <Paper variant="outlined" sx={{ minHeight: 0, flex: 1, overflow: 'auto' }}>
              <TemplatesView
                rows={rows}
                onApplyTemplate={(nextRows) => setRows(nextRows)}
                expertMode
              />
            </Paper>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '300px minmax(420px, 1fr) minmax(320px, 0.8fr)',
                gap: 2,
                minHeight: 0,
                flex: 1,
              }}
            >
              <Paper variant="outlined" sx={{ p: 2, minHeight: 0, overflow: 'auto' }}>
                <Typography variant="subtitle1" gutterBottom>
                  階層ツリー
                </Typography>
                <SimpleTreeView
                  data-testid="tree"
                  selectedItems={selectedId}
                  expandedItems={expandedItems}
                  onSelectedItemsChange={(_, id) => {
                    if (typeof id === 'string') setSelectedId(id);
                  }}
                  onExpandedItemsChange={(_, ids) => setExpandedItems(ids)}
                >
                  <TreeItem itemId="root" label={<span data-testid="tree-item-root">すべて</span>}>
                    {tree.map(renderTreeNode)}
                  </TreeItem>
                </SimpleTreeView>
              </Paper>

              <Paper
                variant="outlined"
                sx={{ p: 2, minHeight: 0, display: 'flex', flexDirection: 'column' }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1">CSV</Typography>
                  <TextField
                    size="small"
                    placeholder="検索"
                    value={search}
                    inputProps={{ 'data-testid': 'grid-search' }}
                    onChange={(event) => setSearch(event.target.value)}
                    sx={{ ml: 'auto', maxWidth: 240 }}
                  />
                  <Chip label={`${scopedRows.length}行 / ${csvColumns.length}列`} size="small" />
                </Stack>
                <Box data-testid="grid-csv" sx={{ minHeight: 0, flex: 1 }}>
                  <DataGrid
                    rows={scopedRows}
                    columns={csvColumns}
                    getRowId={(row) => row.__rowId}
                    disableRowSelectionOnClick
                    onRowClick={(params) => setSelectedId(params.row.id)}
                    getRowClassName={(params) =>
                      issueFields.has(params.row.id) ? 'row-error' : ''
                    }
                    getCellClassName={(params) =>
                      issueFields.get(params.row.id)?.has(params.field) ? 'cell-error' : ''
                    }
                  />
                </Box>
              </Paper>

              <Paper
                variant="outlined"
                sx={{ p: 2, minHeight: 0, display: 'flex', flexDirection: 'column' }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1">インスペクタ</Typography>
                  <ButtonGroup size="small" sx={{ ml: 'auto' }}>
                    <Button
                      variant={editMode === 'csv' ? 'contained' : 'outlined'}
                      onClick={() => setEditMode('csv')}
                    >
                      参照
                    </Button>
                    <Button
                      variant={editMode === 'model' ? 'contained' : 'outlined'}
                      onClick={() => setEditMode('model')}
                    >
                      編集
                    </Button>
                  </ButtonGroup>
                </Stack>
                {selectedRow ? (
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {findNode(tree, selectedId)?.name ?? selectedRow.name ?? selectedId}
                    </Typography>
                    <Box data-testid="inspector-panel" sx={{ minHeight: 0, flex: 1 }}>
                      <DataGrid
                        rows={propertyRows}
                        columns={propertyColumns.map((column) => ({
                          ...column,
                          editable: column.field === 'value' && editMode === 'model',
                        }))}
                        disableRowSelectionOnClick
                        isCellEditable={(params) => params.row.id !== 'kind'}
                        processRowUpdate={(nextRow) => {
                          updateSelectedProperty(nextRow.id, String(nextRow.value ?? ''));
                          return nextRow;
                        }}
                        getCellClassName={(params) =>
                          params.field === 'value' &&
                          issueFields.get(selectedId)?.has(params.row.id)
                            ? 'cell-error'
                            : ''
                        }
                      />
                    </Box>
                  </>
                ) : (
                  <Alert severity="info">ツリーまたはCSV行からリソースを選択してください。</Alert>
                )}
              </Paper>
            </Box>
          )}
        </Stack>
      </Box>

      <IssuesDrawer
        open={issuesOpen}
        issues={allIssues}
        onClose={() => setIssuesOpen(false)}
        onJump={(rowId) => {
          setSelectedId(rowId);
          setIssuesOpen(false);
        }}
      />

      <Dialog open={preview !== null} onClose={() => setPreview(null)} fullWidth maxWidth="md">
        <DialogTitle>{preview?.title} プレビュー</DialogTitle>
        <DialogContent>
          <Box
            component="pre"
            data-testid="output-preview-content"
            sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          >
            {preview?.content}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>閉じる</Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
