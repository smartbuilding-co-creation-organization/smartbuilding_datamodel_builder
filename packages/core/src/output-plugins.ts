import { exportRdf } from './rdf';
import { SchemaRoot } from './schema-mapping';
import { Issue, RowRecord } from './types';
import { exportYaml } from './yaml';
import { exportDtdlInterfaces, exportDtdlTwinGraph } from './dtdl';
import { buildWotThings } from './wot';
import { validateWotThings } from './wot-validate';
import { buildOutputRows, mergeOutputRows } from './output-aggregation';
import { parseShaclRequirements, validateShacl } from './shacl';

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
  run: (options: OutputPluginRunOptions) => OutputPluginResult;
};

const OUTPUT_PLUGINS: OutputPlugin[] = [
  {
    id: 'rdf-turtle',
    label: 'RDF (Turtle)',
    format: 'RDF',
    serializer: 'Turtle',
    run: ({ rows, schema, shacl }) => {
      const outputRows = buildOutputRows(rows);
      const content = exportRdf(outputRows, { schema, autoFill: false });
      return {
        content,
        extension: 'ttl',
        mimeType: 'text/turtle;charset=utf-8;',
        issues: shacl
          ? validateShacl(outputRows, { shape: parseShaclRequirements(shacl.shapeText) })
          : undefined,
      };
    },
  },
  {
    id: 'yaml',
    label: 'YAML',
    format: 'YAML',
    serializer: 'YAML',
    run: ({ rows, schema, shacl }) => {
      const outputRows = buildOutputRows(rows);
      const content = exportYaml(outputRows, { schema, autoFill: false });
      return {
        content,
        extension: 'yaml',
        mimeType: 'text/yaml;charset=utf-8;',
        issues: shacl
          ? validateShacl(outputRows, { shape: parseShaclRequirements(shacl.shapeText) })
          : undefined,
      };
    },
  },
  {
    id: 'dtdl-interfaces',
    label: 'DTDL (Interfaces)',
    format: 'DTDL',
    serializer: 'Interfaces',
    run: ({ rows }) => {
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
    run: ({ rows }) => {
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
    run: ({ rows }) => {
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
    run: ({ rows }) => {
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

export function runOutputPlugin(
  format: string,
  serializer: string,
  options: OutputPluginRunOptions,
): OutputPluginResult {
  const plugin = findOutputPlugin(format, serializer);
  if (!plugin) {
    throw new Error(`Output plugin not found for ${format}/${serializer}`);
  }
  const merged = mergeOutputRows(options.rows, options.modelRows ?? []);
  return plugin.run({ ...options, rows: merged });
}
