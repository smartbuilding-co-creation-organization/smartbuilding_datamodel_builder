# Builder #45: identity migration and RI contract

## Compatibility and rollout

Existing CSVs remain legacy unless every row explicitly selects `hierarchy_id_version=2`.
Legacy IDs, IRI escaping, and Point building literals retain their previous behavior. Version
2 preserves explicit Point/Device IDs, preserves explicit spatial IDs, and aligns exported
Point `building` with the ancestor Building `sbco:id`. Adding ID columns without selecting
version 2 does not migrate legacy output. CSV round-trip preserves the switch and all input
columns; RDF and YAML use the resolved reference. IRI escaping is unchanged.

Recommended migration for BOPTEST: add `hierarchy_id_version=2`,
`site_id=site-boptest`, `building_id=bldg-boptest` on every row. Assign globally unique
`level_id`/`room_id` if rename/move stability is needed. Keep BPT-0002 through BPT-0036 and
all device IDs; do not resurrect/reuse BPT-0001. This issue adds no clock or protocol mapping.

Before any import, export both versions from the same frozen CSV and archive the original
CSV/RDF, Builder SHA, schema revision, version, and a reviewed mapping with these columns:
`kind, oldId, oldIri, newId, newIri, pointId, oldTopologyBuilding, oldBuildingLiteral,
newTopologyBuilding`. Match spatial nodes by explicit IDs plus source ancestry, not just
labels. Verify a bijection for intended resources and all 35 point/device links; stop on
ambiguous mappings. The unit fixture is an anonymous BOPTEST simulator point list, copied
from the reported `pointlist-bestest-air-trial/pointlist.csv`; it is not production data.

An already imported legacy `building:site:site-boptest/bldg-boptest` is different from
`bldg-boptest`, even if its name matches. Choose one reviewed downstream strategy:

1. Keep legacy exports and defer deployment. This is the default safe option.
2. Import v2 into an isolated graph, validate, then replace the legacy graph with the reviewed
   mapping. Do not merge both sets of space nodes into the live graph.
3. If old callers must continue to use old IDs, implement a versioned old→new alias table in
   the consuming system after agreement. Builder does not emit `owl:sameAs`, rewrite grants,
   migrate historical partitions, or implement aliases on RI's behalf. Alias authorization
   must resolve to the canonical building before checking grants, and must reject ambiguity.

Update building search keys, grants/allowlists, provisioning caches/revisions and lake query
metadata as one coordinated change. Historical partitions must remain readable across the
key boundary. Rollback restores the archived legacy graph and corresponding grants/cache
revision/alias version; preserve the historical key timeline for telemetry written during
both intervals. Rolling back the graph alone cannot move old lake objects. Never delete
old partitions as part of this change.

## Read-only RI findings

The inspected RI checkout (`7a298fe68276c56985c25d1510907d52c2915ab6`) was read only. `OxiGraphTwinAdminService.PreviewImportAsync`
materializes REC/Brick input into canonical SBCO vocabulary before its hierarchy checks.
`OxiGraphPointMetadataDataSource` uses the topology Building's `sbco:id` as the partition
key, with the Point building literal only as fallback. Its `BuildingLiteralMismatches`
warning explicitly calls out historical partition changes and the API-server lake
point-buildings reset endpoint. That operation is a deployment concern; no endpoint was
called here. Confirm the exact RI revision before applying a migration.

Builder's executable unit/E2E checks cover Turtle parsing, 35-point retention, unchanged
Point/Device IDs, spatial links, reference equality, input ordering, re-export, model-row
aggregation, and scoped editing. These are producer contracts. They do not establish that
RI's importer, authorization, provisioning and historical query work end to end.

## Required RI integration gate before deployment (not executed here)

Run against a disposable RI/OxiGraph/lake environment with a pinned RI SHA and the archived
legacy/v2 artifacts. Do not use a production environment for this gate.

| Contract | Assertions |
| --- | --- |
| Import + materialization | Preview and apply v2; 35 points, no orphan/ambiguous IDs, complete Site→Building→Level→Room→Equipment→Point links; repeat import is idempotent |
| Point metadata | Execute RI's point projection/device link/reachability queries against materialized graph; all 35 topology building IDs and Point building literals equal `bldg-boptest`, with zero BuildingLiteralMismatches |
| Building search | New building ID returns exactly the expected 35 points; another same-named building returns only its own points; old-ID lookup follows the chosen alias/defer policy |
| Authorization | Grant building A and deny B; same labels and alias paths never bypass the building-ID grant; ungranted old/new IDs are denied |
| Provisioning | Gateway point list still has the same 35 canonical point IDs, device IDs and native addressing; only intended building references/revisions change |
| History | Write synthetic telemetry before/after migration and rollback; queries spanning all three intervals read the old/new partitions without loss or cross-building leakage |
| Rollback | Restore archived graph/grants/cache/alias versions and confirm search/auth/provisioning/history again; retain both key intervals |

RI product changes, actual import, grants, provisioning and history calls are outside this
worktree's authorized scope. Keep the cross-repository acceptance item open until this gate
passes; producer tests must not be reported as RI end-to-end tests.
