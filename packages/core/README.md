# packages/core

Core logic for the building model editor. This package is framework-agnostic and
provides CSV parsing, tree construction, and validation.

## Exports

- `parseCsv(text, { schema?, limits? })` - Atomic CSV parser with header normalization, schema mapping, and typed input-limit errors.
- `CsvInputLimits`, `DEFAULT_CSV_INPUT_LIMITS`, `CsvInputLimitError` - 5 MiB / 20,000 rows / 100 columns / 32 KiB per-cell defaults and error contract.
- `getLastHeader()` / `getOriginalHeaderName()` - Original header order and normalized-to-source lookup from the last successful parse.
- `exportCsv(rows)` - Original-header serializer with spreadsheet formula injection protection.
- `exportRdf(rows: RowRecord[], options?: { schema?: SchemaRoot; autoFill?: boolean }): string` - Turtle RDF export using the OWL mapping (schema-aware required fields).
- `exportYaml(rows: RowRecord[], options?: { schema?: SchemaRoot; autoFill?: boolean }): string` - YAML export aligned with the RDF mapping (schema-aware required fields).
- `validateRdfWithShacl(dataTurtle, shapeTurtle)` / `validateRowsWithShacl(rows, shapeTurtle)` - Async RDF/JS SHACL Core validation.
- `getOutputPlugins()` / `runOutputPlugin(...)` - Registry listing and async `Promise<OutputPluginResult>` execution for every UI output.
- `buildTree(rows: RowRecord[]): Node[]` - Builds parent/child relationships from rows.
- `computeDescendants(nodeId: string): string[]` - Collects descendant IDs from the last tree build.
- `validate(rows: RowRecord[], options?: { schema?: SchemaRoot }): { issues: Issue[] }` - Zod-based schema checks + referential integrity + optional schema-required checks.
- Types: `RowRecord`, `Node`, `Issue` from `types.ts`; SHACL Issues may include severity, focus node, result path, and constraint component.

## Tests
- `packages/core/test/core.test.ts`
  - `buildTree` relationships
  - `validate` issue detection
