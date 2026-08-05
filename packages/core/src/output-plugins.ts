import { exportRdf } from './rdf';
import { SchemaRoot } from './schema-mapping';
import { Issue, RowRecord } from './types';
import { exportYaml } from './yaml';
import { exportDtdlInterfaces, exportDtdlTwinGraph } from './dtdl';
import { buildWotThings } from './wot';
import { validateWotThings } from './wot-validate';
import { buildOutputRows, mergeOutputRows } from './output-aggregation';
import { validateRowsWithShacl } from './shacl';
import { exportCsv } from './csv';
import { buildTree } from './tree';

export type OutputPluginResult = {
  content: string;
  extension: string;
  mimeType: string;
  issues?: Issue[];
};

export type OutputPluginRunOptions = {
  rows: RowRecord[];
  modelRows?: RowRecord[];
  schema?: SchemaRoot;
  shacl?: {
    shapeText: string;
  };
};

export type OutputPlugin = {
  id: string;
  label: string;
  format: string;
  serializer: string;
  run: (options: OutputPluginRunOptions) => Promise<OutputPluginResult>;
};

const OUTPUT_PLUGINS: OutputPlugin[] = [
  {
    id: 'csv',
    label: 'CSV',
    format: 'CSV',
    serializer: 'CSV',
    run: async ({ rows }) => ({
      content: exportCsv(rows),
      extension: 'csv',
      mimeType: 'text/csv;charset=utf-8;',
    }),
  },
  {
    id: 'tree-json',
    label: 'Tree (JSON)',
    format: 'JSON',
    serializer: 'Tree',
    run: async ({ rows }) => ({
      content: JSON.stringify(buildTree(rows), null, 2),
      extension: 'json',
      mimeType: 'application/json;charset=utf-8;',
    }),
  },
  {
    id: 'json-ld',
    label: 'JSON-LD',
    format: 'JSON-LD',
    serializer: 'JSON-LD',
    run: async ({ rows }) => ({
      content: JSON.stringify(
        {
          '@context': {
            sbco: 'https://www.sbco.or.jp/ont/',
            '@vocab': 'https://www.sbco.or.jp/ont/',
          },
          '@graph': rows.map((row) => ({
            '@id': row.id,
            '@type': row.kind,
            ...row,
          })),
        },
        null,
        2,
      ),
      extension: 'jsonld',
      mimeType: 'application/ld+json;charset=utf-8;',
    }),
  },
  {
    id: 'rdf-turtle',
    label: 'RDF (Turtle)',
    format: 'RDF',
    serializer: 'Turtle',
    run: async ({ rows, schema, shacl }) => {
      const outputRows = buildOutputRows(rows);
      const content = exportRdf(outputRows, { schema, autoFill: false });
      const validation = shacl
        ? await validateRowsWithShacl(outputRows, shacl.shapeText, { schema })
        : undefined;
      return {
        content,
        extension: 'ttl',
        mimeType: 'text/turtle;charset=utf-8;',
        issues: validation?.issues,
      };
    },
  },
  {
    id: 'yaml',
    label: 'YAML',
    format: 'YAML',
    serializer: 'YAML',
    run: async ({ rows, schema, shacl }) => {
      const outputRows = buildOutputRows(rows);
      const content = exportYaml(outputRows, { schema, autoFill: false });
      const validation = shacl
        ? await validateRowsWithShacl(outputRows, shacl.shapeText, { schema })
        : undefined;
      return {
        content,
        extension: 'yaml',
        mimeType: 'text/yaml;charset=utf-8;',
        issues: validation?.issues,
      };
    },
  },
  {
    id: 'dtdl-interfaces',
    label: 'DTDL (Interfaces)',
    format: 'DTDL',
    serializer: 'Interfaces',
    run: async ({ rows }) => {
      const outputRows = buildOutputRows(rows);
      return {
        content: exportDtdlInterfaces(outputRows),
        extension: 'dtdl.json',
        mimeType: 'application/json;charset=utf-8;',
      };
    },
  },
  {
    id: 'dtdl-twin-graph',
    label: 'DTDL (Twin Graph)',
    format: 'DTDL',
    serializer: 'Twin Graph',
    run: async ({ rows }) => {
      const outputRows = buildOutputRows(rows);
      return {
        content: exportDtdlTwinGraph(outputRows),
        extension: 'json',
        mimeType: 'application/json;charset=utf-8;',
      };
    },
  },
  {
    id: 'wot-td',
    label: 'WoT (Thing Description)',
    format: 'WoT',
    serializer: 'Thing Description',
    run: async ({ rows }) => {
      const outputRows = buildOutputRows(rows);
      const things = buildWotThings(outputRows, { asThingModel: false });
      return {
        content: JSON.stringify(things, null, 2),
        extension: 'td.json',
        mimeType: 'application/td+json;charset=utf-8;',
        issues: validateWotThings(things, 'td'),
      };
    },
  },
  {
    id: 'wot-tm',
    label: 'WoT (Thing Model)',
    format: 'WoT',
    serializer: 'Thing Model',
    run: async ({ rows }) => {
      const outputRows = buildOutputRows(rows);
      const things = buildWotThings(outputRows, { asThingModel: true });
      return {
        content: JSON.stringify(things, null, 2),
        extension: 'tm.json',
        mimeType: 'application/tm+json;charset=utf-8;',
        issues: validateWotThings(things, 'tm'),
      };
    },
  },
];

export function getOutputPlugins(): OutputPlugin[] {
  return [...OUTPUT_PLUGINS];
}

export function findOutputPlugin(format: string, serializer: string): OutputPlugin | undefined {
  return OUTPUT_PLUGINS.find(
    (plugin) => plugin.format === format && plugin.serializer === serializer,
  );
}

export async function runOutputPlugin(
  format: string,
  serializer: string,
  options: OutputPluginRunOptions,
): Promise<OutputPluginResult> {
  const plugin = findOutputPlugin(format, serializer);
  if (!plugin) {
    throw new Error(`Output plugin not found for ${format}/${serializer}`);
  }
  const merged = mergeOutputRows(options.rows, options.modelRows ?? []);
  return await plugin.run({ ...options, rows: merged });
}
