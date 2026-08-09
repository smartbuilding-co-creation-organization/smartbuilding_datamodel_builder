# CSV-to-RDF Mapping (MVP)

This document defines the mapping from CSV rows to RDF instances, matching the vocabulary
policy of the canonical ontology (`smartbuilding_datamodels`) and the actual behavior of
`packages/core/src/rdf.ts`.

**Vocabulary policy**: the building hierarchy (Site/Building/Level/Room/Zone/OutdoorSpace) and
generic relationship/metadata slots use RealEstateCore (`rec:`) / Brick (`brick:`) as the
canonical vocabulary, matching `schema/building_model.owl.ttl` / `schema/building_model.shacl.ttl`
(vendored from `smartbuilding_datamodels`). `sbco:` is reserved for the SBCO-specific
`EquipmentExt` / `PointExt` extension classes and their own fields (gateway/point identifiers,
BACnet addressing, control metadata, etc.) — concepts with no upstream REC/Brick equivalent.

## 1) Instance IRI
- Base IRI: `https://www.sbco.or.jp/ont/resource/`
- Subject IRI: `<base>{id}` (URL-encoded)
- Example: `id = site-1` → `<https://www.sbco.or.jp/ont/resource/site-1>`

## 2) Class mapping (kind → RDF class)
`KIND_TO_CLASS` (`packages/core/src/constants.ts`) maps a CSV `kind` to a LinkML class name;
`exportRdf` (`packages/core/src/rdf.ts`) then picks the class's prefix from `REC_CLASSES` —
`rec:` for the space hierarchy, `sbco:` for the SBCO extension classes.

| CSV `kind` | LinkML class | RDF Class |
| --- | --- | --- |
| `site` | `Site` | `rec:Site` |
| `building` | `Building` | `rec:Building` |
| `floor` / `level` | `Level` | `rec:Level` |
| `space` / `room` | `Room` | `rec:Room` |
| `zone` | `Zone` | `rec:Zone` |
| `outdoorspace` | `OutdoorSpace` | `rec:OutdoorSpace` |
| `device` / `equipment` / `equipmentext` | `EquipmentExt` | `sbco:EquipmentExt` |
| `point` / `pointext` | `PointExt` | `sbco:PointExt` |
| (other/empty) | `Resource` | `sbco:Resource` |

## 3) Property mapping
`predicateFor` (`packages/core/src/rdf.ts`) picks a field's predicate from three sets, in order:
`REC_FIELDS` → `rec:`, then `BRICK_FIELDS` → `brick:`, then `SBCO_FIELDS` → `sbco:`. A field not
in any of the three falls back to a full `<https://www.sbco.or.jp/ont/property/{field}>` IRI (this
should not happen for any field the schema actually defines — if it does, the field is missing
from one of the three sets below and needs to be added).

- Required (from schema / SHACL):
  - `id` → `sbco:id` (xsd:string) — no REC/Brick equivalent asserted by the schema, stays `sbco:`.
  - `name` → `rec:name` (xsd:string)
  - `pointType` → `sbco:pointType` (for `PointExt` only; genuinely SBCO-specific)
  - Missing required values are auto-filled at export time (UI can override before export).
- Space hierarchy (Site/Building/Level/Room/Zone/OutdoorSpace):
  - child → parent: `rec:isPartOf`
  - parent → child: `rec:hasPart`
- Equipment ↔ Space:
  - equipment → space: `rec:locatedIn`
  - space → equipment: `rec:isLocationOf`
- Point ↔ Equipment:
  - point → equipment: `brick:isPointOf`
  - equipment → point: `rec:hasPoint`
- SBCO-specific point/device fields (no REC/Brick equivalent) — all `sbco:`:
  `gatewayId`, `localId`, `writable`, `interval`, `deviceIdBacnet`, `objectTypeBacnet`,
  `instanceNoBacnet`, `deviceType`, `pointType`, `pointSpecification`, `unit`, `maxPresValue`,
  `minPresValue`, `scale`, `installationArea`, `targetArea`, `panel`.
- Brick-specific metadata fields — `brick:`: `aggregate`, `feeds`, `hasQuantity`, `hasSubstance`,
  `operationalStageCount`.
- Generic REC metadata fields (asset/architecture-level, not hierarchy-specific) — `rec:`:
  `description`, `documentation`, `assetTag`, `commissionedBy`, `commissioningDate`,
  `installationDate`, `installedBy`, `manufacturedBy`, `modelNumber`, `mountedOn`, `servicedBy`,
  `serialNumber`, `turnoverDate`, `weight`, `address`, `area`, `capacity`, and others — see
  `REC_FIELDS` in `packages/core/src/rdf.ts` for the exhaustive list.

## 4) ID/Name resolution
The core parser normalizes ID/Name as follows:
- `id`: `id` → `pointId` → `deviceId` (first non-empty)
- `name`: `name` → `pointName` → `deviceName` (first non-empty)

## 5) Unknown columns
- Unknown CSV columns are captured into `customProperties` (`rec:customProperties`) during schema
  mapping.
- CSV round-trip still preserves the original columns in `exportCsv`.

## 6) Output format
- RDF is emitted as Turtle with prefixes:
  - `sbco:` → `https://www.sbco.or.jp/ont/`
  - `sbr:` → `https://www.sbco.or.jp/ont/resource/`
  - `rec:` → `https://w3id.org/rec/`
  - `brick:` → `https://brickschema.org/schema/Brick#`
  - `xsd:` → `http://www.w3.org/2001/XMLSchema#`
- YAML is emitted as a list of resources derived from the RDF mapping:
  - Top-level: `resources:`
  - Fields: `id`, `name`, `class`, `iri`
  - Relationships: `isPartOf`, `hasPart`, `locatedIn`, `isLocationOf`, `hasPoint`, `isPointOf`

## 7) Keeping this in sync with `smartbuilding_datamodels`
`schema/building_model.owl.ttl` / `schema/building_model.shacl.ttl` / `schema/building_model.schema.json`
in this repo are vendored copies of the generated artifacts from the canonical
`smartbuilding_co_creation_organization/smartbuilding_datamodels` repository, kept up to date via
`.github/workflows/sync-schema.yml` (triggered by a `repository_dispatch` from that repo's CI — see
that repo's `docs/architecture` for the canonical REC/Brick/SBCO equivalence table). If the class/
property mapping above ever falls out of sync with those vendored files or with `rdf.ts`, this
document is wrong — fix it here, and check whether `REC_FIELDS`/`BRICK_FIELDS`/`SBCO_FIELDS` in
`rdf.ts` need a matching update.
