import {
  getHierarchyDropReasons,
  HierarchyDropReason,
  lacksLevelSignal,
  lacksRoomSignal,
  normalizeValue,
  resolveHierarchyField,
  resolveHierarchySignals,
  resolveRowId,
} from './row-utils';
import { resolveTreeMode } from './tree';
import { Issue, RowRecord } from './types';

// A dropped row is not one issue -- it is one issue per row, and a real point list can drop
// thousands. Rendering every one of them (IssuesDrawer paints a box per issue) or writing them
// all to stderr buries the summary that actually matters, so per-row issues stop here. The cap
// is never silent: the summary issue always carries the exact totals, and says how many
// per-row issues were withheld.
export const MAX_ROW_ISSUES = 200;

export const ROW_DROPPED = 'row_dropped';
export const BUILDINGOS_ROOM_MISSING = 'buildingos_room_missing';
export const BUILDINGOS_LEVEL_MISSING = 'buildingos_level_missing';
export const EQUIPMENT_SPLIT = 'equipment_split';

const DROP_REASON_LABELS: Record<HierarchyDropReason | 'id', string> = {
  site: 'site 未設定',
  building: 'building 未設定',
  device: 'device_id/device_name 未設定',
  id: 'id 未設定',
};

export type UnrepresentedRow = {
  rowId?: string;
  reasons: (HierarchyDropReason | 'id')[];
  row: RowRecord;
};

function rowIdForIssue(row: RowRecord): string | undefined {
  const id = resolveRowId(row);
  if (id) return id;
  const fallback = normalizeValue(row['__rowId']);
  return fallback || undefined;
}

/**
 * The input rows that no graph-derived output can contain, with the reason for each.
 *
 * Exported so a caller can reconcile counts directly -- `rows.length - listUnrepresentedRows()`
 * is how many of the input rows actually reach RDF/YAML/DTDL/WoT/Tree JSON. Comparing input
 * rows against the emitted resource count does not work: the graph also synthesizes Site,
 * Building, Level and Room nodes that were never rows of their own.
 */
export function listUnrepresentedRows(rows: RowRecord[]): UnrepresentedRow[] {
  const dropped: UnrepresentedRow[] = [];

  if (resolveTreeMode(rows) === 'explicit-graph') {
    // buildParentChildTree() keys every node by resolveId(); a row that resolves to no id
    // never becomes a node, so it cannot reach any graph-derived output.
    for (const row of rows) {
      if (!resolveRowId(row)) {
        dropped.push({ rowId: rowIdForIssue(row), reasons: ['id'], row });
      }
    }
    return dropped;
  }

  for (const row of rows) {
    const reasons = getHierarchyDropReasons(row);
    if (reasons.length > 0) {
      dropped.push({ rowId: rowIdForIssue(row), reasons, row });
    }
  }
  return dropped;
}

function summarizeReasons(dropped: UnrepresentedRow[]): string {
  const counts = new Map<string, number>();
  for (const row of dropped) {
    for (const reason of row.reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(
      ([reason, count]) => `${DROP_REASON_LABELS[reason as HierarchyDropReason | 'id']} ${count}件`,
    )
    .join(' / ');
}

/**
 * Reconciles the input rows against what a graph-derived output can actually contain.
 *
 * buildTree() drops rows whose Site/Building/Level chain or device link cannot be resolved,
 * and every output built on top of it (RDF, YAML, DTDL, WoT, Tree JSON) inherits that drop
 * without a word. Before this check, a run over a 34,895-row point list produced 31,324
 * PointExt nodes and reported "0 SHACL violations" -- a zero that never looked at the missing
 * 3,571 rows. Emitting these as violations makes the output fail closed instead, so a clean
 * validation result means every input row was actually examined.
 *
 * Also reports rows that DO reach the output but attach Equipment straight to a Level because
 * installation_area is unset. That is legal RDF and the vendored SHACL accepts it, so it is a
 * warning rather than a violation -- but Building OS will not ingest that shape.
 */
export function checkHierarchyCoverage(rows: RowRecord[]): Issue[] {
  const issues: Issue[] = [];
  const dropped = listUnrepresentedRows(rows);

  if (dropped.length > 0) {
    const shown = Math.min(dropped.length, MAX_ROW_ISSUES);
    const withheld = dropped.length - shown;
    issues.push({
      code: ROW_DROPPED,
      severity: 'violation',
      message:
        `入力 ${rows.length.toLocaleString('ja-JP')} 行のうち ${dropped.length.toLocaleString('ja-JP')} 行は` +
        `階層を解決できないため、この形式の出力に含まれません（内訳: ${summarizeReasons(dropped)}）。` +
        `出力に含まれるのは ${(rows.length - dropped.length).toLocaleString('ja-JP')} 行です。` +
        (withheld > 0
          ? `行単位のIssueは先頭 ${shown.toLocaleString('ja-JP')} 件のみ表示しています（残り ${withheld.toLocaleString('ja-JP')} 件は省略）。`
          : ''),
    });

    for (const row of dropped.slice(0, shown)) {
      issues.push({
        code: ROW_DROPPED,
        severity: 'violation',
        message: `階層を解決できないため出力に含まれません（${summarizeReasons([row])}）。`,
        rowId: row.rowId,
        // Same rule as the Building OS warnings below: issue.field addresses a grid column, so
        // the drop reason has to be resolved to one ("device" is not a column; device_id is).
        // 'id' has no signal group -- it is the literal id column of an explicit-graph CSV.
        field: row.reasons[0] === 'id' ? 'id' : resolveHierarchyField(row.row, row.reasons[0]),
      });
    }
  }

  if (resolveTreeMode(rows) === 'hierarchy-signal') {
    for (const check of BUILDINGOS_SHAPE_CHECKS) {
      issues.push(...checkBuildingOsShape(rows, check));
    }
    issues.push(...checkEquipmentSplit(rows));
  }

  return issues;
}

/**
 * A hierarchy link the graph can do without but Building OS cannot.
 *
 * Both Level and Room are optional in the graph: tree.ts attaches what is below them one
 * step higher instead, and the vendored SHACL accepts the result. Building OS ingests only
 * the full Site -> Building -> Level -> Room -> Equipment -> Point chain, so these rows are
 * reported as warnings -- they reach the output, they just will not load.
 */
type BuildingOsShapeCheck = {
  code: string;
  field: 'level' | 'room';
  applies: (row: RowRecord) => boolean;
  summary: (count: string) => string;
  perRow: string;
};

const BUILDINGOS_SHAPE_CHECKS: BuildingOsShapeCheck[] = [
  {
    code: BUILDINGOS_LEVEL_MISSING,
    field: 'level',
    // resolveHierarchyField() turns this into the column this CSV carries (floor / level / ...).
    applies: lacksLevelSignal,
    summary: (count) =>
      `${count} 行は floor（level）が未設定のため Level が生成されず、Room または Equipment が Building に直接ぶら下がります。` +
      `ビルOS はこの階層を受理しません。`,
    perRow:
      'floor（level）が未設定のため Level が生成されません（Site → Building → Room → Equipment → Point）。',
  },
  {
    code: BUILDINGOS_ROOM_MISSING,
    field: 'room',
    applies: lacksRoomSignal,
    summary: (count) =>
      `${count} 行は installation_area が未設定のため Room が生成されず、Equipment が直上の空間` +
      `（Level、無ければ Building）に直接ぶら下がります。ビルOS はこの階層を受理しません。`,
    perRow:
      'installation_area が未設定のため Room が生成されず、Equipment が直上の空間（Level、無ければ Building）に直接ぶら下がります。',
  },
];

function checkBuildingOsShape(rows: RowRecord[], check: BuildingOsShapeCheck): Issue[] {
  const matched = rows.filter(
    (row) => getHierarchyDropReasons(row).length === 0 && check.applies(row),
  );
  if (matched.length === 0) return [];

  const shown = Math.min(matched.length, MAX_ROW_ISSUES);
  const withheld = matched.length - shown;
  const issues: Issue[] = [
    {
      code: check.code,
      severity: 'warning',
      message:
        check.summary(matched.length.toLocaleString('ja-JP')) +
        (withheld > 0
          ? `行単位のIssueは先頭 ${shown.toLocaleString('ja-JP')} 件のみ表示しています（残り ${withheld.toLocaleString('ja-JP')} 件は省略）。`
          : ''),
    },
  ];

  for (const row of matched.slice(0, shown)) {
    issues.push({
      code: check.code,
      severity: 'warning',
      message: check.perRow,
      rowId: rowIdForIssue(row),
      field: resolveHierarchyField(row, check.field),
    });
  }

  return issues;
}

/**
 * Rows of one device that resolve to different places in the graph.
 *
 * buildHierarchyTree() keys an Equipment by its parent as well as its device id, so rows of the
 * same device that disagree about site/building/floor/installation_area become two nodes --
 * `DEV1` and `DEV1__1`, an id no input row carries. Before #40 a row with no floor was dropped
 * and blocked the output, so this could only happen through a room disagreement; now that an
 * unset floor keeps the row, it must not be the case nothing reports.
 */
function describeSpace(row: RowRecord): string {
  const signals = resolveHierarchySignals(row);
  return [
    signals.site,
    signals.building,
    signals.level || '(階なし)',
    signals.room || '(部屋なし)',
  ].join(' / ');
}

function checkEquipmentSplit(rows: RowRecord[]): Issue[] {
  const firstSpaceByDevice = new Map<string, string>();
  const conflictingRows: { row: RowRecord; device: string; space: string; first: string }[] = [];

  for (const row of rows) {
    if (getHierarchyDropReasons(row).length > 0) continue;
    const signals = resolveHierarchySignals(row);
    // Only an explicit device_id splits: with a name alone, tree.ts keys the Equipment by its
    // parent (equipment:room:.../AHU), so one "AHU" per room is two deliberately distinct
    // nodes, not one device torn in half.
    const device = signals.deviceId;
    if (!device) continue;

    const space = describeSpace(row);
    const first = firstSpaceByDevice.get(device);
    if (first === undefined) {
      firstSpaceByDevice.set(device, space);
      continue;
    }
    if (first !== space) {
      conflictingRows.push({ row, device, space, first });
    }
  }

  if (conflictingRows.length === 0) return [];

  const devices = Array.from(new Set(conflictingRows.map((entry) => entry.device)));
  const named = devices.slice(0, 5).join(', ');
  const shown = Math.min(conflictingRows.length, MAX_ROW_ISSUES);
  const withheld = conflictingRows.length - shown;

  const issues: Issue[] = [
    {
      code: EQUIPMENT_SPLIT,
      severity: 'warning',
      message:
        `${devices.length.toLocaleString('ja-JP')} 件の device_id で行ごとに空間の解決結果が異なるため、` +
        `Equipment が複数のノードに分かれます（${named}${devices.length > 5 ? ' ほか' : ''}）。` +
        `分裂したノードには元データに存在しない id（例: DEV1__1）が付きます。` +
        (withheld > 0
          ? `行単位のIssueは先頭 ${shown.toLocaleString('ja-JP')} 件のみ表示しています（残り ${withheld.toLocaleString('ja-JP')} 件は省略）。`
          : ''),
    },
  ];

  for (const entry of conflictingRows.slice(0, shown)) {
    issues.push({
      code: EQUIPMENT_SPLIT,
      severity: 'warning',
      message:
        `device_id "${entry.device}" は他の行では ${entry.first} に解決されますが、この行は ${entry.space} です。` +
        `別の Equipment ノードとして出力されます。`,
      rowId: rowIdForIssue(entry.row),
      field: resolveHierarchyField(entry.row, 'device'),
    });
  }

  return issues;
}
