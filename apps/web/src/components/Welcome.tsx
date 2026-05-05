import { useRef, useState } from 'react';
import { parseCsv } from '@repo/core';
import type { RowRecord } from '@repo/core';

type Props = {
  onLoadSample: () => void;
  onUploadCsv: (rows: RowRecord[], filename: string) => void;
  onShowHelp: () => void;
};

export function Welcome({ onLoadSample, onUploadCsv, onShowHelp }: Props) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    onUploadCsv(rows, file.name);
  };

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-hero">
          <div className="welcome-eyebrow">Building Model Studio</div>
          <h1 className="welcome-title">建物のデータモデルを、見て・直して・出力する。</h1>
          <p className="welcome-lede">
            ビル設備（空調・照明・センサー等）のCSVを読み込むと、
            <strong>サイト → 建物 → フロア → 部屋 → 機器 → 計測点</strong>
            の階層に自動整理されます。検証・編集してから、各種データモデル形式で出力できます。
          </p>
        </div>

        <div className="welcome-body">
          <div className="welcome-section">
            <h4>はじめる</h4>
            <div
              className={'dropzone' + (drag ? ' dragging' : '')}
              onDragEnter={(e) => {
                e.preventDefault();
                if (e.dataTransfer?.types?.includes('Files')) setDrag(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDrag(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDrag(false);
                handleFile(e.dataTransfer?.files?.[0]);
              }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
            >
              <div className="dropzone-icon">📄</div>
              <div className="dropzone-headline">CSVをここへドロップ</div>
              <div className="dropzone-sub">またはクリックしてファイルを選択（pointlist.md準拠のCSV）</div>
              <input
                ref={inputRef}
                data-testid="csv-input"
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
            <div className="welcome-secondary">
              <button className="btn btn-primary" onClick={onLoadSample}>
                <span className="ic">▶</span> サンプルデータで試す
              </button>
              <button className="btn" onClick={onShowHelp}>
                CSV仕様を見る
              </button>
            </div>
          </div>

          <div className="welcome-section">
            <h4>このツールでできること</h4>
            <ul className="concept-list">
              <li>
                <span className="badge" style={{ background: 'var(--kind-building)' }}>1</span>
                <span><b>階層を可視化</b>：CSVのID/親ID関係から、ツリー表示を自動構築します。</span>
              </li>
              <li>
                <span className="badge" style={{ background: 'var(--kind-room)' }}>2</span>
                <span><b>検証する</b>：必須項目の抜けや矛盾を画面右にリストアップし、その場で修正できます。</span>
              </li>
              <li>
                <span className="badge" style={{ background: 'var(--kind-device)' }}>3</span>
                <span><b>編集する</b>：ノードを選んで、説明付きのフォームでプロパティを編集します。</span>
              </li>
              <li>
                <span className="badge" style={{ background: 'var(--kind-point)' }}>4</span>
                <span><b>出力する</b>：CSV / JSON / YAML / RDF など、用途に応じた形式で書き出します。</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="welcome-footer">
          <span>初めての方は<strong style={{ color: 'var(--accent)' }}>「サンプルデータで試す」</strong>から開始するのがおすすめ。</span>
          <span>ファイルはすべて<strong>ブラウザ内で処理</strong>され、サーバには送信されません。</span>
        </div>
      </div>
    </div>
  );
}
