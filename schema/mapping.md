# CSV-to-RDF Mapping (MVP)

This document defines the minimal mapping from CSV rows to RDF instances based on
`schema/building_model.owl.ttl`.

## 1) Instance IRI
- Base IRI: `https://www.sbco.or.jp/ont/resource/`
- Subject IRI: `<base>{id}` (URL-encoded)
- Example: `id = site-1` → `<https://www.sbco.or.jp/ont/resource/site-1>`

## 2) Class mapping (kind → owl:Class)
| CSV `kind` | RDF Class |
| --- | --- |
| `site` | `sbco:Site` |
| `building` | `sbco:Building` |
| `floor` | `sbco:Level` |
| `space` | `sbco:Room` |
| `device` | `sbco:Equipment` |
| `point` | `sbco:Point` |
| (other/empty) | `sbco:Resource` |

## 3) Property mapping (hierarchy semantics)
- Required (from schema / SHACL):
  - `id` → `sbco:id` (xsd:string)
  - `name` → `sbco:name` (xsd:string)
  - `pointType` → `sbco:pointType` (for `PointExt` only)
  - Missing required values are auto-filled at export time (UI can override before export).
- Space hierarchy (Site/Building/Level/Room/Zone/OutdoorSpace):
  - child → parent: `sbco:isPartOf`
  - parent → child: `sbco:hasPart`
- Equipment ↔ Space:
  - equipment → space: `sbco:locatedIn`
  - space → equipment: `sbco:isLocationOf`
- Point ↔ Equipment:
  - point → equipment: `sbco:isPointOf`
  - equipment → point: `sbco:hasPoint`

## 4) ID/Name resolution
The core parser normalizes ID/Name as follows:
- `id`: `id` → `pointId` → `deviceId` (first non-empty)
- `name`: `name` → `pointName` → `deviceName` (first non-empty)

## 5) Unknown columns
- Unknown CSV columns are captured into `customProperties` during schema mapping.
- CSV round-trip still preserves the original columns in `exportCsv`.

## 6) Output format
- RDF is emitted as Turtle with prefixes:
  - `sbco:` → `https://www.sbco.or.jp/ont/`
  - `sbr:` → `https://www.sbco.or.jp/ont/resource/`
  - `xsd:` → `http://www.w3.org/2001/XMLSchema#`
- YAML is emitted as a list of resources derived from the RDF mapping:
  - Top-level: `resources:`
  - Fields: `id`, `name`, `class`, `iri`
  - Relationships: `isPartOf`, `hasPart`, `locatedIn`, `isLocationOf`, `hasPoint`, `isPointOf`
