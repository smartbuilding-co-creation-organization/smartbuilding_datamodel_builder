import type { ReactNode } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material';

type HelpView = 'csv' | 'glossary' | null;

type Props = {
  open: boolean;
  view: HelpView;
  onClose: () => void;
};

const GLOSSARY_TERMS: { term: string; body: ReactNode }[] = [
  { term: 'Site', body: '敷地・拠点。最上位の単位。例：本社キャンパス、品川データセンター。' },
  { term: 'Building', body: '建物。1つのサイト内に複数あり得ます。' },
  { term: 'Floor / Level', body: '階層。例：1F、B1、屋上。' },
  { term: 'Room / Space', body: '部屋・ゾーン。設置エリアの単位。' },
  { term: 'Device', body: '機器。エアコン、照明、センサー、メーター等。' },
  {
    term: 'Point',
    body: '計測点／制御点。1機器が複数のポイントを持ちます（例：室温、設定温度、運転状態）。',
  },
  {
    term: 'pointType',
    body: (
      <>
        標準化されたポイント種別ラベル。例：<code>roomTemp</code>, <code>roomTempSetpoint</code>。
      </>
    ),
  },
  { term: 'writable', body: '制御可能か。true=書込可、false=読取専用。' },
  {
    term: 'デバイステンプレート',
    body: '同じデバイス種別が共通で持つべきプロパティ群の定義。CSVから自動推定できます。',
  },
  { term: 'SHACL', body: 'RDFデータの制約検証言語。出力時の整合性チェックに使われます。' },
  { term: 'JSON-LD', body: 'Linked Data形式のJSON。Brick等のセマンティックモデルと連携可能。' },
  { term: 'RDF Turtle', body: 'セマンティックWeb形式のRDF表現。SPARQLで問い合わせができます。' },
];

export function HelpModal({ open, view, onClose }: Props) {
  const title = view === 'csv' ? 'CSV仕様' : view === 'glossary' ? '用語集' : '';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {view === 'csv' ? (
          <>
            <p>
              各行が「1ノード（サイト・建物・フロア・部屋・デバイス・計測点）」を表します。階層は{' '}
              <code>parentId</code> で表現します。
            </p>
            <h3>必須カラム（すべてのノード）</h3>
            <ul>
              <li>
                <code>id</code> ─ 行を一意に識別するID
              </li>
              <li>
                <code>kind</code> ─ <code>site / building / floor / room / device / point</code>{' '}
                のいずれか
              </li>
              <li>
                <code>name</code> ─ 表示名
              </li>
              <li>
                <code>parentId</code> ─ 親ノードのID（ルートのSiteは空欄でOK）
              </li>
            </ul>
            <h3>計測点（Point）の追加必須カラム</h3>
            <ul>
              <li>
                <code>pointId</code>, <code>pointName</code>, <code>pointType</code>,{' '}
                <code>pointSpecification</code>
              </li>
              <li>
                <code>writable</code>（true/false）, <code>localId</code>
              </li>
              <li>
                <code>deviceId</code>, <code>deviceName</code>, <code>deviceType</code>
              </li>
              <li>
                <code>site</code>, <code>building</code>, <code>floor</code>,{' '}
                <code>installationArea</code>
              </li>
            </ul>
            <p>
              <code>installationArea</code> が <code>-</code>（ハイフン）または空欄の場合、Room
              は未設定として扱われ生成されず、Equipment が直上の空間（Level、無ければ Building）
              の直下になります。<code>floor</code> が <code>-</code>（ハイフン）または空欄の場合も
              同様に Level が生成されず、Room または Equipment が Building 直下になります （Site →
              Building → Room → Equipment → Point）。行そのものは出力に含まれますが、
              ビルOSはこれらの階層を受理しないため <code>buildingos_room_missing</code> /{' '}
              <code>buildingos_level_missing</code> の warning を表示します。ビルOSへ取り込む
              データには実際の階・部屋・ゾーン名を指定してください。
            </p>
            <p>
              同じ <code>deviceId</code> の行で <code>site</code> / <code>building</code> /{' '}
              <code>floor</code> / <code>installationArea</code> の解決結果が食い違う場合、Equipment
              は複数のノードに分かれ、元データに無い id（例: <code>DEV1__1</code>）が付きます。
              この場合は <code>equipment_split</code> の warning を表示します。
            </p>
            <p>
              <code>site</code> / <code>building</code> が未設定の場合、および Point があって
              <code>deviceId</code> / <code>deviceName</code> がいずれも未設定の場合は、接続先が
              無いため行ごと出力から外れます。その行は RDF / YAML / DTDL / WoT / Tree JSON の
              いずれにも出力されないため、出力はブロックされます。
            </p>
            <h3>任意カラム</h3>
            <p>
              <code>interval</code>, <code>unit</code>, <code>scale</code>, <code>labels</code>,{' '}
              <code>tags</code>, <code>supplier</code>, <code>owner</code>, <code>description</code>{' '}
              などは任意。追加カラムも保持されます。
            </p>
            <h3>カラム名の形式</h3>
            <p>
              camelCase（<code>pointId</code>）と snake_case（<code>point_id</code>
              ）の両方をサポートします。
            </p>
          </>
        ) : (
          <Stack spacing={1.5}>
            {GLOSSARY_TERMS.map(({ term, body }) => (
              <div key={term}>
                <strong>{term}</strong>
                <p style={{ margin: '2px 0 0' }}>{body}</p>
              </div>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>閉じる</Button>
      </DialogActions>
    </Dialog>
  );
}
