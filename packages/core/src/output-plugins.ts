import { exportRdf } from './rdf';
import { SchemaRoot } from './schema-mapping';
import { Issue, RowRecord } from './types';
import { exportYaml } from './yaml';
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
