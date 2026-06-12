# 実装計画と進捗

## 1. 目的

- v1 実装の全体計画を、現在の進捗と残課題つきで 1 枚にまとめる。
- 実装着手前の整理を扱う [05-implementation-readiness.md](../designs/05-implementation-readiness.md) と分けて、
  実装着手後の現状確認に使う。

## 2. 現在の要約

- v1 最小スコープである `init`、`run`、`list`、`remove` の実装はソースコード上で完了している。
- `SecretStore` 抽象、モック実装、`keytar` ベースの実装、`dotenvx` adapter、
  CLI dispatcher、設定ファイル処理、ID 解決は実装済みである。
- 検証はモック中心の自動テスト、`build`、`lint`、packaged CLI の tarball 実行スモークまで自動化済みである。
- 実 OS ストア向けの最小スモークテストも追加済みで、Windows 環境では通過を確認済みである。
- 最大の残課題は、`darwin` と `linux` でも実 OS ストア smoke の結果を揃えることと、必要なら CI へ組み込むことである。

## 3. フェーズ別計画と進捗

| Phase | 内容 | 状態 | 補足 |
| --- | --- | --- | --- |
| 1 | TypeScript / ESM / Vitest / npm の実装基盤 | 完了 | `package.json`、`tsconfig.json`、`vitest.config.ts`、CLI entry を作成済み |
| 2 | Secret Store 選定スパイク | 完了（暫定） | `keytar` を採用して実装を進めた。実 OS スモークで最終確認が必要 |
| 3 | config / ID / ルート探索の純粋ロジック | 完了 | `.dotenvx-keychain` 読み書き、ID 検証、自動生成、親探索を実装済み |
| 4 | CLI runtime 共通部 | 完了 | 引数解析、dispatcher、終了コード、Windows シェル判定ロジックを実装済み |
| 5 | Secret Store 抽象とバックエンド | 完了 | interface、factory、mock backend、`keytar` backend を実装済み |
| 6 | `dotenvx` resolver / adapter | 完了 | 同梱依存の解決と `keypair DOTENV_PRIVATE_KEY` 読み取りを実装済み |
| 7 | `init` 統合 | 完了 | 鍵ソース優先順位、rollback、`.env.keys` cleanup、exit code を実装済み |
| 8 | `run` 統合 | 完了 | pre-injection bypass、config 解決、auto ID fallback、子終了コード伝播を実装済み |
| 9 | `list` / `remove` | 完了 | 昇順列挙、完全一致削除、not-found の exit `3` を実装済み |
| 10 | エラー / セキュリティ整備 | 大枠完了 | 秘密値非表示、短いメッセージ、主要 exit code を実装済み |
| 11 | 検証と配布確認 | 一部完了 | モック自動テスト、packaged CLI smoke、Windows での real-store smoke 通過までは完了。`darwin` / `linux` での確認は未完了 |

## 4. 実装済みの主要範囲

### 4.1 基盤と共通部

- `package.json`:
  Node.js 20+、`dotenvx-keychain` / `dxk` の `bin`、`test` / `build` /
  `lint` / `pack:smoke` scripts を定義済み。
- `src/index.ts`:
  CLI entry point を実装済み。
- `src/cli/parseArgs.ts`:
  `init`、`run -- ...`、`list`、`remove` の引数契約を実装済み。
- `src/cli/dispatcher.ts`:
  各 command 実装への振り分けを実装済み。
- `src/cli/processRunner.ts`:
  共通の子プロセス起動と Windows `.cmd` / `.bat` 判定を実装済み。

### 4.2 設定ファイルと ID

- `src/config/configFile.ts`:
  `.dotenvx-keychain` の読み書きと `not-found` / `invalid-json` /
  `invalid-schema` 分類を実装済み。
- `src/config/id.ts`:
  ID バリデーションと自動 ID 生成を実装済み。
- `src/config/idResolver.ts`:
  `init` 用 ID 解決と `run` 用親探索を実装済み。

### 4.3 Secret Store

- `src/secretStore/interface.ts`:
  `SecretStore` 抽象と分類済みエラーを定義済み。
- `src/secretStore/factory.ts`:
  対応 OS 判定と backend 初期化を実装済み。
- `src/secretStore/backends/keytarStore.ts`:
  `keytar` を使う `set/get/list/remove` を実装済み。
- `src/secretStore/mock/mockSecretStore.ts`:
  テスト用モック実装を追加済み。

### 4.4 `dotenvx` 連携

- `src/dotenvx/resolver.ts`:
  同梱した `@dotenvx/dotenvx` から実行ファイルパスを解決する。
- `src/dotenvx/adapter.ts`:
  `dotenvx keypair DOTENV_PRIVATE_KEY` による既存ローカル鍵読取を実装済み。

### 4.5 コマンド

- `src/commands/init.ts`:
  OS ストア、親環境、既存ローカル鍵の優先順位、config 書込、rollback、
  `.env.keys` 削除失敗時の exit `5` を実装済み。
- `src/commands/run.ts`:
  pre-injected `DOTENV_PRIVATE_KEY` の bypass、config 解決、
  auto ID fallback、`dotenvx run -- ...` 実行を実装済み。
- `src/commands/list.ts`:
  namespace 全列挙と昇順出力を実装済み。
- `src/commands/remove.ts`:
  ID 検証、完全一致削除、not-found の exit `3` を実装済み。

### 4.6 テスト

- `test/config/`:
  設定ファイル、ID、自動生成、親探索の単体テストを追加済み。
- `test/cli/`:
  引数解析の単体テストを追加済み。
- `test/secretStore/`:
  mock backend と `keytar` adapter の単体テストを追加済み。
- `test/commands/`:
  `init`、`run`、`list`、`remove` の結合テストを追加済み。
- `test/smoke/`:
  packaged CLI の tarball 実行スモークと、実 OS ストア向け最小スモークを追加済み。

## 5. 直近の検証結果

2026-06-12 時点で、次の検証を通過している。

- `npm test`:
  8 test files、39 tests が通過。
- `npm run build`:
  TypeScript build が通過。
- `npm run lint`:
  ESLint が通過。
- `npm run pack:smoke`:
  tarball を実際に作成・一時導入し、`dotenvx-keychain` と `dxk` の両エントリで
  pre-injected key による `run` が動くことを確認できる状態にした。
- `npm run test:real-store-smoke`:
  現在の Windows 環境で、`keytar` backend に対する `set/get/list/remove` の最小スモークが通過した。

## 6. 未完了と残課題

### 6.1 実ストア確認

- `darwin`、`win32`、`linux` の各 OS で、
  実ストアを使う `set/get/list/remove` の最小スモークを実行して結果を揃える必要がある。
- `win32` は 2026-06-12 時点で通過確認済みである。
- `darwin` と `linux` は未確認である。
- Linux の Secret Service 利用不可ケースを、
  実環境または CI でどこまで自動確認するかは未確定である。

### 6.2 Secret Store 選定の最終確定

- 現在は `keytar` を前提に実装しているが、
  実 OS スモークの結果とメンテナンス面を踏まえて最終確定する必要がある。
- 実運用上の問題が出る場合は、抽象の内側だけを差し替える前提で再評価する。

## 7. 推奨する次の作業順

1. `npm run test:real-store-smoke` を `darwin` と `linux` でも実行して結果を揃える。
2. Linux の Secret Service 利用不可ケースを、手動確認に残すか CI で扱うか決める。
3. 必要なら README に CLI の使い方と既知の環境前提を追記する。
