# packages/core

Core logic for the building model editor. This package is framework-agnostic and
provides CSV parsing, tree construction, and validation.

## Exports
- `parseCsv(text: string): RowRecord[]` - CSV parser with header normalization.
- `getLastHeader(): string[]` - Returns the most recent CSV header list.
- `exportCsv(rows: RowRecord[]): string` - CSV serializer using the last header when available.
- `exportRdf(rows: RowRecord[], options?): string` - Turtle RDF export using the OWL mapping.
- `exportYaml(rows: RowRecord[], options?): string` - YAML export aligned with the RDF mapping.
- `buildTree(rows: RowRecord[]): Node[]` - Builds parent/child relationships from rows.
- `computeDescendants(nodeId: string): string[]` - Collects descendant IDs from the last tree build.
- `validate(rows: RowRecord[]): { issues: Issue[] }` - Zod-based schema checks + referential integrity.
- Types: `RowRecord`, `Node`, `Issue` from `types.ts`.

## Tests
- `packages/core/test/core.test.ts`
  - `buildTree` relationships
  - `validate` issue detection
