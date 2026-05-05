import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildTree,
  exportCsv,
  exportDtdlInterfaces,
  exportDtdlTwinGraph,
  exportRdf,
  exportYaml,
  parseCsv,
  validate,
  type Issue,
  type Node,
  type RowRecord,
} from '@repo/core';
import { downloadFile } from './utils/downloadFile';
import { Welcome } from './components/Welcome';
import { TreePanel } from './components/TreePanel';
import { Inspector } from './components/Inspector';
import { Workspace } from './components/Workspace';
import { IssuesDrawer } from './components/IssuesDrawer';
import { HelpModal } from './components/HelpModal';
import { TemplatesView } from './components/TemplatesView';
import { SAMPLE_ROWS } from './data/sampleRows';

type HelpView = 'csv' | 'glossary' | null;
type ViewMode = 'explore' | 'templates' | 'output';
type AccentKey = 'slate' | 'emerald' | 'amber' | 'graphite';

const ACCENTS: Record<AccentKey, Record<string, string>> = {
  slate:    { '--accent': '#4a5dd8', '--accent-soft': '#eef0fc', '--accent-stroke': '#c7cdf2', '--accent-ink': '#2935a8' },
  emerald:  { '--accent': '#0f8a5f', '--accent-soft': '#e7f5ee', '--accent-stroke': '#bfe1d0', '--accent-ink': '#0a5e42' },
  amber:    { '--accent': '#a86d05', '--accent-soft': '#fbf1e0', '--accent-stroke': '#e7cf9a', '--accent-ink': '#7d4f01' },
  graphite: { '--accent': '#37404f', '--accent-soft': '#eef0f3', '--accent-stroke': '#c7cdd6', '--accent-ink': '#1f2533' },
};

function countDescendants(nodes: Node[], id: string): number {
  const find = (ns: Node[]): Node | undefined => {
    for (const n of ns) {
      if (n.id === id) return n;
      const found = find(n.children);
      if (found) return found;
    }
  };
  const countAll = (n: Node): number =>
    n.children.reduce((s, c) => s + 1 + countAll(c), 0);
  const target = find(nodes);
  return target ? countAll(target) : 0;
}

export default function App() {
  const [rows, setRows] = useState<RowRecord[]>([]);
  const [tree, setTree] = useState<Node[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<ViewMode>('explore');
  const [helpModal, setHelpModal] = useState<HelpView>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [expertMode, setExpertMode] = useState(false);
  const [accent, setAccent] = useState<AccentKey>('slate');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(ACCENTS[accent]).forEach(([k, v]) => root.style.setProperty(k, v));
  }, [accent]);

  useEffect(() => {
    document.body.classList.toggle('expert-mode', expertMode);
  }, [expertMode]);

  const recompute = (nextRows: RowRecord[]) => {
    setTree(buildTree(nextRows));
    const { issues: nextIssues } = validate(nextRows);
    setIssues(nextIssues);
  };

  const handleLoadSample = () => {
    setRows(SAMPLE_ROWS);
    recompute(SAMPLE_ROWS);
    setSelectedId('');
    setView('explore');
  };

  const handleUploadCsv = (parsed: RowRecord[]) => {
    setRows(parsed);
    recompute(parsed);
    setSelectedId('');
    setView('explore');
  };

  const handleChange = (key: string, value: string) => {
    if (!selectedId) return;
    const nextRows = rows.map((r) => {
      if ((r.id as string) !== selectedId) return r;
      const update: Record<string, string> = { [key]: value };
      if (key === 'name') {
        if (r.pointName !== undefined) update.pointName = value;
        else if (r.deviceName !== undefined) update.deviceName = value;
      }
      return { ...r, ...update };
    });
    setRows(nextRows);
    recompute(nextRows);
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setView('explore');
  };

  const handleFileUpload = async (file: File | null | undefined) => {
    if (!file) return;
    const text = await file.text();
    handleUploadCsv(parseCsv(text));
  };

  const errorIds = useMemo(() => new Set(issues.map((i) => i.rowId ?? '')), [issues]);

  const errorMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const iss of issues) {
      if (!iss.rowId) continue;
      if (!m.has(iss.rowId)) m.set(iss.rowId, new Set());
      m.get(iss.rowId)!.add(iss.field ?? '');
    }
    return m;
  }, [issues]);

  const selectedRow = useMemo(
    () => rows.find((r) => (r.id as string) === selectedId),
    [rows, selectedId],
  );

  const fieldErrors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!selectedRow) return out;
    for (const iss of issues) {
      if (iss.rowId === selectedId && iss.field) {
        out[iss.field] = iss.message;
      }
    }
    return out;
  }, [issues, selectedId, selectedRow]);

  const descendantCount = useMemo(
    () => (selectedId ? countDescendants(tree, selectedId) : 0),
    [tree, selectedId],
  );

  const step = rows.length === 0 ? 1 : view === 'output' ? 4 : selectedId ? 3 : 2;

  const handleGenerateOutput = (formatId: string): string => {
    switch (formatId) {
      case 'csv':
        return exportCsv(rows);
      case 'json':
        return JSON.stringify(buildTree(rows), null, 2);
      case 'yaml':
        try { return exportYaml(rows); } catch { return rows.map((r) => `- id: ${String(r.id)}\n  kind: ${String(r.kind)}\n  name: "${String(r.name ?? '')}"`).join('\n'); }
      case 'jsonld':
        return JSON.stringify({
          '@context': { brick: 'https://brickschema.org/schema/Brick#', '@vocab': 'https://buildingmodel.org/' },
          '@graph': rows.map((r) => ({ '@id': r.id, '@type': r.kind, name: r.name, parent: r.parentId })),
        }, null, 2);
      case 'rdf':
        try { return exportRdf(rows); } catch { return rows.map((r) => `:${String(r.id)} a :${String(r.kind)} ;\n    :name "${String(r.name ?? '').replace(/"/g, '\\"')}" .`).join('\n'); }
      case 'dtdl-interfaces':
        return exportDtdlInterfaces(rows);
      case 'dtdl-twin-graph':
        return exportDtdlTwinGraph(rows);
      default:
        return '';
    }
  };

  if (rows.length === 0) {
    return (
      <>
        <div className="app" style={{ gridTemplateRows: 'auto 1fr' }}>
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark">B</div>
              <div className="brand-name">Building Model Studio</div>
              <div className="brand-sub">建物データモデル ビルダー</div>
            </div>
            <div className="spacer" />
            <div className="top-actions">
              <button className="btn btn-ghost" onClick={() => setHelpModal('glossary')}>用語集</button>
              <button className="btn btn-ghost" onClick={() => setHelpModal('csv')}>CSV仕様</button>
            </div>
          </header>
          <Welcome
            onLoadSample={handleLoadSample}
            onUploadCsv={handleUploadCsv}
            onShowHelp={() => setHelpModal('csv')}
          />
        </div>
        <HelpModal open={!!helpModal} view={helpModal} onClose={() => setHelpModal(null)} />
      </>
    );
  }

  return (
    <>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">B</div>
            <div className="brand-name">Building Model Studio</div>
            <div className="brand-sub">／ {rows.length}行</div>
          </div>
          <div className="spacer" />
          <div className="top-actions">
            <input
              ref={fileInputRef}
              data-testid="csv-input"
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => handleFileUpload(e.target.files?.[0])}
            />
            <button className="btn" onClick={() => fileInputRef.current?.click()}>
              <span className="ic">📂</span> CSV読み込み
            </button>
            <div className="seg">
              <button className={view === 'explore' ? 'active' : ''} onClick={() => setView('explore')}>
                探索 / 編集
              </button>
              <button
                className={view === 'templates' ? 'active' : ''}
                onClick={() => setView('templates')}
                data-testid="view-templates"
              >
                テンプレート
              </button>
              <button className={view === 'output' ? 'active' : ''} onClick={() => setView('output')}>
                出力
              </button>
            </div>
            <button
              className="btn"
              data-testid="validation-summary"
              onClick={() => setIssuesOpen(true)}
              style={issues.length > 0 ? { color: 'var(--error)' } : { color: 'var(--success)' }}
            >
              {issues.length > 0 ? `⚠ ${issues.length} 件のエラー` : '✓ エラーなし'}
            </button>
            <button className="btn btn-ghost" onClick={() => setHelpModal('glossary')}>?</button>
          </div>
        </header>

        <nav className="steps" aria-label="進行状況">
          <div className={`step ${step > 1 ? 'done' : ''}`}>
            <span className="step-num">{step > 1 ? '✓' : '1'}</span>
            <span>インポート</span>
          </div>
          <div
            className={`step ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}
            onClick={() => { setView('explore'); setSelectedId(''); }}
            role="button"
            tabIndex={0}
          >
            <span className="step-num">{step > 2 ? '✓' : '2'}</span>
            <span>階層を確認</span>
          </div>
          <div
            className={`step ${step === 3 ? 'active' : step > 3 ? 'done' : ''}`}
            onClick={() => setView('explore')}
            role="button"
            tabIndex={0}
          >
            <span className="step-num">{step > 3 ? '✓' : '3'}</span>
            <span>編集 / 検証</span>
          </div>
          <div
            className={`step ${step === 4 ? 'active' : ''}`}
            onClick={() => setView('output')}
            role="button"
            tabIndex={0}
          >
            <span className="step-num">4</span>
            <span>出力</span>
          </div>
        </nav>

        <main className={view === 'templates' ? 'main main-templates' : 'main'}>
          <aside className="panel">
            <div className="panel-header">
              <h3>階層ツリー</h3>
              <button
                className="help-btn"
                onClick={() => setHelpModal('glossary')}
                title="用語集"
                aria-label="用語集を開く"
              >?</button>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              <TreePanel
                tree={tree}
                selectedId={selectedId}
                onSelect={handleSelect}
                errorIds={errorIds}
              />
            </div>
          </aside>

          {view === 'templates' ? (
            <TemplatesView
              rows={rows}
              onApplyTemplate={(next) => { setRows(next); recompute(next); }}
              expertMode={expertMode}
            />
          ) : (
            <Workspace
              rows={rows}
              tree={tree}
              selectedId={selectedId}
              onSelect={handleSelect}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              errorMap={errorMap}
              view={view}
              expertMode={expertMode}
              onGenerateOutput={handleGenerateOutput}
            />
          )}

          <aside className="panel inspector-panel">
            <div className="panel-header">
              <h3>インスペクタ</h3>
              <button
                className="help-btn"
                onClick={() => setHelpModal('glossary')}
                title="用語集"
                aria-label="用語集を開く"
              >?</button>
            </div>
            <div className="panel-body">
              <Inspector
                row={selectedRow}
                onChange={handleChange}
                fieldErrors={fieldErrors}
                descendantCount={descendantCount}
                expertMode={expertMode}
              />
            </div>
          </aside>
        </main>

        <footer className="statusbar">
          <span className="stat">
            <span className="stat-dot" style={{ color: 'var(--text-faint)' }} />
            {rows.length} 行 / {tree.length} ルート
          </span>
          <span
            className="stat"
            onClick={() => setIssuesOpen(true)}
            style={{ cursor: 'pointer' }}
          >
            <span className={`stat-dot ${issues.length === 0 ? 'ok' : 'err'}`} />
            <span className={issues.length === 0 ? 'ok' : 'err'}>
              {issues.length === 0 ? 'すべて検証OK' : `${issues.length}件のエラー`}
            </span>
          </span>
          <span className="stat">
            <span className="stat-dot ok" />
            <span className="ok">ローカル処理</span>
          </span>
          <span className="right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={expertMode}
                onChange={(e) => setExpertMode(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              エキスパートモード
            </label>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>アクセント:</span>
            {(['slate', 'emerald', 'amber', 'graphite'] as AccentKey[]).map((a) => (
              <button
                key={a}
                onClick={() => setAccent(a)}
                title={a}
                style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: ACCENTS[a]['--accent'],
                  border: accent === a ? '2px solid var(--text)' : '2px solid transparent',
                  cursor: 'pointer', padding: 0,
                }}
              />
            ))}
            <button
              className="btn btn-ghost btn-sm"
              data-testid="csv-export-button"
              onClick={() => downloadFile(exportCsv(rows), 'building-model.csv', 'text/csv;charset=utf-8')}
              style={{ fontSize: 11 }}
            >
              <span className="ic">↓</span> CSV保存
            </button>
          </span>
        </footer>
      </div>

      <IssuesDrawer
        open={issuesOpen}
        issues={issues}
        onClose={() => setIssuesOpen(false)}
        onJump={(id) => { handleSelect(id); setIssuesOpen(false); }}
      />

      <HelpModal open={!!helpModal} view={helpModal} onClose={() => setHelpModal(null)} />
    </>
  );
}
