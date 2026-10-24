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

### 3.1) Datatype coercion

`literalFor` (`packages/core/src/rdf.ts`) emits a plain (untyped) string literal by default, or a
typed literal (`^^xsd:*`) for fields the schema declares with a non-string `range`:

- `xsd:date`: `commissioningDate`, `installationDate`, `turnoverDate`
- `xsd:integer`: `levelNumber`, `operationalStageCount`, `interval`, `intervalCapability`, `size`
- `xsd:decimal`: `weight`
- `xsd:float`: `maxPresValue`, `minPresValue`, `scale`
- `xsd:boolean`: `writable`, `flag` — normalized through `isTruthyValue` (`row-utils.ts`) rather
  than echoing the raw CSV token: xsd:boolean's lexical space is only `true`/`false`/`1`/`0`, so a
  raw `"FALSE"`/`"Y"` is valid Turtle syntax but not a spec-valid boolean *value*
  (smartbuilding_datamodel_builder#27).

**Not decimal-typed despite looking numeric**: `area`/`capacity` are `rec:` fields but the schema
declares them `sh:nodeKind sh:IRI` / `sh:class rec:ArchitectureArea` / `rec:ArchitectureCapacity`
— object properties pointing at a value+unit node, not scalar literals. This tool doesn't
construct that node shape, so they fall through to a plain untyped string literal (same as any
other unmodeled field) rather than being tagged with a datatype the schema doesn't allow at all.

A field the schema declares numeric/boolean/date but isn't in one of these sets will still emit a
plain string literal and fail SHACL's `sh:datatype` check on that field — keep this list in sync
with the schema's slot `range:` declarations.

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

## 8) Versioned hierarchy identity (#45)

`hierarchy_id_version` (normalized to `hierarchyIdVersion`) is a dataset-wide CSV switch.
All input rows must select `2` to use the new identity scheme. Missing/blank/`1` selects
legacy. Mixing versions or using an unsupported version fails; it never silently migrates.
The switch is retained in CSV/model rows but is not an RDF predicate. Explicit
`id`/`kind`/`parent_id` graphs keep their supplied IDs and topology in both versions.

| Concern | Legacy (default) | Version 2 |
| --- | --- | --- |
| Public space ID (`Node.id`, `sbco:id`) | Recursive prefixed parent IDs/slugs | Explicit spatial ID, otherwise deterministic fallback |
| Internal logical Tree key | Parent ID + label string | `Node.treeKey`: JSON tuple `[kind, parentPublicId, "id" or "name", explicitId or label]` |
| Display name (`rec:name`) | Existing signal precedence | Name column, then conventional label column, then explicit ID |
| IRI | Base + `encodeURIComponent(publicId)` | Same escaping; no blanket decoding/replacement |
| Point `sbco:building` | Input `building` value | Ancestor Building's public ID, including in output plugins/YAML |

`Node.id` remains the public ID used by UI selection and graph links for API compatibility.
The logical key is separately calculated/stored and is never serialized as `sbco:id` or an IRI.
Public IDs share one namespace across **all classes in a dataset**. Explicit IDs are trimmed,
otherwise preserved, including Japanese and reserved characters. Identical IDs identifying
conflicting classes, parents or display names fail with a hierarchy identity error. Version 2
never suffixes an explicit Point/Device/spatial ID to resolve a collision. A genuinely repeated
row referring to the same node is allowed. Partial/contradictory metadata is rejected rather
than resolved by CSV order.

Version 2 columns (snake_case or normalized camelCase):

| Entity | Explicit public ID | Display name precedence |
| --- | --- | --- |
| Site | `site_id` | `site_name`, `site`, `site_id` |
| Building | `building_id` | `building_name`, `building`, `building_id` |
| Level | `level_id` | `level_name`, `floor_name`, `level`, `floor`, `level_id` |
| Room/Zone | `room_id` | `room_name`, `installation_area`, `room`, `space`, `target_area`, `zone`, `room_id` |
| Equipment | `device_id` | `device_name`, `device_id` |
| Point | `point_id` | `point_name`, `point_id` |

`site`, `building`, `floor` and `installation_area` are **input display labels**, not
explicit IDs in version 2. Setting `building=bldg-boptest` alone therefore does not declare
an explicit ID; also set `building_id=bldg-boptest` when that literal is the intended key.
The exported Point `building` is deliberately a reference-equivalent ID; `site`/`floor`/
`installation_area` remain label metadata. Topology (`rec:hasPart`, `rec:locatedIn`,
`rec:hasPoint`) supplies the authoritative hierarchy. Original CSV cells are not mutated.

Fallback public IDs are `<lowercase-kind>-<32 lowercase hex digits>`: FNV-1a 128 of the
UTF-8 encoded JSON logical-key tuple, with offset `6c62272e07bb014262b821756295c58d`
and prime `1000000000000000000013b`, reduced modulo 2^128 after each multiplication.
They contain no recursive ancestor path. Exact label punctuation is retained in hash input,
so names that collide under a slug stay distinct. Parent public ID scopes the fallback:
same-named levels/rooms in different buildings remain distinct. Hashes are not security
boundaries; generated/generated and generated/explicit ID collisions are detected and fail.
Use explicit IDs to distinguish equal labels under the same parent. Missing Level/Room
still uses the existing optional-hierarchy behavior.

Explicit IDs survive rename/move between exports. A move changes the logical Tree key;
the same explicit ID cannot occupy two parents simultaneously. A fallback changes when its
label or immediate parent public ID changes; descendants using fallbacks may consequently
change too. Explicit descendants retain their IDs. Spatial rename in the UI is scoped to the
selected subtree in version 2. Child arrays are sorted by public ID using code-unit comparison,
so graph traversal/serialization is independent of input row order for consistent metadata.
Point and Device IDs (`BPT-*`, etc.) remain explicit and unchanged.

Version selection is not an automatic deployment migration. See
[identity migration and RI contract verification](../docs/identity-migration.md).
