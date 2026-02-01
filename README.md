# Building Model CSV Explorer

CSVを読み込み、空間・デバイスの階層構造をツリー表示し、選択ノードに応じてDataGridで編集できるPoCです。CSVはブラウザ内で読み込み・書き出しし、E2EはPlaywrightで検証します。

## セットアップ

```bash
pnpm install
```

pnpmを選択した理由: ワークスペース管理が軽量で高速、モノレポの依存関係解決が簡潔なため。

## 起動（dev）

```bash
pnpm dev
```

## Unit test（vitest）

```bash
pnpm test
```

## E2E test（playwright）

### 前提（Playwright ブラウザの導入）

初回実行時は Playwright のブラウザをインストールしてください。

```bash
pnpm playwright:install
```

Linux 環境でホスト依存が不足する場合は、システムライブラリのインストールが必要です（sudo 権限が必要）。

```bash
# sudo 環境で PATH を保持して実行
sudo -E pnpm playwright:install-deps

# または npx 経由で実行（推奨）
cd apps/web
npx playwright install-deps
```

**注意**: `sudo pnpm` で「command not found」エラーが出る場合は、上記の `sudo -E` または `npx` を使ってください。

apps/web 直下で実行する場合は次も使えます。

```bash
pnpm -C apps/web playwright:install
cd apps/web && npx playwright install-deps
```

### 実行

```bash
pnpm test:e2e
```

## Lint / Format / Typecheck

```bash
pnpm lint
pnpm format
pnpm typecheck
```

## ディレクトリ構成

```
apps/
  web/               # Vite + React UI
packages/
  core/              # CSVパース、ツリー構築、バリデーション
  fixtures/          # CSVフィクスチャ
schema/              # 参照用スキーマ
pointlist.md         # 参照用ポイントリスト
```

## CSV仕様（pointlist.md準拠）

- ヘッダ行あり（snake_case）
- 1行 = 1ポイント
- 必須列（pointlist.mdの○）
  - `gateway_id`
  - `point_id`
  - `point_name`
  - `point_type`
  - `point_specification`
  - `writable`
  - `device_id`
  - `device_name`
  - `device_type`
  - `site`
  - `building`
  - `floor`
  - `installation_area`
  - `local_id`
- 任意列（pointlist.md記載）
  - `interval` / `unit` / `max_pres_value` / `min_pres_value`
  - `labels` / `scale` / `tags`
  - `target_area` / `panel`
  - `supplier` / `owner` / `description`
  - `device_id_bacnet` / `instance_no_bacnet` / `object_type_bacnet`
- 追加列があっても保持・編集可能（動的列で表示）

## 実装メモ

- `packages/core` がCSVのパース/エクスポート、ツリー構築、バリデーションを担当します。
- ツリーは `parent_id` に基づいて構築し、UIはルート配下のTree Viewを表示します。
- DataGridはCSVヘッダから動的に列を構成し、セル編集結果はzustandで保持します。
- バリデーションエラーは右上に集計表示し、該当セルは赤系ハイライトで表示します。
- `packages/fixtures` のCSVは `pointlist.md` の項目に準拠した検証用データです。

## 今後の拡張ポイント

- ツリーのドラッグ&ドロップ並び替え
- JSON Schemaや外部定義に基づく詳細バリデーション
- CSV以外の入出力（Excel / API連携）
- Tauri化によるデスクトップアプリ化
- 大規模データ向け仮想化・遅延読み込み
