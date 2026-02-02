import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { SimpleTreeView, TreeItem } from '@mui/x-tree-view';
import { Paper } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildTheme, uiScales, type UiScaleKey } from './theme';
import {
  buildSchemaCache,
  buildDeviceTemplatesFromCsv,
  buildBaseTemplatesFromRows,
  buildTemplatesZip,
  applyTemplateToRows,
  computeDescendants,
  DeviceTemplate,
  DeviceTemplateDiff,
  exportCsv,
  findOutputPlugin,
  getOutputPlugins,
  runOutputPlugin,
  getLastHeader,
  getRequiredPropsFromCache,
  inferRowKind,
  parseCsv,
  parseDeviceTemplateYaml,
  RowRecord,
  Node,
  resolveDeviceTemplateInheritance,
  serializeDeviceTemplate,
  diffDeviceTemplate,
} from '@repo/core';
import { useAppStore } from './state/store';
import schema from '../../../schema/building_model.schema.json';
import shaclText from '../../../schema/building_model.shacl.ttl?raw';

type SchemaDefinition = {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
};

type EditMode = 'csv' | 'model';
type ViewMode = 'data' | 'templates';

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

function templateKey(template: DeviceTemplate): string {
  return `${template.namespace}:${template.deviceType}`;
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
  const templateInputRef = useRef<HTMLInputElement | null>(null);
  const {
    csvRows,
    csvColumns,
    rows,
    modelRows,
    tree,
    selectedId,
    issues,
    outputIssues,
    setData,
    setSelectedId,
    updateModelRow,
    setRows,
    setOutputIssues,
  } = useAppStore();
  const [search, setSearch] = useState('');
  const [expandedItems, setExpandedItems] = useState<string[]>(['root']);
  const schemaCache = useMemo(() => buildSchemaCache(schema), []);
  const [uiScale, setUiScale] = useState<UiScaleKey>('compact');
  const [activeView, setActiveView] = useState<ViewMode>('data');
  const [editMode, setEditMode] = useState<EditMode>('csv');
  const [newProperty, setNewProperty] = useState('');
  const [newPropertyValue, setNewPropertyValue] = useState('');
  const [newPropertyDescription, setNewPropertyDescription] = useState('');
  const [customPropertyDescriptions, setCustomPropertyDescriptions] = useState<
    Record<string, string>
  >({});
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, DeviceTemplate>>({});
  const [templateLoadError, setTemplateLoadError] = useState('');
  const [newTemplateProperty, setNewTemplateProperty] = useState<{
    name: string;
    pointType: string;
    access: 'read' | 'readWrite';
    description: string;
    default: string;
  }>({
    name: '',
    pointType: '',
    access: 'read',
    description: '',
    default: '',
  });
  const outputPlugins = useMemo(() => getOutputPlugins(), []);
  const outputFormats = useMemo(
    () => Array.from(new Set(outputPlugins.map((plugin) => plugin.format))),
    [outputPlugins],
  );
  const [selectedOutputFormat, setSelectedOutputFormat] = useState('');
  const outputSerializers = useMemo(
    () =>
      outputPlugins
        .filter((plugin) => plugin.format === selectedOutputFormat)
        .map((plugin) => plugin.serializer),
    [outputPlugins, selectedOutputFormat],
  );
  const [selectedOutputSerializer, setSelectedOutputSerializer] = useState('');
  const selectedOutputPlugin = useMemo(
    () => findOutputPlugin(selectedOutputFormat, selectedOutputSerializer),
    [selectedOutputFormat, selectedOutputSerializer],
  );
  const scale = uiScales[uiScale];

  const theme = useMemo(
    () => buildTheme(uiScale),
    [uiScale],
  );

  const allIssues = useMemo(() => [...issues, ...outputIssues], [issues, outputIssues]);

  const issueMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const issue of allIssues) {
      if (issue.rowId === undefined || !issue.field) continue;
      const rowKey = String(issue.rowId);
      if (!map.has(rowKey)) {
        map.set(rowKey, new Set());
      }
      map.get(rowKey)?.add(issue.field);
    }
    return map;
  }, [allIssues]);

  const issueRows = useMemo(() => {
    const rowsWithIssues = new Set<string>();
    for (const issue of allIssues) {
      if (!issue.rowId) continue;
      rowsWithIssues.add(String(issue.rowId));
    }
    return rowsWithIssues;
  }, [allIssues]);

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
    for (const row of modelRows) {
      const rowId = row.id ? String(row.id) : '';
      if (rowId && !map.has(rowId)) {
        map.set(rowId, `id:${rowId}`);
      }
    }
    return map;
  }, [modelRows, rows]);

  const baseTemplates = useMemo(() => buildBaseTemplatesFromRows(rows), [rows]);
  const generatedTemplates = useMemo(
    () => [...baseTemplates, ...buildDeviceTemplatesFromCsv(rows)],
    [baseTemplates, rows],
  );

  const generatedTemplateMap = useMemo(
    () => new Map(generatedTemplates.map((template) => [templateKey(template), template])),
    [generatedTemplates],
  );

  const selectedGeneratedTemplate = useMemo(
    () => (selectedTemplateKey ? generatedTemplateMap.get(selectedTemplateKey) : undefined),
    [generatedTemplateMap, selectedTemplateKey],
  );

  const availableTemplates = useMemo(
    () => generatedTemplates.map((template) => templateDrafts[templateKey(template)] ?? template),
    [generatedTemplates, templateDrafts],
  );

  const availableTemplateMap = useMemo(
    () => new Map(availableTemplates.map((template) => [templateKey(template), template])),
    [availableTemplates],
  );

  const selectedTemplate = useMemo(
    () => (selectedTemplateKey ? availableTemplateMap.get(selectedTemplateKey) : undefined),
    [availableTemplateMap, selectedTemplateKey],
  );

  const activeTemplate = selectedTemplate ?? selectedGeneratedTemplate;

  const templateDiff = useMemo<DeviceTemplateDiff | undefined>(() => {
    if (!selectedGeneratedTemplate || !selectedTemplate) return undefined;
    return diffDeviceTemplate(selectedGeneratedTemplate, selectedTemplate);
  }, [selectedGeneratedTemplate, selectedTemplate]);

  const templateDiffSets = useMemo(() => {
    if (!templateDiff) {
      return {
        missing: new Set<string>(),
        extra: new Set<string>(),
        mismatched: new Set<string>(),
      };
    }
    return {
      missing: new Set(templateDiff.missing.map((prop) => prop.name)),
      extra: new Set(templateDiff.extra.map((prop) => prop.name)),
      mismatched: new Set(templateDiff.mismatched.map((prop) => prop.name)),
    };
  }, [templateDiff]);

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
    return modelRows.find((row) => row.id === selectedId);
  }, [modelRows, selectedId]);

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

  useEffect(() => {
    if (generatedTemplates.length === 0) {
      if (selectedTemplateKey) setSelectedTemplateKey('');
      return;
    }
    if (!selectedTemplateKey || !generatedTemplateMap.has(selectedTemplateKey)) {
      setSelectedTemplateKey(templateKey(generatedTemplates[0]));
    }
  }, [generatedTemplateMap, generatedTemplates, selectedTemplateKey]);

  useEffect(() => {
    if (!selectedOutputFormat && outputFormats.length > 0) {
      setSelectedOutputFormat(outputFormats[0]);
    }
  }, [outputFormats, selectedOutputFormat]);

  useEffect(() => {
    if (outputSerializers.length === 0) return;
    if (!outputSerializers.includes(selectedOutputSerializer)) {
      setSelectedOutputSerializer(outputSerializers[0]);
    }
  }, [outputSerializers, selectedOutputSerializer]);

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

  const templatePropertyColumns = useMemo<GridColDef[]>(
    () => [
      { field: 'name', headerName: 'プロパティ', flex: 1, minWidth: 160 },
      {
        field: 'pointType',
        headerName: 'pointType',
        flex: 1,
        minWidth: 160,
        editable: true,
      },
      {
        field: 'access',
        headerName: 'アクセス',
        flex: 0.6,
        minWidth: 120,
        editable: true,
      },
      {
        field: 'description',
        headerName: '説明',
        flex: 1.2,
        minWidth: 200,
        editable: true,
      },
      {
        field: 'default',
        headerName: 'デフォルト',
        flex: 0.8,
        minWidth: 140,
        editable: true,
      },
    ],
    [],
  );

  const resolvedTemplateState = useMemo(() => {
    if (!activeTemplate) {
      return { template: undefined, error: '' };
    }
    try {
      return {
        template: resolveDeviceTemplateInheritance(availableTemplates, activeTemplate),
        error: '',
      };
    } catch (error) {
      return {
        template: activeTemplate,
        error: error instanceof Error ? error.message : '継承の解決に失敗しました。',
      };
    }
  }, [activeTemplate, availableTemplates]);

  const resolvedTemplate = resolvedTemplateState.template;
  const templateResolveError = resolvedTemplateState.error;

  const templatePropertyRows = useMemo(
    () =>
      resolvedTemplate?.properties.map((prop) => ({
        id: prop.name,
        name: prop.name,
        pointType: prop.pointType,
        access: prop.access,
        description: prop.description ?? '',
        default: prop.default ?? '',
      })) ?? [],
    [resolvedTemplate],
  );

  const templateExtendOptions = useMemo(() => {
    if (!activeTemplate) return [];
    const names = new Set<string>();
    for (const template of availableTemplates) {
      if (template.namespace !== activeTemplate.namespace) continue;
      const name = template.className || template.deviceType;
      if (!name) continue;
      if (name === activeTemplate.className || name === activeTemplate.deviceType) continue;
      names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [activeTemplate, availableTemplates]);

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
    const nextRow = {
      ...selectedRow,
      [key]: newPropertyValue,
    } as RowRecord;
    updateModelRow(selectedRow.id, nextRow);
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
    const nextRow = {
      ...selectedRow,
      [property]: value,
    } as RowRecord;
    updateModelRow(selectedRow.id, nextRow);
  };

  const updateTemplateDraft = (
    key: string,
    updater: (current: DeviceTemplate) => DeviceTemplate,
  ) => {
    if (!key) return;
    setTemplateDrafts((prev) => {
      const base = prev[key] ?? generatedTemplateMap.get(key);
      if (!base) return prev;
      const updated = updater(base);
      return { ...prev, [key]: updated };
    });
  };

  const handleTemplateFieldChange = (
    field: 'className' | 'description' | 'extends',
    value: string,
  ) => {
    if (!selectedTemplateKey) return;
    updateTemplateDraft(selectedTemplateKey, (template) => ({
      ...template,
      [field]: field === 'extends' ? value || undefined : value,
    }));
  };

  const handleTemplatePropertyUpdate = (updated: {
    name: string;
    description?: string;
    access: string;
    default?: string;
    pointType: string;
  }) => {
    if (!selectedTemplateKey) return;
    updateTemplateDraft(selectedTemplateKey, (template) => ({
      ...template,
      properties: template.properties.map((prop) =>
        prop.name === updated.name
          ? {
              ...prop,
              description: updated.description,
              access: updated.access === 'readWrite' ? 'readWrite' : 'read',
              default: updated.default,
              pointType: updated.pointType,
            }
          : prop,
      ),
    }));
  };

  const handleAddTemplateProperty = () => {
    if (!selectedTemplateKey) return;
    const name = newTemplateProperty.name.trim();
    if (!name) return;
    updateTemplateDraft(selectedTemplateKey, (template) => {
      if (template.properties.some((prop) => prop.name === name)) return template;
      return {
        ...template,
        properties: [
          ...template.properties,
          {
            name,
            description: newTemplateProperty.description.trim() || undefined,
            access: newTemplateProperty.access,
            default: newTemplateProperty.default.trim() || undefined,
            pointType: newTemplateProperty.pointType.trim() || name,
          },
        ].sort((a, b) => a.name.localeCompare(b.name)),
      };
    });
    setNewTemplateProperty({
      name: '',
      pointType: '',
      access: 'read',
      description: '',
      default: '',
    });
  };

  const handleLoadTemplateFile = async (file: File) => {
    if (!selectedTemplateKey) return;
    const text = await file.text();
    try {
      const parsed = parseDeviceTemplateYaml(text, {
        namespace: selectedGeneratedTemplate?.namespace ?? 'default',
        deviceType: selectedGeneratedTemplate?.deviceType ?? '',
      });
      updateTemplateDraft(selectedTemplateKey, () => parsed);
      setTemplateLoadError('');
    } catch (error) {
      setTemplateLoadError(
        error instanceof Error ? error.message : 'テンプレートの読み込みに失敗しました。',
      );
    }
  };

  const handleGenerateTemplate = () => {
    if (!selectedTemplateKey || !selectedGeneratedTemplate) return;
    updateTemplateDraft(selectedTemplateKey, () => selectedGeneratedTemplate);
  };

  const handleDownloadTemplateYaml = () => {
    if (!activeTemplate) return;
    const yamlText = serializeDeviceTemplate(activeTemplate);
    const blob = new Blob([yamlText], { type: 'text/yaml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeTemplate.deviceType || 'template'}.yaml`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplateZip = async () => {
    const templates = generatedTemplates.map(
      (template) => templateDrafts[templateKey(template)] ?? template,
    );
    if (templates.length === 0) return;
    const zipBytes = await buildTemplatesZip(templates);
    const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
    new Uint8Array(zipBuffer).set(zipBytes);
    const blob = new Blob([zipBuffer], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'device-templates.zip';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleApplyTemplateToCsv = () => {
    if (!resolvedTemplate) return;
    const updatedRows = applyTemplateToRows(rows, resolvedTemplate);
    setRows(updatedRows);
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

  const handleExportPlugin = () => {
    if (!selectedOutputPlugin) return;
    const result = runOutputPlugin(selectedOutputPlugin.format, selectedOutputPlugin.serializer, {
      rows,
      modelRows,
      schema,
      shacl: { shapeText: shaclText },
    });
    setOutputIssues(result.issues ?? []);
    const blob = new Blob([result.content], { type: result.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `export.${result.extension}`;
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
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          p: 2,
          gap: 2,
        }}
      >
        {/* Toolbar: 2行構成 */}
        <Stack
          spacing={1}
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            pb: 2,
            bgcolor: 'background.paper',
          }}
        >
          {/* 1行目: タイトル + CSV操作 + 出力選択 */}
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
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
            <TextField
              select
              size="small"
              label="フォーマット"
              value={selectedOutputFormat}
              onChange={(event) => setSelectedOutputFormat(event.target.value)}
              data-testid="output-format-select"
              sx={{ minWidth: 140 }}
            >
              {outputFormats.map((format) => (
                <MenuItem key={format} value={format}>
                  {format}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="シリアライズ"
              value={selectedOutputSerializer}
              onChange={(event) => setSelectedOutputSerializer(event.target.value)}
              data-testid="output-serializer-select"
              sx={{ minWidth: 160 }}
            >
              {outputSerializers.map((serializer) => (
                <MenuItem key={serializer} value={serializer}>
                  {serializer}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="outlined"
              onClick={handleExportPlugin}
              disabled={rows.length === 0 || !selectedOutputPlugin}
              data-testid="output-export-button"
            >
              出力する
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

          {/* 2行目: ビュー + サイズ + 検証概要 */}
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                ビュー
              </Typography>
              <ButtonGroup size="small" aria-label="view mode">
                <Button
                  variant={activeView === 'data' ? 'contained' : 'outlined'}
                  onClick={() => setActiveView('data')}
                  data-testid="view-data"
                >
                  データ
                </Button>
                <Button
                  variant={activeView === 'templates' ? 'contained' : 'outlined'}
                  onClick={() => setActiveView('templates')}
                  data-testid="view-templates"
                >
                  デバイステンプレート
                </Button>
              </ButtonGroup>
            </Stack>
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
              {outputIssues.length > 0 && (
                <Alert severity="warning" variant="outlined" sx={{ mt: 1 }}>
                  {`SHACL違反: ${outputIssues.length}件`}
                  <ul className="issue-list">
                    {outputIssues.slice(0, 4).map((issue, index) => {
                      const rowLabel = issue.rowId
                        ? (issueRowLabelMap.get(issue.rowId) ?? `id:${issue.rowId}`)
                        : '行不明';
                      const fieldLabel = issue.field ? `/${issue.field}` : '';
                      return (
                        <li key={`shacl-${issue.code}-${index}`}>
                          {rowLabel}
                          {fieldLabel}: {issue.message}
                        </li>
                      );
                    })}
                  </ul>
                </Alert>
              )}
            </Box>
          </Stack>
        </Stack>

        <Box className="main">
          {activeView === 'data' ? (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '320px 1fr',
                gap: 2,
                flex: 1,
                overflow: 'hidden',
              }}
            >
              {/* Tree Panel */}
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  階層ツリー
                </Typography>
                <Box sx={{ flex: 1, overflow: 'auto' }}>
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
              </Paper>

              {/* Grid Panel */}
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  データ表示
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
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
                    <Alert severity="info" variant="outlined" sx={{ mb: 1 }}>
                      CSV 表示モードは参照専用です。編集は「データモデル編集」モードで行います。
                    </Alert>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
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
                    </Stack>
                    <Box sx={{ flex: 1 }} data-testid="grid-csv">
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
                          return (rowKey && issueRows.has(rowKey)) ||
                            (rowId && issueRows.has(rowId))
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
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }} data-testid="property-form">
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
                    </Stack>
                    <Box sx={{ flex: 1 }} data-testid="grid-model">
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
              </Paper>
            </Box>
          ) : (
            <Box
              sx={{
                display: 'flex',
                gap: 2,
                flex: 1,
                overflow: 'hidden',
              }}
              data-testid="templates-view"
            >
              {/* Sidebar */}
              <Paper variant="outlined" sx={{ width: 260, p: 2, display: 'flex', flexDirection: 'column' }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  デバイス種別
                </Typography>
                <Divider sx={{ mb: 1 }} />
                {generatedTemplates.length > 0 ? (
                  <List sx={{ overflow: 'auto', pr: 0.5 }} data-testid="template-list">
                    {generatedTemplates.map((template) => {
                      const key = templateKey(template);
                      return (
                        <ListItemButton
                          key={key}
                          selected={selectedTemplateKey === key}
                          onClick={() => setSelectedTemplateKey(key)}
                          data-testid={`template-item-${template.deviceType}`}
                        >
                          <ListItemText
                            primary={template.deviceType}
                            secondary={`namespace: ${template.namespace}`}
                          />
                        </ListItemButton>
                      );
                    })}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    CSV を読み込むとデバイス種別が表示されます。
                  </Typography>
                )}
              </Paper>

              <Divider orientation="vertical" flexItem />

              {/* Editor */}
              <Paper variant="outlined" sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
                  <Button
                    variant="outlined"
                    onClick={handleGenerateTemplate}
                    disabled={!selectedGeneratedTemplate}
                    data-testid="template-generate"
                  >
                    CSVから生成
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => templateInputRef.current?.click()}
                    disabled={!selectedGeneratedTemplate}
                    data-testid="template-load"
                  >
                    YAMLを読み込む
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={handleDownloadTemplateYaml}
                    disabled={!activeTemplate}
                    data-testid="template-download"
                  >
                    YAMLを保存
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={handleApplyTemplateToCsv}
                    disabled={!activeTemplate}
                    data-testid="template-apply"
                  >
                    CSVへ反映
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleDownloadTemplateZip}
                    disabled={generatedTemplates.length === 0}
                    data-testid="template-zip"
                  >
                    ZIP出力
                  </Button>
                  <input
                    ref={templateInputRef}
                    type="file"
                    accept=".yaml,.yml,text/yaml"
                    style={{ display: 'none' }}
                    data-testid="template-input"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleLoadTemplateFile(file);
                      }
                      event.target.value = '';
                    }}
                  />
                </Stack>
                {templateLoadError && (
                  <Alert severity="error" variant="outlined" sx={{ mb: 1 }}>
                    {templateLoadError}
                  </Alert>
                )}
                {templateResolveError && (
                  <Alert severity="error" variant="outlined" sx={{ mb: 1 }}>
                    {templateResolveError}
                  </Alert>
                )}
                {activeTemplate ? (
                  <>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
                      <TextField
                        size="small"
                        label="className"
                        value={activeTemplate.className}
                        onChange={(event) =>
                          handleTemplateFieldChange('className', event.target.value)
                        }
                      />
                      <TextField
                        size="small"
                        label="説明"
                        value={activeTemplate.description ?? ''}
                        onChange={(event) =>
                          handleTemplateFieldChange('description', event.target.value)
                        }
                      />
                      <TextField
                        size="small"
                        select
                        label="継承元"
                        value={activeTemplate.extends ?? ''}
                        onChange={(event) =>
                          handleTemplateFieldChange('extends', event.target.value)
                        }
                      >
                        <MenuItem value="">なし</MenuItem>
                        {templateExtendOptions.map((name) => (
                          <MenuItem key={name} value={name}>
                            {name}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                    {templateDiff ? (
                      <Alert severity="warning" variant="outlined" data-testid="template-diff" sx={{ mb: 1 }}>
                        <Typography variant="subtitle2">CSV との差分</Typography>
                        <ul className="template-diff-list">
                          {templateDiff.missing.map((prop) => (
                            <li key={`missing-${prop.name}`}>不足: {prop.name}</li>
                          ))}
                          {templateDiff.extra.map((prop) => (
                            <li key={`extra-${prop.name}`}>過剰: {prop.name}</li>
                          ))}
                          {templateDiff.mismatched.map((prop) => (
                            <li key={`mismatch-${prop.name}`}>
                              不一致: {prop.name}（{prop.differences.join(', ')}）
                            </li>
                          ))}
                        </ul>
                      </Alert>
                    ) : (
                      <Alert severity="success" variant="outlined" data-testid="template-no-diff" sx={{ mb: 1 }}>
                        CSV 推定値と一致しています。
                      </Alert>
                    )}
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }} data-testid="template-property-form">
                      <TextField
                        size="small"
                        label="プロパティ名"
                        value={newTemplateProperty.name}
                        onChange={(event) =>
                          setNewTemplateProperty((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }))
                        }
                      />
                      <TextField
                        size="small"
                        label="pointType"
                        value={newTemplateProperty.pointType}
                        onChange={(event) =>
                          setNewTemplateProperty((prev) => ({
                            ...prev,
                            pointType: event.target.value,
                          }))
                        }
                      />
                      <TextField
                        size="small"
                        select
                        label="アクセス"
                        value={newTemplateProperty.access}
                        onChange={(event) =>
                          setNewTemplateProperty((prev) => ({
                            ...prev,
                            access: event.target.value as 'read' | 'readWrite',
                          }))
                        }
                      >
                        <MenuItem value="read">read</MenuItem>
                        <MenuItem value="readWrite">readWrite</MenuItem>
                      </TextField>
                      <TextField
                        size="small"
                        label="説明"
                        value={newTemplateProperty.description}
                        onChange={(event) =>
                          setNewTemplateProperty((prev) => ({
                            ...prev,
                            description: event.target.value,
                          }))
                        }
                      />
                      <TextField
                        size="small"
                        label="デフォルト"
                        value={newTemplateProperty.default}
                        onChange={(event) =>
                          setNewTemplateProperty((prev) => ({
                            ...prev,
                            default: event.target.value,
                          }))
                        }
                      />
                      <Button
                        variant="contained"
                        onClick={handleAddTemplateProperty}
                        disabled={!newTemplateProperty.name.trim()}
                        data-testid="template-property-add"
                      >
                        追加
                      </Button>
                    </Stack>
                    <Box sx={{ flex: 1 }} data-testid="template-properties-grid">
                      <DataGrid
                        rows={templatePropertyRows}
                        columns={templatePropertyColumns}
                        getRowId={(row) => row.id}
                        editMode="cell"
                        rowHeight={scale.gridRowHeight}
                        columnHeaderHeight={scale.gridHeaderHeight}
                        disableRowSelectionOnClick
                        processRowUpdate={(newRow) => {
                          handleTemplatePropertyUpdate(newRow);
                          return newRow;
                        }}
                        onProcessRowUpdateError={(error) => console.error(error)}
                        getRowClassName={(params) => {
                          if (templateDiffSets.extra.has(params.row.name)) {
                            return 'template-row-extra';
                          }
                          if (templateDiffSets.mismatched.has(params.row.name)) {
                            return 'template-row-mismatch';
                          }
                          return '';
                        }}
                        sx={{ fontSize: scale.fontSize, lineHeight: scale.lineHeight }}
                      />
                    </Box>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    左のリストからテンプレートを選択してください。
                  </Typography>
                )}
              </Paper>
            </Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
