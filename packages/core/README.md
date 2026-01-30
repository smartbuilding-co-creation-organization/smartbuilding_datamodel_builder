# packages/core

Core logic for the building model editor. This package is framework-agnostic and
provides CSV parsing, tree construction, and validation.

## Exports
- `parseCsv(text: string, options?: { schema?: SchemaRoot }): RowRecord[]` - CSV parser with header normalization and optional schema mapping.
- `getLastHeader(): string[]` - Returns the most recent CSV header list.
- `exportCsv(rows: RowRecord[]): string` - CSV serializer using the last header when available.
- `exportRdf(rows: RowRecord[], options?: { schema?: SchemaRoot; autoFill?: boolean }): string` - Turtle RDF export using the OWL mapping (schema-aware required fields).
- `exportYaml(rows: RowRecord[], options?: { schema?: SchemaRoot; autoFill?: boolean }): string` - YAML export aligned with the RDF mapping (schema-aware required fields).
- `buildTree(rows: RowRecord[]): Node[]` - Builds parent/child relationships from rows.
- `computeDescendants(nodeId: string): string[]` - Collects descendant IDs from the last tree build.
- `validate(rows: RowRecord[], options?: { schema?: SchemaRoot }): { issues: Issue[] }` - Zod-based schema checks + referential integrity + optional schema-required checks.
- Types: `RowRecord`, `Node`, `Issue` from `types.ts`.

## Tests
- `packages/core/test/core.test.ts`
  - `buildTree` relationships
  - `validate` issue detection
