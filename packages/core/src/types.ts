export type RowRecord = Record<string, string>;

export type Node = {
  id: string;
  /** Internal logical identity in hierarchy ID v2; never an RDF identifier. */
  treeKey?: string;
  name: string;
  parentId?: string;
  kind?: string;
  children: Node[];
};

export type Issue = {
  code: string;
  message: string;
  rowId?: string;
  field?: string;
  severity?: 'violation' | 'warning' | 'info';
  focusNode?: string;
  sourceConstraintComponent?: string;
};
