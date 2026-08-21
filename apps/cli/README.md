# @repo/cli

`apps/web` の UI を使わずに、CSV ファイルを `packages/core` の出力プラグインでフォーマット変換するためのコマンドラインツール。CSV パース・バリデーション・各フォーマットへのシリアライズは `@repo/core` をそのまま利用しており、このパッケージ自体は引数解析とファイル入出力の配線のみを行う。

## 使い方

リポジトリルートから:

```sh
pnpm cli -- --input <csv> --format <format> [--serializer <name>] [--out <path>] [--allow-issues]
pnpm cli -- --list-formats
```

- `--input <path>`: 入力CSVファイル（必須。`--list-formats` 指定時は不要）。CSVの列仕様は `pointlist.md` を参照。
- `--format <name>`: 出力フォーマット。`CSV` / `JSON` / `JSON-LD` / `RDF` / `YAML` / `DTDL` / `WoT` のいずれか。
- `--serializer <name>`: `DTDL`（`Interfaces` / `Twin Graph`）や `WoT`（`Thing Description` / `Thing Model`）のように同一フォーマットに複数のシリアライザがある場合に指定する。省略時、一意に定まらなければエラーになり選択肢が表示される。
- `--out <path>`: 出力ファイルパス。省略時は標準出力に書き出す。
- `--allow-issues`: RDF/YAML/WoT 出力で SHACL/スキーマ違反（blocking issue）があっても書き込みを続行する。省略時は違反があると書き込みをブロックし、終了コード `1` を返す（`apps/web` の「violation があればダウンロードしない」挙動と同じ）。
- `--list-formats`: 利用可能な `--format`/`--serializer` の組み合わせを一覧表示して終了する。

CSVの構造的な検証結果（重複ID、親参照不整合など）は常に標準エラー出力に警告として表示される（書き込みはブロックしない）。

### 例

```sh
# サンプルCSVをTurtle(RDF)に変換してファイルへ出力
pnpm cli -- --input sample/debug-sample.csv --format RDF --serializer Turtle --out out.ttl

# YAMLに変換して標準出力へ
pnpm cli -- --input sample/debug-sample.csv --format YAML

# 利用可能なフォーマット一覧
pnpm cli -- --list-formats
```

### 終了コード

- `0`: 成功
- `1`: 出力側のブロッキング検証（SHACL violation 等）で書き込みを中止
- `2`: 引数不正、入力ファイル読み込み失敗、CSVパースエラーなど

## 開発

```sh
pnpm --filter @repo/cli lint
pnpm --filter @repo/cli typecheck
pnpm --filter @repo/cli test
```
