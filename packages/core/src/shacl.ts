import { Parser } from 'n3';
import rdf from 'rdf-ext';
import SHACLValidator from 'rdf-validate-shacl';
import type { DatasetCore, Quad, Term } from '@rdfjs/types';
import type { Issue, RowRecord } from './types';
import type { SchemaRoot } from './schema-mapping';
import { exportRdf } from './rdf';

export type ShaclValidationResult = {
  conforms: boolean;
  issues: Issue[];
};

function parseTurtle(text: string): DatasetCore {
  const parser = new Parser({ format: 'text/turtle', factory: rdf });
  return rdf.dataset(parser.parse(text) as Quad[]);
}

function localName(term: Term | undefined): string | undefined {
  if (!term?.value) return undefined;
  const value = term.value;
  const separator = Math.max(value.lastIndexOf('#'), value.lastIndexOf('/'));
  const encoded = separator >= 0 ? value.slice(separator + 1) : value;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function rowIdFromFocusNode(focusNode: Term): string | undefined {
  if (focusNode.termType !== 'NamedNode') return undefined;
  return localName(focusNode);
}

function severityFromTerm(term: Term): Issue['severity'] {
  switch (localName(term)?.toLowerCase()) {
    case 'warning':
      return 'warning';
    case 'info':
      return 'info';
    default:
      return 'violation';
  }
}

export async function validateRdfWithShacl(
  dataTurtle: string,
  shapeTurtle: string,
): Promise<ShaclValidationResult> {
  const dataGraph = parseTurtle(dataTurtle);
  const shapesGraph = parseTurtle(shapeTurtle);
  const validator = new SHACLValidator(shapesGraph);
  const report = await validator.validate(dataGraph);

  return {
    conforms: report.conforms,
    issues: report.results.map((result) => ({
      code: 'shacl',
      message:
        result.message
          .map((message) => message.value)
          .filter(Boolean)
          .join(' / ') || 'SHACL constraint violation',
      rowId: rowIdFromFocusNode(result.focusNode),
      field: localName(result.path),
      severity: severityFromTerm(result.severity),
      focusNode: result.focusNode.value,
      sourceConstraintComponent: result.sourceConstraintComponent.value,
    })),
  };
}

export async function validateRowsWithShacl(
  rows: RowRecord[],
  shapeTurtle: string,
  options: { schema?: SchemaRoot } = {},
): Promise<ShaclValidationResult> {
  return validateRdfWithShacl(
    exportRdf(rows, { schema: options.schema, autoFill: false }),
    shapeTurtle,
  );
}
