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
- Linux では unavailable path の実測と案内文更新を完了し、
  `libsecret-1.so.0` 不在時に exit `4` で失敗することを確認済みである。
- Linux では Ubuntu 24.04.1 LTS on WSL2 上で、`libsecret`、`gnome-keyring`、
  login collection を初期化した isolated D-Bus session により、
  実 OS ストア smoke の成功結果も確認済みである。
- macOS では 2026-06-27 に current development environment 上で、
  `npm run test:real-store-smoke` による login keychain への
  `set/get/list/remove` 成功結果を確認済みである。
- Linux / WSL の環境前提と確認手順は [linux-secret-service.md](../linux-secret-service.md) に集約した。
- GitHub-hosted runner 上の `darwin` / `win32` real-store smoke を
  [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) と
  [`.github/workflows/release-prep.yml`](../../.github/workflows/release-prep.yml)
  に追加し、通常 CI と release-prep で全対応 OS の native-store 経路を
  自動実行する構成へ移行中である。
- 残項目は、追加した hosted-runner job の最初の green run を確認し、
  branch ruleset の required checks を更新したうえで、
  リリース候補ごとの直前確認記録を更新することである。

## 3. フェーズ別計画と進捗

| Phase | 内容                                       | 状態     | 補足                                                                                                                 |
| ----- | ------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------- |
| 1     | TypeScript / ESM / Vitest / npm の実装基盤 | 完了     | `package.json`、`tsconfig.json`、`vitest.config.ts`、CLI entry を作成済み                                            |
| 2     | Secret Store 選定スパイク                  | 完了     | 初回リリース向けに `keytar` 採用を決定済み。実 OS スモーク結果の収集は検証フェーズで継続する                         |
| 3     | config / ID / ルート探索の純粋ロジック     | 完了     | `.dotenvx-keychain` 読み書き、ID 検証、自動生成、親探索を実装済み                                                    |
| 4     | CLI runtime 共通部                         | 完了     | 引数解析、dispatcher、終了コード、Windows シェル判定ロジックを実装済み                                               |
| 5     | Secret Store 抽象とバックエンド            | 完了     | interface、factory、mock backend、`keytar` backend を実装済み                                                        |
| 6     | `dotenvx` resolver / adapter               | 完了     | 同梱依存の解決と `keypair DOTENV_PRIVATE_KEY` 読み取りを実装済み                                                     |
| 7     | `init` 統合                                | 完了     | 鍵ソース優先順位、rollback、`.env.keys` cleanup、exit code を実装済み                                                |
| 8     | `run` 統合                                 | 完了     | pre-injection bypass、config 解決、auto ID fallback、子終了コード伝播を実装済み                                      |
| 9     | `list` / `remove`                          | 完了     | 昇順列挙、完全一致削除、not-found の exit `3` を実装済み                                                             |
| 10    | エラー / セキュリティ整備                  | 完了     | 秘密値非表示、短いメッセージ、主要 exit code、秘密値非露出の回帰テストを整備済み                                     |
| 11    | 検証と配布確認                             | 完了     | モック自動テスト、packaged CLI smoke、Windows / Linux / `darwin` での real-store smoke 結果収集まで完了            |

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
  設定ファイル、自動 ID 生成、`init` / `run` 向けの ID 解決・親探索のテストを追加済み。
  ID バリデーションは設定読み取り異常系と `remove` の異常系で確認している。
- `test/cli/`:
  引数解析の単体テストを追加済み。
- `test/secretStore/`:
  mock backend と `keytar` adapter の単体テストを追加済み。
- `test/commands/`:
  `init`、`run`、`list`、`remove` の結合テストと、
  秘密値が stdout / stderr に出ないことを確認する回帰テストを追加済み。
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
- `vitest run test/commands/init.test.ts test/commands/run.test.ts`:
  2026-06-24 時点で 13 tests が通過し、`secret-store`、親環境、
  ローカル `dotenvx` 読み取りの各経路で秘密値非露出を回帰確認した。
- Linux unavailable path:
  2026-06-24 に Ubuntu 24.04.1 LTS on WSL2 上で、`npm run test:real-store-smoke` は
  `libsecret-1.so.0` 不在により `Failed to load the native secret store backend.` で失敗した。
  同日に `node dist/index.js ls` と、親環境に `DOTENV_PRIVATE_KEY` を与えた
  `node dist/index.js init` を確認し、どちらも exit `4` で
  Linux 向けの復旧案内を返し、秘密値非露出かつ `.dotenvx-keychain` 未作成で失敗することを確認した。
- Linux real-store success path:
  2026-06-24 に Ubuntu 24.04.1 LTS on WSL2 上で、`libsecret-1.so.0` と
  `gnome-keyring` 導入後、ambient user session の既定 collection は壊れた alias 状態のまま
  `Object does not exist at path "/org/freedesktop/secrets/collection/login"` で失敗した。
  一方で isolated `dbus-run-session` と一時 HOME を使い、
  `gnome-keyring-daemon --login` と
  `gnome-keyring-daemon --start --components=secrets` で login collection を初期化した session では、
  `secret-tool` の store / lookup / clear と
  `npm run test:real-store-smoke` の `set/get/list/remove` が通過した。
- macOS real-store success path:
  2026-06-27 に current development environment 上で、
  Node.js 20.20.2 を使って `npm run test:real-store-smoke` を実行し、
  login keychain に対する `set/get/list/remove` の最小スモークが通過した。

## 6. 未完了と残項目

### 6.1 初回リリース前の残項目

- `win32` は 2026-06-12 時点で通過確認済みである。
- `darwin` は 2026-06-27 時点で通過確認済みである。
- `linux` は 2026-06-24 時点で unavailable path と、isolated D-Bus session での
  success path の両方を確認済みである。
- 残りは、追加した macOS / Windows hosted-runner smoke job の最初の成功を確認し、
  `develop` / `main` の branch ruleset に required check を追加したうえで、
  リリース候補に対する直前確認記録を更新することである。

## 7. 決定済み方針

### 7.1 real-store smoke の運用方針

- `linux` は専用 helper script により GitHub-hosted Ubuntu 上で継続実行する。
- `darwin` と `win32` も GitHub-hosted runner 上で
  `npm run test:real-store-smoke` を継続実行し、
  supported OS の native-store 契約確認を PR CI と release-prep に含める。
- Linux の Secret Service 利用不可ケースは、
  平文フォールバック禁止を維持したまま README に前提条件と復旧手順を記載し、
  専用 helper job で扱う。

### 7.2 Secret Store 採用方針

- 初回リリースに向けては `keytar` を採用して進める。
- Linux の前提条件や OS ごとの既知制約は README と実装メモで継続管理する。
- 実 OS スモークの結果収集は検証フェーズの課題であり、
  Secret Store 採用判断そのものの未完了事項とは分けて扱う。
- 実運用上の問題が出る場合は、`SecretStore` 抽象の内側だけを
  差し替える前提で再評価する。

## 8. 初回リリースまでの残タスク

### 8.1 初回リリース前に完了したい項目

1. 追加した `macos-real-store-smoke` と `windows-real-store-smoke` の
  最初の GitHub-hosted runner 成功を確認する。
2. `develop` / `main` の branch ruleset に
  `macos-real-store-smoke` と `windows-real-store-smoke` を追加する。
3. リリース候補に対して、`npm run format:check`、`npm run lint`、
  `npm run typecheck`、`npm test`、`npm run build`、`npm run pack:smoke` を実行する。
4. リリース作業を行う OS では、必要に応じて
  `npm run test:real-store-smoke` も再実行し、直前確認を残す。

### 8.2 初回リリース判断の目安

- `win32`、`darwin`、`linux` の少なくとも 1 回分の real-store smoke 結果が揃っている。
- README だけで、初回利用者が `init` から `run` まで辿れる。
- tarball install 後も `dotenvx-keychain` と `dxk` の両方が起動し、
  同梱 `dotenvx` 解決が維持されている。
- Linux の Secret Service / `libsecret` 利用不可ケースの扱いが、
  README、`linux-secret-service.md`、または運用メモで明示されている。
- PR CI と `release-prep` の両方で、全対応 OS の native-store 確認が実行される。
- `develop` / `main` の required status checks に
  `macos-real-store-smoke` と `windows-real-store-smoke` が追加されている。

## 9. 初回リリース後の将来検討項目

- GitHub Actions の reusable workflow 化や重複削減。
- ネイティブ依存の配布・保守性に関する懸念は、初回リリース後も継続して確認する。
- `keytar` の保守継続性と、Node.js / OS 更新に対する追従状況の定期確認。
- `darwin` / `linux` の real-store smoke や配布時トラブルが出た場合の、
  代替 backend 候補の再評価。
- ルールセット制約、CODEOWNERS、レビュー要件の強化。
