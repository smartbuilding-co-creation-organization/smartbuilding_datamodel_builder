import { useMemo, useState } from 'react';
import type { RowRecord, Node } from '@repo/core';
import { toDisplayKind } from './TreePanel';
import { downloadFile } from '../utils/downloadFile';

export type OutputFormat = {
  id: string;
  label: string;
  ext: string;
  desc: string;
};

export const OUTPUT_FORMATS: OutputFormat[] = [
  { id: 'csv', label: 'CSV', ext: 'csv', desc: '元のCSV形式で出力。Excelやスプレッドシートで開けます。' },
  { id: 'json', label: 'JSON', ext: 'json', desc: '階層構造を保持したJSON。アプリやAPIで扱いやすい形式です。' },
  { id: 'yaml', label: 'YAML', ext: 'yaml', desc: 'デバイステンプレートを含む人間可読形式。レビューに向いています。' },
  { id: 'jsonld', label: 'JSON-LD', ext: 'jsonld', desc: 'Linked Data形式。Brick / RealEstateCore等のスキーマと連携可能。' },
  { id: 'rdf', label: 'RDF Turtle', ext: 'ttl', desc: 'セマンティックWeb形式。SPARQLで問い合わせができます。' },
];

function collectNodeIds(node: Node, set: Set<string>): void {
  set.add(node.id);
  for (const child of node.children) collectNodeIds(child, set);
}

function descendantIds(tree: Node[], id: string): Set<string> {
  const set = new Set<string>();
  const findAndCollect = (nodes: Node[]): boolean => {
    for (const n of nodes) {
      if (n.id === id) { collectNodeIds(n, set); return true; }
      if (findAndCollect(n.children)) return true;
    }
    return false;
  };
  findAndCollect(tree);
  return set;
}

type BreadcrumbItem = { id: string; name: string; kind: string };

function buildBreadcrumb(tree: Node[], selectedId: string): BreadcrumbItem[] {
  const path: BreadcrumbItem[] = [];
  const walk = (nodes: Node[], ancestors: BreadcrumbItem[]): boolean => {
    for (const n of nodes) {
      const cur: BreadcrumbItem = { id: n.id, name: n.name || n.id, kind: n.kind ?? '' };
      if (n.id === selectedId) {
        path.push(...ancestors, cur);
        return true;
      }
      if (walk(n.children, [...ancestors, cur])) return true;
    }
    return false;
  };
  walk(tree, []);
  return path;
}

const PRIORITY_COLS = ['kind', 'id', 'name', 'deviceType', 'device_type', 'pointType', 'point_type', 'writable', 'unit', 'site', 'building', 'floor', 'installationArea', 'installation_area'];
const MONO_COLS = new Set(['id', 'parentId', 'parent_id', 'pointId', 'point_id', 'deviceId', 'device_id']);

function pickColumns(rows: RowRecord[]): string[] {
  if (!rows.length) return [];
  const all = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).filter((k) => k !== 'children');
  const ordered = [
    ...PRIORITY_COLS.filter((k) => all.includes(k)),
    ...all.filter((k) => !PRIORITY_COLS.includes(k)),
  ];
  return ordered.slice(0, 9);
}

type PreviewModal = { title: string; content: string; ext: string } | null;

type Props = {
  rows: RowRecord[];
  tree: Node[];
  selectedId: string;
  onSelect: (id: string) => void;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  errorMap: Map<string, Set<string>>;
  view: 'explore' | 'output';
  expertMode: boolean;
  onGenerateOutput: (formatId: string) => string;
};

export function Workspace({
  rows,
  tree,
  selectedId,
  onSelect,
  searchTerm,
  setSearchTerm,
  errorMap,
  view,
  expertMode,
  onGenerateOutput,
}: Props) {
  const [previewModal, setPreviewModal] = useState<PreviewModal>(null);

  const filteredRows = useMemo(() => {
    let out = rows;
    if (selectedId) {
      const dset = descendantIds(tree, selectedId);
      out = out.filter((r) => dset.has(r.id as string));
    }
    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      out = out.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(t)));
    }
    return out;
  }, [rows, selectedId, searchTerm]);

  const breadcrumb = useMemo(
    () => (selectedId ? buildBreadcrumb(tree, selectedId) : []),
    [tree, selectedId],
  );

  const columns = useMemo(() => pickColumns(filteredRows), [filteredRows]);

  if (view === 'output') {
    return (
      <div className="workspace" data-testid="output-view">
        <div className="workspace-header">
          <div className="crumb">
            <span className="crumb-current">出力</span>
          </div>
        </div>
        <div className="outputs">
          <h2>データモデルとして出力</h2>
          <p className="lede">CSVの内容を、用途に応じた形式で書き出します。プレビューを確認してから保存できます。</p>
          <div className="format-grid">
            {OUTPUT_FORMATS.map((f) => (
              <div className="format-card" key={f.id}>
                <div className="ftitle">
                  {f.label} <span className="fext">.{f.ext}</span>
                </div>
                <div className="fdesc">{f.desc}</div>
                <div className="factions">
                  <button
                    className="btn"
                    onClick={() => {
                      const content = onGenerateOutput(f.id);
                      setPreviewModal({ title: `${f.label} プレビュー`, content, ext: f.ext });
                    }}
                  >
                    プレビュー
                  </button>
                  <button
                    className="btn btn-primary"
                    data-testid={`output-download-${f.id}`}
                    onClick={() => {
                      const content = onGenerateOutput(f.id);
                      downloadFile(content, `building-model.${f.ext}`, 'text/plain;charset=utf-8');
                    }}
                  >
                    <span className="ic">↓</span> ダウンロード
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {previewModal && (
          <div className="modal-backdrop" onClick={() => setPreviewModal(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 920 }}>
              <div className="modal-header">
                <h2>{previewModal.title}</h2>
                <button className="btn btn-ghost btn-sm" onClick={() => setPreviewModal(null)}>✕</button>
              </div>
              <div className="modal-body">
                <pre style={{
                  background: 'var(--bg-sunken)', padding: 14, borderRadius: 8,
                  fontSize: 12, lineHeight: 1.55, fontFamily: 'var(--font-mono)',
                  maxHeight: 520, overflow: 'auto', margin: 0,
                }}>
                  {previewModal.content}
                </pre>
              </div>
              <div className="modal-footer">
                <button className="btn" onClick={() => setPreviewModal(null)}>閉じる</button>
                <button
                  className="btn btn-primary"
                  data-testid="csv-export-button"
                  onClick={() => {
                    downloadFile(previewModal.content, `building-model.${previewModal.ext}`, 'text/plain;charset=utf-8');
                    setPreviewModal(null);
                  }}
                >
                  <span className="ic">↓</span> ダウンロード
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="workspace">
      <div className="workspace-header">
        <div className="crumb">
          {breadcrumb.length === 0 ? (
            <span className="crumb-current">すべて</span>
          ) : (
            breadcrumb.map((p, i) => (
              <span key={p.id}>
                {i > 0 && <span className="crumb-sep">›</span>}
                <span className="crumb-item" onClick={() => onSelect(p.id)}>
                  <span className={`kind-pill kind-${toDisplayKind(p.kind)}`} style={{ fontSize: 8 }}>
                    {toDisplayKind(p.kind).slice(0, 4)}
                  </span>
                  <span className={i === breadcrumb.length - 1 ? 'crumb-current' : ''}>
                    {p.name}
                  </span>
                </span>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="workspace-toolbar">
        <div className="left">
          <div className="search-input">
            <span className="ic">🔎</span>
            <input
              data-testid="grid-search"
              placeholder="この範囲を検索"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="グリッド検索"
            />
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {filteredRows.length} 件
          </span>
        </div>
        <div className="right">
          {!expertMode && (
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              行クリックで右の<b>インスペクタ</b>に表示
            </span>
          )}
        </div>
      </div>

      {!expertMode && rows.length > 0 && filteredRows.length === rows.length && !selectedId && (
        <div style={{ padding: '12px 18px' }}>
          <div className="coach">
            <span className="coach-icon">i</span>
            <span>
              <b>使い方：</b>左の階層ツリーで<b>建物・フロア・部屋</b>などを選ぶと、その配下のデバイス・計測点だけがここに絞り込まれます。行をクリックすると右側のインスペクタで編集できます。
            </span>
          </div>
        </div>
      )}

      <div className="grid-wrap">
        {filteredRows.length === 0 ? (
          <div className="empty-state">
            <div>
              <div className="ic">∅</div>
              <div className="title">該当する行がありません</div>
              <div>検索条件をクリアするか、別のノードを選択してください。</div>
            </div>
          </div>
        ) : (
          <table className="grid" data-testid="grid-csv">
            <thead>
              <tr>
                {columns.map((c) => <th key={c}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const errs = errorMap.get(r.id as string);
                const isSelected = selectedId === (r.id as string);
                return (
                  <tr
                    key={r.id as string}
                    className={isSelected ? 'selected' : ''}
                    onClick={() => onSelect(r.id as string)}
                    style={{ cursor: 'pointer' }}
                  >
                    {columns.map((c) => {
                      const isErr = errs?.has(c);
                      const isMono = MONO_COLS.has(c);
                      return (
                        <td key={c} className={(isErr ? 'cell-error ' : '') + (isMono ? 'mono' : '')}>
                          {isErr && <span className="err-icon" title="必須項目が空です">⚠</span>}
                          {(r[c] as string | undefined) ?? ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
