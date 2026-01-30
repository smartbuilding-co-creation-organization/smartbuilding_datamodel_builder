# plans.md

## 1. スコープ
- MVPでやること
  - [ ] CSV を読み込み、Tree と DataGrid に同期表示する
  - [ ] DataGrid で編集でき、検証結果が UI に反映される
  - [ ] `schema/` 配下の OWL を参照し、オントロジーに従った RDF を出力できる
  - [ ] YAML 形式での出力（RDF を YAML 表現に変換/保存）ができる
  - [ ] unit（vitest）と e2e（playwright）の最小セットが通る
- Non-goals（MVPでやらないこと）
  - [ ] ドラッグ&ドロップでの親子関係変更
  - [ ] 高度なスキーマ管理（JSON Schema/LinkML）
  - [ ] ネイティブアプリ化（Tauri）
  - [ ] IFC/DTDL など外部フォーマットへのエクスポート

## 2. 成果物（Deliverables）
- [ ] UI（2ペイン: Tree + DataGrid）
- [ ] CSV 入力（読み込み）
- [ ] Tree 連動（選択/展開とグリッド同期）
- [ ] 編集（行/セル更新）
- [ ] 検証（zod + 参照整合）
- [ ] RDF 出力（OWL オントロジー準拠）
- [ ] YAML 出力（RDF 由来の構造化出力）
- [ ] unit/E2E テスト（最小シナリオ）

## 3. マイルストーン（M0〜M3）

### M0: リポジトリ健全性
- Definition of Done
  - [ ] `pnpm lint` が通る
  - [ ] `pnpm typecheck` が通る
  - [ ] `pnpm test` が通る
  - [ ] `pnpm test:e2e` が通る
  - [ ] 最低限の画面が表示できる（アプリ起動で白画面にならない）

### M1: CSV読み込み → Tree/表表示
- Definition of Done
  - [ ] CSV を読み込むと Tree と DataGrid に同じデータが表示される
  - [ ] Tree の選択が DataGrid の選択状態に反映される
  - [ ] 既知列/未知列が保持されている
  - [ ] unit で CSV パースと Tree 構築の主要ケースが通る

### M2: 編集 → 検証 → RDF/YAML 出力
- Definition of Done
  - [ ] DataGrid で編集した値が state に反映される
  - [ ] 検証エラーが UI で確認できる（少なくとも 1 箇所）
  - [ ] OWL オントロジーに従った RDF がダウンロードできる
  - [ ] RDF と整合する YAML がダウンロードできる
  - [ ] E2E で「編集→RDF 出力」フローが 1 本以上通る

### M3: 使い勝手（検索、エラーUX、パフォーマンス）
- Definition of Done
  - [ ] Tree/グリッドに検索機能がある（最小）
  - [ ] エラーが視認できる UX（ハイライト/サマリ）
  - [ ] 大規模 CSV での基本操作が 2 秒以内に応答する（体感）
  - [ ] E2E の待機が `locator/expect` ベースで安定している

## 4. タスクバックログ（優先順）

1) リポジトリの起動確認
- 目的: 既存の起動導線を確認し、作業の前提を固める
- 変更対象（パス）: 変更なし
- 受入基準:
  - [ ] `pnpm dev` でアプリが起動する
  - [ ] ブラウザで初期画面が表示される
- 実行すべきコマンド（最低限）: `pnpm dev`

2) OWL の確認（オントロジー把握）
- 目的: 出力対象となるオントロジーの主要クラス/プロパティを把握する
- 変更対象（パス）: `schema/` 配下（例: `schema/building_model.owl.ttl`）
- 受入基準:
  - [ ] 主要クラスと必須プロパティが一覧化できる
- 実行すべきコマンド（最低限）: 省略可

3) Core の CSV パース入口の確認
- 目的: CSV のパースとデータ構造の基点を把握する
- 変更対象（パス）: `packages/core/src/index.ts`
- 受入基準:
  - [ ] 主要エクスポートが理解できるコメント/README がある
  - [ ] unit テストの対象が特定できる
- 実行すべきコマンド（最低限）: `pnpm test`

4) fixtures の内容精査
- 目的: テスト CSV の列構成と未知列の有無を把握する
- 変更対象（パス）: `packages/fixtures`
- 受入基準:
  - [ ] 主要 fixture の列一覧が確認できる
- 実行すべきコマンド（最低限）: `pnpm test`

5) CSV 読み込みの UI 入口を確認
- 目的: UI 側の読み込み経路を理解する
- 変更対象（パス）: `apps/web/src/App.tsx`
- 受入基準:
  - [ ] 読み込みアクションの入口が把握できる
- 実行すべきコマンド（最低限）: `pnpm dev`

6) Tree 表示の最小確認
- 目的: Tree が CSV に基づいて描画されることを担保
- 変更対象（パス）: `apps/web/src/App.tsx`, `apps/web/src/state/store.ts`
- 受入基準:
  - [ ] CSV 読み込み後に Tree にノードが表示される
  - [ ] 空 CSV でクラッシュしない
- 実行すべきコマンド（最低限）: `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e`

7) DataGrid 表示の最小確認
- 目的: DataGrid が CSV に基づいて描画されることを担保
- 変更対象（パス）: `apps/web/src/App.tsx`
- 受入基準:
  - [ ] CSV 読み込み後に行と列が表示される
  - [ ] 未知列が列として表示される
- 実行すべきコマンド（最低限）: `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e`

8) Tree 選択と DataGrid 同期
- 目的: Tree 選択がグリッド選択/フィルタに反映される
- 変更対象（パス）: `apps/web/src/App.tsx`, `apps/web/src/state/store.ts`
- 受入基準:
  - [ ] Tree のノード選択で DataGrid の行が絞り込まれる
- 実行すべきコマンド（最低限）: `pnpm test:e2e`

9) CSV 未知列の保持確認（core）
- 目的: CSV の未知列が破壊されないことを保証
- 変更対象（パス）: `packages/core/src`, `packages/core/test/core.test.ts`
- 受入基準:
  - [ ] 未知列を含む CSV がラウンドトリップで保持される
- 実行すべきコマンド（最低限）: `pnpm test`

10) Validation の最小ケース追加
- 目的: バリデーション（zod + 参照整合）の最小例を固定
- 変更対象（パス）: `packages/core/src`, `packages/core/test/core.test.ts`
- 受入基準:
  - [ ] 不正な参照でエラーが返る
  - [ ] 正常ケースが通る
- 実行すべきコマンド（最低限）: `pnpm test`

11) オントロジー対応のマッピング設計
- 目的: CSV/Tree モデルから OWL へのマッピング方針を定義する
- 変更対象（パス）: `schema/`, `README.md`（または設計メモ）
- 受入基準:
  - [ ] クラス/プロパティ対応表が明文化される
- 実行すべきコマンド（最低限）: MAY 省略（理由記載）

12) RDF 生成の最小実装（core）
- 目的: OWL に従った RDF を生成できるようにする
- 変更対象（パス）: `packages/core/src`
- 受入基準:
  - [ ] 代表 fixture から RDF が生成される
- 実行すべきコマンド（最低限）: `pnpm test`

13) RDF シリアライズ形式の決定
- 目的: 出力形式（Turtle/JSON-LD など）を決める
- 変更対象（パス）: `README.md`, `packages/core/src`
- 受入基準:
  - [ ] 出力形式と拡張子が明記される
- 実行すべきコマンド（最低限）: MAY 省略（理由記載）

14) YAML 出力の最小実装
- 目的: RDF と整合する YAML を生成する
- 変更対象（パス）: `packages/core/src`
- 受入基準:
  - [ ] RDF と内容が一致する YAML が生成される
- 実行すべきコマンド（最低限）: `pnpm test`

15) UI での検証結果表示（最小）
- 目的: 検証結果が UI で確認できる
- 変更対象（パス）: `apps/web/src/App.tsx`, `apps/web/src/state/store.ts`
- 受入基準:
  - [ ] エラー数が画面に表示される
  - [ ] 1 つ以上のエラー詳細が確認できる
- 実行すべきコマンド（最低限）: `pnpm test:e2e`

16) DataGrid 編集 → state 反映
- 目的: 編集した値が state に反映される
- 変更対象（パス）: `apps/web/src/App.tsx`, `apps/web/src/state/store.ts`
- 受入基準:
  - [ ] セル編集後、再描画しても値が保持される
- 実行すべきコマンド（最低限）: `pnpm test:e2e`

17) DataGrid 編集 → RDF/YAML 反映
- 目的: 編集結果が RDF/YAML 出力に含まれる
- 変更対象（パス）: `packages/core/src`, `apps/web/src/App.tsx`
- 受入基準:
  - [ ] 変更した値が RDF と YAML 出力に含まれる
- 実行すべきコマンド（最低限）: `pnpm test`, `pnpm test:e2e`

18) RDF 出力（ダウンロード）
- 目的: UI から RDF を保存できる
- 変更対象（パス）: `apps/web/src/App.tsx`
- 受入基準:
  - [ ] 保存操作で RDF がダウンロードされる
- 実行すべきコマンド（最低限）: `pnpm test:e2e`

19) YAML 出力（ダウンロード）
- 目的: UI から YAML を保存できる
- 変更対象（パス）: `apps/web/src/App.tsx`
- 受入基準:
  - [ ] 保存操作で YAML がダウンロードされる
- 実行すべきコマンド（最低限）: `pnpm test:e2e`

20) Playwright: 読み込み E2E 追加
- 目的: 読み込みの回帰を防ぐ
- 変更対象（パス）: `apps/web/e2e/app.spec.ts`
- 受入基準:
  - [ ] CSV 読み込み後に Tree と DataGrid が表示される
- 実行すべきコマンド（最低限）: `pnpm test:e2e`

21) Playwright: 編集 → RDF 出力 E2E 追加
- 目的: 編集フローの回帰を防ぐ
- 変更対象（パス）: `apps/web/e2e/app.spec.ts`
- 受入基準:
  - [ ] DataGrid を編集し、RDF 出力まで完了する
- 実行すべきコマンド（最低限）: `pnpm test:e2e`

22) Playwright: 編集 → YAML 出力 E2E 追加
- 目的: 編集フローの回帰を防ぐ
- 変更対象（パス）: `apps/web/e2e/app.spec.ts`
- 受入基準:
  - [ ] DataGrid を編集し、YAML 出力まで完了する
- 実行すべきコマンド（最低限）: `pnpm test:e2e`

23) E2E 安定化（data-testid 付与）
- 目的: セレクタ依存による不安定化を回避
- 変更対象（パス）: `apps/web/src/App.tsx`, `apps/web/e2e/app.spec.ts`
- 受入基準:
  - [ ] E2E の主要要素が `data-testid` で参照できる
- 実行すべきコマンド（最低限）: `pnpm test:e2e`

24) Tree 選択保持の回帰テスト
- 目的: 再構築時に選択状態が失われないことを担保
- 変更対象（パス）: `apps/web/e2e/app.spec.ts`
- 受入基準:
  - [ ] CSV 再読み込み後も選択状態が維持される
- 実行すべきコマンド（最低限）: `pnpm test:e2e`

25) 大規模 CSV の単体ベンチ（簡易）
- 目的: パフォーマンス劣化の早期検知
- 変更対象（パス）: `packages/core/test/core.test.ts`, `packages/fixtures`
- 受入基準:
  - [ ] 大規模 CSV のパースがタイムアウトしない
- 実行すべきコマンド（最低限）: `pnpm test`

26) エラー UX の最小改善
- 目的: エラー位置が分かる UI を用意する
- 変更対象（パス）: `apps/web/src/App.tsx`
- 受入基準:
  - [ ] エラーのある行が視覚的に分かる
- 実行すべきコマンド（最低限）: `pnpm test:e2e`

27) 検索（Tree/グリッドどちらか）
- 目的: 最小の検索体験を提供する
- 変更対象（パス）: `apps/web/src/App.tsx`
- 受入基準:
  - [ ] キーワード入力で該当行が絞り込まれる
- 実行すべきコマンド（最低限）: `pnpm test:e2e`

28) RDF/YAML 仕様のドキュメント整備
- 目的: 出力形式と語彙が明確になる
- 変更対象（パス）: `README.md` または `schema/` 配下
- 受入基準:
  - [ ] 主要クラス/プロパティと出力例が記載されている
- 実行すべきコマンド（最低限）: MAY 省略（理由記載）

29) fixture 更新時のルール明文化
- 目的: テストデータの品質を維持する
- 変更対象（パス）: `packages/fixtures/README.md`（なければ作成）
- 受入基準:
  - [ ] fixture の更新方法が記載されている
- 実行すべきコマンド（最低限）: `pnpm test`

30) E2E の待機改善
- 目的: 不安定な待機を除去
- 変更対象（パス）: `apps/web/e2e/app.spec.ts`
- 受入基準:
  - [ ] `waitForTimeout` を使っていない
  - [ ] `locator/expect` ベースで安定している
- 実行すべきコマンド（最低限）: `pnpm test:e2e`

## 5. リスクと軽減策
- DataGrid 編集の罠
  - [ ] `processRowUpdate` と編集イベントの差分を把握する
  - [ ] 編集後の state 反映を unit/E2E で固定する
- 大規模 CSV の性能
  - [ ] パースと Tree 構築を分離し、必要なら遅延/バッチ化する
  - [ ] 代表サイズの fixture を追加して簡易ベンチを持つ
- RDF/OWL の不整合
  - [ ] OWL のクラス/プロパティと CSV 列の対応表を維持する
  - [ ] 生成 RDF の最小バリデーション（必須プロパティの有無）を unit で固定する
- E2E の不安定化（selector/待機）
  - [ ] `data-testid` を必須化
  - [ ] `locator/expect` で待機する

## 6. 将来拡張（Backlog: Future）
- [ ] drag&drop で親変更
- [ ] schema（JSON Schema/LinkML）連携
- [ ] Tauri 化
- [ ] IFC/DTDL/RDF 以外の外部フォーマットへのエクスポート
