import { exportRdf } from './rdf';
import { SchemaRoot } from './schema-mapping';
import { RowRecord } from './types';
import { exportYaml } from './yaml';

export type OutputPluginResult = {
  content: string;
  extension: string;
  mimeType: string;
};

export type OutputPluginRunOptions = {
  rows: RowRecord[];
  schema?: SchemaRoot;
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
    run: ({ rows, schema }) => ({
      content: exportRdf(rows, { schema }),
      extension: 'ttl',
      mimeType: 'text/turtle;charset=utf-8;',
    }),
  },
  {
    id: 'yaml',
    label: 'YAML',
    format: 'YAML',
    serializer: 'YAML',
    run: ({ rows, schema }) => ({
      content: exportYaml(rows, { schema }),
      extension: 'yaml',
      mimeType: 'text/yaml;charset=utf-8;',
    }),
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
  return plugin.run(options);
}
