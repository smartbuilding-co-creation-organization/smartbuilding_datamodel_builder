# CSV validation fixtures

These files are small input datasets for parser, tree, and validation checks.

| File | Purpose | Expected current behavior |
| --- | --- | --- |
| `valid.csv` | Baseline valid pointlist input with an unknown `extra` column. | No validation issues. |
| `invalid.csv` | Duplicate point id. | `id_duplicate` issue. |
| `large.csv` | 1,000 row scale check. | No validation issues. |
| `validation-valid-edge.csv` | Valid pointlist rows with quoted commas, blank optional fields, multiple sites/buildings, and unknown columns. | No validation issues; unknown columns are preserved. |
| `validation-required-missing.csv` | Required pointlist fields are blank across several rows. | `schema` issues on required fields. |
| `validation-hierarchy-missing.csv` | Hierarchy signal columns are present while required parents are blank or marked with `-`. | `hierarchy_missing` issues. |
| `validation-parent-links.csv` | Generic `id` / `parent_id` rows covering missing parent, duplicate id, and parent cycle. | `parent_missing`, `id_duplicate`, and `cycle` issues. |
| `validation-semantic-edge.csv` | Structurally parseable but semantically suspicious values for future rules. | Mostly accepted by current validation; useful when adding enum/range/type checks. |
