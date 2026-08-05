import { useState, type MouseEvent } from 'react';
import type { Node } from '@repo/core';

const KIND_DISPLAY: Record<string, string> = {
  site: 'Site',
  Site: 'Site',
  building: 'Building',
  Building: 'Building',
  floor: 'Floor',
  Floor: 'Floor',
  level: 'Floor',
  Level: 'Floor',
  room: 'Room',
  Room: 'Room',
  space: 'Room',
  Space: 'Room',
  device: 'Device',
  Device: 'Device',
  equipment: 'Device',
  equipmentext: 'Device',
  EquipmentExt: 'Device',
  point: 'Point',
  Point: 'Point',
  pointext: 'Point',
  PointExt: 'Point',
};

export function toDisplayKind(kind = ''): string {
  return KIND_DISPLAY[kind] ?? kind;
}

function hasErrorDeep(node: Node, errorIds: Set<string>): boolean {
  if (errorIds.has(node.id)) return true;
  return node.children.some((c) => hasErrorDeep(c, errorIds));
}

function hasMatchDeep(node: Node, search: string): boolean {
  const term = search.toLowerCase();
  if ((node.name ?? '').toLowerCase().includes(term)) return true;
  if ((node.id ?? '').toLowerCase().includes(term)) return true;
  return node.children.some((c) => hasMatchDeep(c, search));
}

type TreeNodeProps = {
  node: Node;
  depth: number;
  selectedId: string;
  onSelect: (id: string) => void;
  expanded: Set<string>;
  setExpanded: (s: Set<string>) => void;
  errorIds: Set<string>;
  search: string;
};

function TreeNodeItem({
  node,
  depth,
  selectedId,
  onSelect,
  expanded,
  setExpanded,
  errorIds,
  search,
}: TreeNodeProps) {
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;
  const hasError = hasErrorDeep(node, errorIds);
  const displayKind = toDisplayKind(node.kind);

  if (
    search &&
    !(node.name ?? '').toLowerCase().includes(search.toLowerCase()) &&
    !(node.id ?? '').toLowerCase().includes(search.toLowerCase()) &&
    !hasMatchDeep(node, search)
  ) {
    return null;
  }

  const toggleExpand = (e: MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expanded);
    if (isExpanded) next.delete(node.id);
    else next.add(node.id);
    setExpanded(next);
  };

  return (
    <>
      <div
        className={'tree-node' + (isSelected ? ' selected' : '')}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(node.id)}
        data-testid={`tree-item-${node.id}`}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        <span
          className={'twisty' + (hasChildren ? (isExpanded ? ' expanded' : '') : ' empty')}
          onClick={toggleExpand}
          aria-hidden="true"
        >
          ▶
        </span>
        <span className={`kind-pill kind-${displayKind}`}>{displayKind.slice(0, 4)}</span>
        <span className="node-name">{node.name || node.id}</span>
        {hasChildren && <span className="child-count">{node.children.length}</span>}
        {hasError && <span className="err-dot" title="このノード以下に検証エラーがあります" />}
      </div>
      {isExpanded &&
        hasChildren &&
        node.children.map((c) => (
          <TreeNodeItem
            key={c.id}
            node={c}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            expanded={expanded}
            setExpanded={setExpanded}
            errorIds={errorIds}
            search={search}
          />
        ))}
    </>
  );
}

function initExpanded(nodes: Node[]): Set<string> {
  const s = new Set<string>();
  const walk = (ns: Node[], d: number) => {
    ns.forEach((n) => {
      if (d < 2) s.add(n.id);
      walk(n.children, d + 1);
    });
  };
  walk(nodes, 0);
  return s;
}

type Props = {
  tree: Node[];
  selectedId: string;
  onSelect: (id: string) => void;
  errorIds: Set<string>;
};

export function TreePanel({ tree, selectedId, onSelect, errorIds }: Props) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => initExpanded(tree));

  return (
    <>
      <div className="tree-search">
        <input
          placeholder="検索（名前 / ID）"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="ツリー検索"
        />
      </div>
      <div className="tree" data-testid="tree" role="tree">
        {tree.map((n) => (
          <TreeNodeItem
            key={n.id}
            node={n}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            expanded={expanded}
            setExpanded={setExpanded}
            errorIds={errorIds}
            search={search}
          />
        ))}
      </div>
    </>
  );
}
