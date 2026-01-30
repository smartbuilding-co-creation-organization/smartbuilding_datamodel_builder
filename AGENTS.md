# AGENTS.md

## 1. リポジトリの目的
- MUST このリポジトリは「CSV → Tree → DataGrid 編集 → 保存」を一貫して扱うビルディングモデル編集基盤を提供する。
- MUST UI は `apps/web`（Vite + React + TypeScript + MUI TreeView/DataGrid）で構成する。
- MUST コア処理（CSV パース / Tree 構築 / バリデーション / エクスポート）は `packages/core` に集約する。
- MUST E2E（Playwright）で主要な編集フローの回帰を担保する。

## 2. ルール（エージェントの行動規範）
- MUST 変更前に README・スクリプト・既存構成（packages/apps/fixtures）の現状を把握する。
- MUST 小さな差分で進める（1 PR = 1 意図）。
- SHOULD 依存追加は最小限に抑え、理由と代替案を明記する。
- MUST 自動生成物の扱いを明確化する。
  - MUST 生成物（build 成果物）はコミットしない。
  - MUST lockfile（`pnpm-lock.yaml`）は依存変更時のみ更新・コミットする。
  - SHOULD フォーマット差分は最小化し、意図しない全体整形を避ける。
- MUST 既存の API と互換性を壊す場合は、理由と移行方針を PR 説明に記載する。

## 3. 品質ゲート（必須）
- MUST 以下のコマンドを通す（変更範囲に応じて最小実行）。
  - `pnpm install`
  - `pnpm lint`
  - `pnpm format`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:e2e`

### 変更範囲別の最低実行マトリクス
- MUST コード変更時は該当範囲の最小コマンドを実行する。

| 変更範囲 | 必須コマンド |
| --- | --- |
| `packages/core` のロジック・バリデーション | `pnpm lint` / `pnpm typecheck` / `pnpm test` |
| `apps/web` UI 変更（表示・操作・状態管理） | `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` |
| `packages/fixtures` 変更 | `pnpm test` / `pnpm test:e2e` |
| 設定のみ（eslint/prettier/tsconfig 等） | `pnpm lint` / `pnpm typecheck` |
| README/ドキュメントのみ | MAY 実行省略（理由を記載） |

- SHOULD フルパスの CI 相当を実行できる場合はすべて通す。

## 4. テスト規約
- MUST unit（`packages/core`）を最優先で整備する。
- SHOULD 仕様変更は unit の期待値を先に更新する。
- MUST E2E は `data-testid` を中心に安定セレクタを使う。
  - MUST `data-testid` を UI 側に付与し、テストで CSS/構造依存を避ける。
  - SHOULD Playwright は `locator` + `expect` の待機を基本にする。

## 5. 作業フロー
- MUST Issue/Task を分解し、変更範囲と影響範囲を明確化する。
- SHOULD ブランチ命名は以下の形式を推奨する。
  - `feat/<short-topic>` / `fix/<short-topic>` / `chore/<short-topic>`
- MUST 実装 → テスト → コミット → PR 説明の順で進める。
- MUST PR 説明に以下を含める。
  - 目的 / 変更点 / 影響範囲 / 実行テスト

## 6. コミット規約
- SHOULD Conventional Commits を使用する。
  - 例: `feat(core): add referential integrity checks`
  - 例: `test(e2e): stabilize grid edit flow`
  - 例: `chore: update fixtures`
- MUST 変更内容が分かる短い要約にする。

## 7. ドキュメント規約
- MUST 仕様変更がある場合は README と CSV 仕様（存在する場合は該当ドキュメント）を更新する。
- SHOULD 画面操作や入力仕様が変わる場合は、E2E の説明やスクリーンショットの更新を検討する。

## 8. 既知の落とし穴（技術特性）
- MUST MUI DataGrid の編集イベントは `onCellEditStart/Stop` と `processRowUpdate` の挙動差に注意する。
- MUST Tree 再構築時に選択状態・展開状態が失われないようにする。
- MUST CSV の未知列を破壊せず保持する（列順と値を維持）。
- SHOULD Playwright の待機は `locator` と `expect` を中心にし、`waitForTimeout` を避ける。

## 9. エージェントへの依頼テンプレ
- MUST 依頼者は以下を埋める。
  - 目的:
  - スコープ（対象機能・対象パス）:
  - 非目標（やらないこと）:
  - 受入基準（期待する動作・結果）:
  - 対象パス:
  - テスト要件（unit/e2e/省略可の理由）:

## 10. セキュリティと秘密情報
- MUST `.env` や個人情報をコミットしない。
- MUST fixture に個人データを入れない（実在情報や機微データは禁止）。
- SHOULD 機密に関わるログ出力は抑制し、必要時はマスキングする。
