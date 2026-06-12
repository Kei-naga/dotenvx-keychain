# 設計: `dotenvx` アダプタ

## 1. 目的

- [仕様書](../spec.md) の 7.3、7.9、8.1、8.2 を、
  `dotenvx` 呼び出し単位まで具体化する。
- `init` が既存ローカル鍵を扱う際のコマンド列と、
  後処理境界を明確にする。

## 2. 設計対象

- 同梱した `dotenvx` バイナリの呼び出し方
- `dotenvx keypair DOTENV_PRIVATE_KEY` による鍵取得
- `.env.keys` を削除してよい条件

対象外:

- OS ストアへの保存
- `.dotenvx-keychain` の読み書き
- `run` の子コマンド実行

## 3. 想定 API

`init` からは次の薄い抽象だけを呼ぶ。

```ts
type DotenvxAdapter = {
  readPrivateKey(projectRoot: string): Promise<string | null>;
};
```

責務:

- `dotenvx` 呼び出しのコマンド列をここへ閉じ込める。
- 鍵文字列は戻り値でのみ返し、標準出力・標準エラーへ流さない。

## 4. `dotenvx` 呼び出し契約

### 4.1 共通契約

- `cwd` は常に `projectRoot` とする。
- `dotenvx` バイナリは同梱依存から解決したものを使う。
- 可能な限りシェル非経由で起動する。
- 標準出力と標準エラーは既定で capture し、
  失敗時も秘密値を呼び出し側へ生で渡さない。

### 4.2 既存鍵の読取

既存の `.env.keys` または暗号化済み `.env` から
`DOTENV_PRIVATE_KEY` を取得する処理は、次のコマンドで行う。

```text
dotenvx keypair DOTENV_PRIVATE_KEY
```

契約:

- 成功時は標準出力の 1 行目を秘密鍵文字列として採用する。
- 空文字、複数値、想定外の出力しか得られない場合は失敗とする。
- `dotenvx` の追加説明文をそのままユーザーへ流さない。

## 5. `init` での鍵ソース連携

`init` は次の優先順位で鍵ソースを解決する。

1. OS ストアの既存値
2. 親プロセスの `DOTENV_PRIVATE_KEY`
3. `dotenvx keypair DOTENV_PRIVATE_KEY` で読める既存ローカル鍵

制約:

- 3 は `.env.keys` が残っている既存ローカル状態の救済として使う。
- v1 は新規鍵生成のために `dotenvx encrypt` を呼び出さない。
- 自動鍵生成を含む将来案は
  [90-future-init-key-generation.md](./90-future-init-key-generation.md) を参照する。

## 6. `.env.keys` 後処理

### 6.1 削除してよい条件

`.env.keys` は次の条件をすべて満たしたときだけ削除してよい。

1. `DOTENV_PRIVATE_KEY` が確定している
2. その鍵が OS ストアへ正常に保存されている

設定ファイル書き込みの成否は、削除可否の条件に含めない。

理由:

- OS ストア保存成功後は、`.env.keys` を残す理由がない。
- 逆に OS ストア保存前に削除すると、
  新規生成鍵の唯一の耐久コピーを失うおそれがある。

### 6.2 削除してはいけない条件

次の場合、`.env.keys` を自動削除してはならない。

- 既存ローカル鍵を `.env.keys` から読み取れたが、OS ストア保存前に失敗した

この場合の最終結果:

- コマンドは非 0 で失敗する
- 残存した `.env.keys` のパスを明示する
- 手動で安全な場所へ退避または再実行するよう案内する

## 7. エラー方針

- `dotenvx` 実行ファイル解決失敗は依存関係エラーとする。
- `keypair` 実行失敗は鍵取得失敗とする。
- 利用可能な鍵ソースが 1 つもない場合は、
  プロジェクト状態不足または鍵未検出として失敗する。

## 8. 前提

- v1 は `.env` に対応する `DOTENV_PRIVATE_KEY` だけを扱う。
- `.env.production` など環境別鍵は対象外とする。
- `dotenvx` の標準出力形式に秘密鍵が 1 値で出ることを前提にする。

## 9. 未確定事項

- `dotenvx keypair DOTENV_PRIVATE_KEY` の失敗時出力を、
  どこまで詳細に正規化してユーザーへ見せるか
