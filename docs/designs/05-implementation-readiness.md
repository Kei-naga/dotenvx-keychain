# 設計記録: 実装着手前の論点と採用結果

## 1. 目的

- 実装着手前に論点だった項目と、実際に採用した方針を対比で残す。
- 現在の設計書を読むときに、「どの判断が既に閉じた論点か」を明確にする。

## 2. 結論

実装着手前に大きかった論点は、現在は次の方針で閉じている。

1. `init` の鍵ブートストラップ契約は、
   「既存鍵の取り込みのみ」ではなく
   「新規プロジェクトでは安全な隔離ブートストラップまで担う」で確定した。
2. Secret Store 実装は `keytar` ベースの `SecretStore` 抽象で実装した。
3. `init` の bootstrap は、project root 直実行ではなく
   一時ディレクトリ + placeholder `.env` 方式で確定した。

## 3. 採用した設計判断

### 3.1 `init` の鍵ブートストラップ契約

採用結果:

- `init` は OS ストア既存値、親プロセス環境変数、
  既に存在する `.env.keys` / 暗号化済み `.env` から鍵を取り込める。
- それでも鍵がなく、かつ `cwd/.dotenvx-keychain` も既存暗号化済み `.env` もないなら、
  `init` 自身が新規ブートストラップを行う。
- 既存設定や既存暗号化済み `.env` がある場合は、
  自動で新鍵を生成して上書きしない。

採用理由:

- fresh project で `init` 一発導入を求める要件があり、
  「先に dotenvx 側で鍵を用意する」前提は UX 上の摩擦が大きかった。
- 一方で既存暗号化状態に対する自動ローテーションは危険なため、
  bootstrap 可否を明確に分ける必要があった。

### 3.2 直接 `dotenvx encrypt` を使わない理由

確認できたこと:

- `.env` 不在または空ファイルのディレクトリで `dotenvx encrypt` を実行すると、
  新しい `.env` と `.env.keys` を生成する。
- そのままでは、実行環境に残った変数群が `.env` へ混入し得る。

採用した対策:

- [90-future-init-key-generation.md](./90-future-init-key-generation.md) に記録した通り、
  一時ディレクトリと placeholder-only `.env` を使う。
- `dotenvx` 実行環境は allowlist ベースでサニタイズする。

### 3.3 Secret Store 実装方式

採用結果:

- `SecretStore` 抽象は維持しつつ、実装は `keytar` ベースで確定した。
- unsupported platform や backend unavailable は、
  明示的な exit `4` として扱う。
- 平文ファイルや別 backend への自動フォールバックは行わない。

## 4. 現在も残る運用課題

- `keytar` の保守継続性と Node.js / OS 更新への追従確認
- native-store smoke の OS マトリクス自動化
- Linux の Secret Service 利用不可ケースの継続検証

## 5. 低リスクで固定した実装基盤

- 言語: TypeScript
- モジュール形式: Node.js ESM
- 最低実行環境: Node.js 20 以上
- ビルド: `tsc` による `dist/` 生成のみ
- テスト: Vitest
- パッケージマネージャ: npm

## 6. 関連文書

- [20-secret-store-backend.md](./20-secret-store-backend.md)
- [35-dotenvx-adapter.md](./35-dotenvx-adapter.md)
- [40-command-init.md](./40-command-init.md)
- [70-error-security-test.md](./70-error-security-test.md)
- [90-future-init-key-generation.md](./90-future-init-key-generation.md)
