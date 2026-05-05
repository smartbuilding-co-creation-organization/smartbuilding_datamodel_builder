import { buildResourceGraph } from './resource-graph';
import { RowRecord } from './types';
import { collectOutputFields, resolveOutputValue } from './output-utils';

const DTDL_CONTEXT = 'dtmi:dtdl:context;3';
const DTMI_PREFIX = 'dtmi:sbco:';
const DTMI_VERSION = ';1';

type DtdlProperty = {
  '@type': 'Property';
  name: string;
  schema: string;
  writable?: boolean;
};

type DtdlRelationship = {
  '@type': 'Relationship';
  name: string;
  target?: string;
};

type DtdlContent = DtdlProperty | DtdlRelationship;

type DtdlInterface = {
  '@context': string;
  '@id': string;
  '@type': 'Interface';
  displayName: string;
  contents: DtdlContent[];
};

type DtdlTwin = {
  $dtId: string;
  $metadata: { $model: string };
  [key: string]: unknown;
};

type DtdlRelationshipInstance = {
  $relationshipId: string;
  $sourceId: string;
  $targetId: string;
  $relationshipName: string;
};

type DtdlTwinGraph = {
  digitalTwinsFileInfo: { fileVersion: string };
  digitalTwinsGraph: {
    digitalTwins: DtdlTwin[];
    relationships: DtdlRelationshipInstance[];
  };
};

function dtmiFor(className: string): string {
  return `${DTMI_PREFIX}${className}${DTMI_VERSION}`;
}

const BASE_PROPS: DtdlProperty[] = [
  { '@type': 'Property', name: 'id', schema: 'string', writable: true },
  { '@type': 'Property', name: 'name', schema: 'string', writable: true },
];

const CLASS_EXTRA_PROPS: Record<string, DtdlProperty[]> = {
  EquipmentExt: [
    { '@type': 'Property', name: 'deviceType', schema: 'string', writable: true },
    { '@type': 'Property', name: 'gatewayId', schema: 'string', writable: true },
    { '@type': 'Property', name: 'localId', schema: 'string', writable: true },
  ],
  PointExt: [
    { '@type': 'Property', name: 'pointType', schema: 'string', writable: true },
    { '@type': 'Property', name: 'pointSpecification', schema: 'string', writable: true },
    { '@type': 'Property', name: 'unit', schema: 'string', writable: true },
    { '@type': 'Property', name: 'writable', schema: 'string', writable: true },
    { '@type': 'Property', name: 'interval', schema: 'string', writable: true },
    { '@type': 'Property', name: 'maxPresValue', schema: 'string', writable: true },
    { '@type': 'Property', name: 'minPresValue', schema: 'string', writable: true },
  ],
};

const CLASS_RELATIONS: Record<string, DtdlRelationship[]> = {
  Site: [{ '@type': 'Relationship', name: 'hasPart', target: dtmiFor('Building') }],
  Building: [{ '@type': 'Relationship', name: 'hasPart', target: dtmiFor('Level') }],
  Level: [{ '@type': 'Relationship', name: 'hasPart', target: dtmiFor('Room') }],
  Room: [
    { '@type': 'Relationship', name: 'hasPart' },
    { '@type': 'Relationship', name: 'isLocationOf', target: dtmiFor('EquipmentExt') },
  ],
  Zone: [{ '@type': 'Relationship', name: 'hasPart' }],
  OutdoorSpace: [{ '@type': 'Relationship', name: 'hasPart' }],
  EquipmentExt: [
    { '@type': 'Relationship', name: 'locatedIn' },
    { '@type': 'Relationship', name: 'hasPoint', target: dtmiFor('PointExt') },
  ],
};

export function exportDtdlInterfaces(rows: RowRecord[]): string {
  const { resources } = buildResourceGraph(rows);
  const usedClasses = new Set(resources.map((r) => r.className || 'Resource'));

  const interfaces: DtdlInterface[] = [];
  for (const className of usedClasses) {
    const contents: DtdlContent[] = [
      ...BASE_PROPS,
      ...(CLASS_EXTRA_PROPS[className] ?? []),
      ...(CLASS_RELATIONS[className] ?? []),
    ];

    interfaces.push({
      '@context': DTDL_CONTEXT,
      '@id': dtmiFor(className),
      '@type': 'Interface',
      displayName: className,
      contents,
    });
  }

  return JSON.stringify(interfaces, null, 2);
}

export function exportDtdlTwinGraph(rows: RowRecord[]): string {
  const { resources, relations } = buildResourceGraph(rows);

  const digitalTwins: DtdlTwin[] = resources.map((resource) => {
    const twin: DtdlTwin = {
      $dtId: resource.id,
      $metadata: { $model: dtmiFor(resource.className || 'Resource') },
    };

    const requiredFallback = new Set(['id', 'name']);
    const fields = collectOutputFields(resource.row, requiredFallback);
    for (const field of fields) {
      const value = resolveOutputValue(resource, field, { autoFill: false });
      if (value) twin[field] = value;
    }

    return twin;
  });

  const relationships: DtdlRelationshipInstance[] = relations.map((rel) => ({
    $relationshipId: `rel-${rel.subjectId}-${rel.predicate}-${rel.objectId}`,
    $sourceId: rel.subjectId,
    $targetId: rel.objectId,
    $relationshipName: rel.predicate,
  }));

  const graph: DtdlTwinGraph = {
    digitalTwinsFileInfo: { fileVersion: '1.0.0' },
    digitalTwinsGraph: { digitalTwins, relationships },
  };

  return JSON.stringify(graph, null, 2);
}
