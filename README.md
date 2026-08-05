# Building Model CSV Explorer

Building Model CSV Explorer は、設備ポイントリストを「CSV 読み込み → 階層 Tree → DataGrid 参照・編集 → 検証 → 保存」まで一貫して扱う静的 Web アプリケーションです。

[GitHub Pages デモ](https://smartbuilding-co-creation-organization.github.io/smartbuilding_datamodel_builder/)

入力ファイルと編集内容はブラウザ内だけで処理され、サーバーへ送信されません。GitHub Pages はビルド済みファイルを静的配信するだけです。Google Fonts、CDN、分析サービスなどへの実行時通信はありません。

## 主な機能

- CSV から Site / Building / Level / Room / Equipment / Point の階層を構築
- MUI TreeView と仮想化 DataGrid による全列表示、検索、選択連動
- 選択 Resource のプロパティ編集と、再構築後の選択・展開状態の維持
- 必須項目・参照整合性・SHACL Core・WoT JSON Schema の検証
- CSV、Tree JSON、JSON-LD、RDF Turtle、YAML、DTDL、WoT TD/TM の出力
- デバイステンプレートの生成・比較・編集・YAML/ZIP 出力

## CSV 仕様

CSV は UTF-8、ヘッダーあり、1 行 1 point を前提とします。詳細な列定義は [pointlist.md](pointlist.md)、オントロジーとの対応は [schema/mapping.md](schema/mapping.md) を参照してください。

主要な必須列は `gateway_id`、`point_id`、`point_name`、`point_type`、`point_specification`、`writable`、`device_id`、`device_name`、`device_type`、`site`、`building`、`floor`、`installation_area`、`local_id` です。

未知列は、CSV の元ヘッダー名・列順・値を保持します。RDF では元ヘッダーを UTF-8 percent-encode した `https://www.sbco.or.jp/ont/property/` 配下の predicate IRI に決定的に写像します。CSV 出力では `=`、`+`、`-`、`@`、tab、CR で始まるセルを spreadsheet formula として実行されない形式へ変換します。

### 入力上限

| 対象 | 上限 |
| --- | ---: |
| ファイル | 5 MiB |
| データ行 | 20,000 行 |
| 列 | 100 列 |
| 1 セル | 32 KiB（UTF-8） |

上限超過や解析失敗時は既存の画面 state を変更せず、原因と上限を画面に表示します。

## 検証と出力

通常の編集時には schema と参照整合性を検証します。RDF と YAML の出力時には、同じ統合 Resource model から RDF graph を生成し、`schema/building_model.shacl.ttl` を `rdf-validate-shacl` で検証します。Issue には severity、focus node、result path、constraint component、message が含まれます。

`violation` がある場合はダウンロードしません。`warning` と `info` だけの場合は出力できます。serializer が例外を返した場合も、代替内容を作らずエラーを表示して終了します。

出力 API は非同期です。

```ts
const result = await runOutputPlugin('RDF', 'Turtle', {
  rows,
  modelRows,
  schema,
  shacl: { shapeText },
});
```

同期戻り値を前提にしていた内部利用コードは、`await` または Promise chain へ移行してください。

## ローカル開発

Node.js 22 と pnpm 9.15.9 を使用します。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Playwright 管理 Chromium は初回に導入してください。CI では OS 依存も同時に導入します。

```bash
pnpm playwright:install
# Linux CI または依存ライブラリも必要な環境
pnpm playwright:install-deps
pnpm test:e2e
```

production build は `/smartbuilding_datamodel_builder/` を base path とし、E2E も production preview をこの subpath で検証します。development server の base path は `/` です。

## 品質ゲート

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm audit --audit-level high
gitleaks detect --source . --redact --log-opts=--all
```

## 対応環境と制約

最新版および一つ前の安定版 Chrome / Edge / Firefox / Safari を対象とします。自動 E2E は Chromium で実行します。

- npm package としての公開、サーバー保存、共同編集には対応しません。
- 20,000 行を超えるデータ、Excel ファイル、ドラッグ&ドロップによる階層変更には対応しません。
- 未知列の意味検証は行いません。RDF では安全な custom predicate として保持します。
- 出力先システム固有の制約は、各システムへの import 前にも確認してください。

## プロジェクト構成

```text
apps/web/          Vite + React + MUI + Zustand UI / Playwright E2E
packages/core/     CSV、Tree、検証、Resource model、serializer、output plugin
packages/fixtures/ 再利用可能な匿名テスト CSV
schema/            JSON Schema、OWL、SHACL、mapping 文書
```

## セキュリティ、コントリビューション、ライセンス

脆弱性は公開 Issue に書かず、[SECURITY.md](SECURITY.md) の非公開窓口へ報告してください。変更提案は [CONTRIBUTING.md](CONTRIBUTING.md) と [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) に従ってください。

Apache License 2.0 で提供します。Copyright 2026 Smart Building Co-Creation Organization. 詳細は [LICENSE](LICENSE)、[NOTICE](NOTICE)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
