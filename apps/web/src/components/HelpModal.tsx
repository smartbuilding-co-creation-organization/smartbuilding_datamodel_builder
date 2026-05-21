import type { ReactNode } from 'react';

type HelpView = 'csv' | 'glossary' | null;

type Props = {
  open: boolean;
  view: HelpView;
  onClose: () => void;
};

export function HelpModal({ open, view, onClose }: Props) {
  if (!open) return null;

  let title = '';
  let body: ReactNode = null;

  if (view === 'csv') {
    title = 'CSV仕様';
    body = (
      <>
        <p>各行が「1ノード（サイト・建物・フロア・部屋・デバイス・計測点）」を表します。階層は <code>parentId</code> で表現します。</p>
        <h3>必須カラム（すべてのノード）</h3>
        <ul>
          <li><code>id</code> ─ 行を一意に識別するID</li>
          <li><code>kind</code> ─ <code>site / building / floor / room / device / point</code> のいずれか</li>
          <li><code>name</code> ─ 表示名</li>
          <li><code>parentId</code> ─ 親ノードのID（ルートのSiteは空欄でOK）</li>
        </ul>
        <h3>計測点（Point）の追加必須カラム</h3>
        <ul>
          <li><code>pointId</code>, <code>pointName</code>, <code>pointType</code>, <code>pointSpecification</code></li>
          <li><code>writable</code>（true/false）, <code>localId</code></li>
          <li><code>deviceId</code>, <code>deviceName</code>, <code>deviceType</code></li>
          <li><code>site</code>, <code>building</code>, <code>floor</code>, <code>installationArea</code></li>
        </ul>
        <h3>任意カラム</h3>
        <p><code>interval</code>, <code>unit</code>, <code>scale</code>, <code>labels</code>, <code>tags</code>, <code>supplier</code>, <code>owner</code>, <code>description</code> などは任意。追加カラムも保持されます。</p>
        <h3>カラム名の形式</h3>
        <p>camelCase（<code>pointId</code>）と snake_case（<code>point_id</code>）の両方をサポートします。</p>
      </>
    );
  } else if (view === 'glossary') {
    title = '用語集';
    body = (
      <dl style={{ margin: 0 }}>
        <div className="glossary-term"><dt>Site</dt><dd>敷地・拠点。最上位の単位。例：本社キャンパス、品川データセンター。</dd></div>
        <div className="glossary-term"><dt>Building</dt><dd>建物。1つのサイト内に複数あり得ます。</dd></div>
        <div className="glossary-term"><dt>Floor / Level</dt><dd>階層。例：1F、B1、屋上。</dd></div>
        <div className="glossary-term"><dt>Room / Space</dt><dd>部屋・ゾーン。設置エリアの単位。</dd></div>
        <div className="glossary-term"><dt>Device</dt><dd>機器。エアコン、照明、センサー、メーター等。</dd></div>
        <div className="glossary-term"><dt>Point</dt><dd>計測点／制御点。1機器が複数のポイントを持ちます（例：室温、設定温度、運転状態）。</dd></div>
        <div className="glossary-term"><dt>pointType</dt><dd>標準化されたポイント種別ラベル。例：<code>roomTemp</code>, <code>roomTempSetpoint</code>。</dd></div>
        <div className="glossary-term"><dt>writable</dt><dd>制御可能か。true=書込可、false=読取専用。</dd></div>
        <div className="glossary-term"><dt>デバイステンプレート</dt><dd>同じデバイス種別が共通で持つべきプロパティ群の定義。CSVから自動推定できます。</dd></div>
        <div className="glossary-term"><dt>SHACL</dt><dd>RDFデータの制約検証言語。出力時の整合性チェックに使われます。</dd></div>
        <div className="glossary-term"><dt>JSON-LD</dt><dd>Linked Data形式のJSON。Brick等のセマンティックモデルと連携可能。</dd></div>
        <div className="glossary-term"><dt>RDF Turtle</dt><dd>セマンティックWeb形式のRDF表現。SPARQLで問い合わせができます。</dd></div>
      </dl>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="閉じる">✕</button>
        </div>
        <div className="modal-body">{body}</div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
