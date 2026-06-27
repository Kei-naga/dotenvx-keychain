# 設計: `dotenvx` アダプタ

## 1. 目的

- [仕様書](../spec.md) の 7.3、7.9、8.1、8.2 を、
  `dotenvx` 呼び出し単位まで具体化する。
- `init` が既存ローカル鍵を読む経路と、
  新規プロジェクトを安全にブートストラップする経路の境界を明確にする。

## 2. 設計対象

- 同梱した `dotenvx` バイナリの呼び出し方
- `dotenvx keypair DOTENV_PRIVATE_KEY` による既存鍵取得
- 隔離した一時ディレクトリでの `dotenvx encrypt` による新規ブートストラップ
- 一時的に生成される `.env.keys` を含む後処理境界

対象外:

- OS ストアへの保存
- `.dotenvx-keychain` の読み書き
- `run` の子コマンド実行

## 3. 想定 API

`init` からは次の薄い抽象を呼ぶ。

```ts
type DotenvxBootstrapResult = {
  privateKey: string;
  encryptedEnvContents: string;
};

type DotenvxAdapter = {
  readPrivateKey(projectRoot: string): Promise<string | null>;
  bootstrapProjectEnv(projectRoot: string): Promise<DotenvxBootstrapResult>;
};
```

責務:

- `dotenvx` 呼び出しのコマンド列をここへ閉じ込める。
- 鍵文字列は戻り値でのみ返し、標準出力・標準エラーへ流さない。
- 新規ブートストラップ時は、実プロジェクトルートを直接汚さずに
  暗号化済み `.env` の成果物だけを返す。

## 4. `dotenvx` 呼び出し契約

### 4.1 共通契約

- `dotenvx` バイナリは同梱依存から解決したものを使う。
- 可能な限りシェル非経由で起動する。
- 標準出力と標準エラーは既定で capture し、
  失敗時も秘密値を呼び出し側へ生で渡さない。
- プロセス環境は allowlist ベースでサニタイズする。
  少なくとも `PATH`、`HOME`、`TMPDIR`、Windows 系の実行基盤変数だけを許可し、
  アプリケーション固有の秘密値や任意の親環境変数を渡さない。

### 4.2 既存鍵の読取

既存の `.env.keys` または暗号化済み `.env` から
`DOTENV_PRIVATE_KEY` を取得する処理は、次のコマンドで行う。

```text
dotenvx keypair DOTENV_PRIVATE_KEY
```

契約:

- `cwd` は `projectRoot` とする。
- 成功時に 1 行の秘密鍵文字列が得られれば採用する。
- 標準出力が `null` 1 行だけだった場合は「鍵なし」を意味し、
  失敗ではなく `null` を返す。
- 空文字、複数値、想定外の出力しか得られない場合は失敗とする。
- `dotenvx` の追加説明文をそのままユーザーへ流さない。

### 4.3 新規プロジェクトのブートストラップ

新規ブートストラップは、実プロジェクトルートではなく
隔離した一時ディレクトリで行う。

処理手順:

1. プロジェクトルートの `.env` を読む。
2. `.env` が非空なら、その内容を一時ディレクトリへコピーする。
3. `.env` が存在しないか 0 byte なら、
   `DXK_BOOTSTRAP_PLACEHOLDER=bootstrap` だけを含む一時 `.env` を作る。
4. 一時ディレクトリで `dotenvx encrypt` を実行する。
5. 同じ一時ディレクトリで `dotenvx keypair DOTENV_PRIVATE_KEY` を実行する。
6. 生成された `.env` 内容を読み、placeholder を使っていた場合は
   その暗号化行だけを削除して返す。
7. 一時ディレクトリを再帰削除する。

理由:

- `.env` 不在の空ディレクトリに対して `dotenvx encrypt` を直接実行すると、
  サニタイズ済み環境でも `PATH` や `HOME` などの親実行環境変数を
  `.env` に取り込むことがある。
- placeholder-only の一時 `.env` を使うことで、
  新規鍵生成に必要な `.env.keys` と `DOTENV_PUBLIC_KEY` は得つつ、
  実プロジェクトへ不要な暗号化エントリを持ち込まない。

## 5. `init` での鍵ソース連携

`init` は次の優先順位で鍵ソースを解決する。

1. OS ストアの既存値
2. 親プロセスの `DOTENV_PRIVATE_KEY`
3. `dotenvx keypair DOTENV_PRIVATE_KEY` で読める既存ローカル鍵
4. `bootstrapProjectEnv(projectRoot)` による新規ブートストラップ

制約:

- 3 は `.env.keys` が残っている既存ローカル状態の救済として使う。
- 4 は `cwd/.dotenvx-keychain` が存在しない場合にだけ許可する。
- 実プロジェクトの `.env` がすでに暗号化済みなら、
  4 を使って新鍵を自動生成してはならない。
- `run` はこのブートストラップ API を使わない。

## 6. `.env.keys` 後処理

### 6.1 一時ディレクトリ側

- `bootstrapProjectEnv(...)` が生成した `.env.keys` は、
  一時ディレクトリごと削除することで回収する。
- 一時ディレクトリ削除は成功・失敗を問わず `finally` で試みる。

### 6.2 実プロジェクト側

実プロジェクトルートの `.env.keys` は `init` が管理する。

- 実プロジェクト側 `.env.keys` の削除は、
  鍵が OS ストアへ保存され、設定ファイル書き込みまで完了した後に行う。
- 既存ローカル鍵を `.env.keys` から読み取れたが、
  保存や設定更新の前に失敗した場合は自動削除してはならない。

## 7. エラー方針

- `dotenvx` 実行ファイル解決失敗は依存関係エラーとする。
- `keypair` 実行失敗は鍵取得失敗とする。
- `keypair` が `null` を返した場合は「鍵なし」であり、
  失敗とはみなさない。
- `encrypt` 実行失敗、期待した `.env` 不在、
  placeholder 除去後の成果物不整合はブートストラップ失敗とする。

## 8. 前提

- v1 は `.env` に対応する `DOTENV_PRIVATE_KEY` だけを扱う。
- `.env.production` など環境別鍵は対象外とする。
- `dotenvx` の標準出力形式に秘密鍵が 1 値で出ることを前提にする。
- 空プロジェクトの新規ブートストラップ後の `.env` は、
  `DOTENV_PUBLIC_KEY` と説明コメントだけを含むことがあり得る。

## 9. 未確定事項

- `dotenvx` 側に鍵生成専用の安定 API が追加された場合、
  placeholder を使う現在の bootstrap 実装をどこまで簡素化できるか。
