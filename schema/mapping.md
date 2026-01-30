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

## 3) Property mapping
- `id` → `sbco:id` (xsd:string)
- `name` → `sbco:name` (xsd:string)
- `parentId` → `sbco:isPartOf` (object property to parent IRI)

## 4) ID/Name resolution
The core parser normalizes ID/Name as follows:
- `id`: `id` → `pointId` → `deviceId` (first non-empty)
- `name`: `name` → `pointName` → `deviceName` (first non-empty)

## 5) Unknown columns
- MVP output ignores unknown CSV columns.
- Preservation of unknown columns remains in CSV handling only.

## 6) Output format
- RDF is emitted as Turtle with prefixes:
  - `sbco:` → `https://www.sbco.or.jp/ont/`
  - `sbr:` → `https://www.sbco.or.jp/ont/resource/`
  - `xsd:` → `http://www.w3.org/2001/XMLSchema#`
- YAML is emitted as a list of resources derived from the RDF mapping:
  - Top-level: `resources:`
  - Fields: `id`, `name`, `class`, `isPartOf` (optional)
