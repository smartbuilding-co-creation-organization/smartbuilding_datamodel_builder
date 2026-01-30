# AGENTS.md

## 0. 本ドキュメントと plans.md の関係（重要）
- MUST AGENTS.md は「不変のルール・品質基準」を定義する。
- MUST plans.md は「現在進行中および次に行う作業計画」を定義する。
- MUST エージェントは plans.md に記載されているタスクのみを実行対象とする。
- MUST plans.md に記載のない作業を行う場合は、先に plans.md を更新する。
- SHOULD plans.md の更新（タスク完了・追加・優先度変更）は、PR に含めるか明示的に提案する。

## 1. リポジトリの目的
- MUST このリポジトリは「CSV → Tree → DataGrid 編集 → 保存」を一貫して扱うビルディングモデル編集基盤を提供する。
- MUST UI は `apps/web`（Vite + React + TypeScript + MUI TreeView/DataGrid）で構成する。
- MUST コア処理（CSV パース / Tree 構築 / バリデーション / エクスポート）は `packages/core` に集約する。
- MUST E2E（Playwright）で主要な編集フローの回帰を担保する。

## 2. ルール（エージェントの行動規範）
- MUST 作業開始前に以下を必ず読む。
  - README.md
  - AGENTS.md
  - plans.md（該当マイルストーン・タスク）
- MUST 小さな差分で進める（1 PR = 1 意図）。
- MUST plans.md に定義された「目的・受入基準」を満たすことを最優先する。
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

- SHOULD plans.md のマイルストーン完了時にはフルセットを通す。

## 4. テスト規約
- MUST unit（`packages/core`）を最優先で整備する。
- SHOULD 仕様変更は unit の期待値を先に更新する。
- MUST plans.md に記載された受入基準は、unit または E2E のいずれかで必ず検証されること。
- MUST E2E は `data-testid` を中心に安定セレクタを使う。
  - MUST `data-testid` を UI 側に付与し、テストで CSS/構造依存を避ける。
  - SHOULD Playwright は `locator` + `expect` の待機を基本にする。

## 5. 作業フロー
- MUST plans.md から対象タスクを選択して着手する。
- MUST タスクの「目的・受入基準・対象パス」を明確にしてから実装する。
- SHOULD ブランチ命名は以下の形式を推奨する。
  - `feat/<short-topic>` / `fix/<short-topic>` / `chore/<short-topic>`
- MUST 実装 → テスト → コミット → PR 説明の順で進める。
- MUST PR 説明に以下を含める。
  - 対応した plans.md のタスクID or セクション
  - 目的 / 変更点 / 影響範囲 / 実行テスト
- SHOULD タスク完了時に plans.md の該当項目を更新（Done/Completed 等）。

## 6. コミット規約
- SHOULD Conventional Commits を使用する。
  - 例: `feat(core): add referential integrity checks`
  - 例: `test(e2e): stabilize grid edit flow`
  - 例: `chore: update fixtures`
- MUST 変更内容が分かる短い要約にする。

## 7. ドキュメント規約
- MUST 仕様変更がある場合は README と CSV 仕様（存在する場合は該当ドキュメント）を更新する。
- SHOULD plans.md の前提やスコープが変わる場合は、plans.md も同時に更新する。
- SHOULD 画面操作や入力仕様が変わる場合は、E2E の説明やスクリーンショットの更新を検討する。

## 8. 既知の落とし穴（技術特性）
- MUST MUI DataGrid の編集イベントは `onCellEditStart/Stop` と `processRowUpdate` の挙動差に注意する。
- MUST Tree 再構築時に選択状態・展開状態が失われないようにする。
- MUST CSV の未知列を破壊せず保持する（列順と値を維持）。
- SHOULD Playwright の待機は `locator` と `expect` を中心にし、`waitForTimeout` を避ける。

## 9. エージェントへの依頼テンプレ
- MUST 依頼者は以下を埋める。
  - 対応する plans.md のタスク / マイルストーン:
  - 目的:
  - スコープ（対象機能・対象パス）:
  - 非目標（やらないこと）:
  - 受入基準（plans.md から引用 or 明示）:
  - テスト要件（unit/e2e/省略可の理由）:

## 10. セキュリティと秘密情報
- MUST `.env` や個人情報をコミットしない。
- MUST fixture に個人データを入れない（実在情報や機微データは禁止）。
- SHOULD 機密に関わるログ出力は抑制し、必要時はマスキングする。
