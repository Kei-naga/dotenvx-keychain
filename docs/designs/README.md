# dotenvx-keychain 詳細設計

## 1. このディレクトリの目的

- [仕様書](../spec.md) を実装責務ごとの詳細設計へ分割する。
- 実装前に、責務境界、入出力、失敗時動作、未確定事項を明示する。
- v1 の CLI を対象とし、実装コードの構成案と 1 対 1 に近い粒度で管理する。

## 2. 使い方

- まず横断仕様を扱う文書から埋める。
- その後にコマンド別文書へ具体的なシーケンスと分岐を書く。
- 未決定の点は各文書の「未確定事項」に残し、決まり次第ここから消す。

現時点では、v1 実装に必要な基本フローと責務境界は各文書へ反映済みである。
ただし、実装着手前のブロッカー整理は
[05-implementation-readiness.md](./05-implementation-readiness.md) を起点に確認する。
以降はその文書で挙げた決定事項から優先して潰す。

## 3. 文書一覧

| ファイル | 主な対象 |
| --- | --- |
| [05-implementation-readiness.md](./05-implementation-readiness.md) | 実装前の論点と、現在採用した設計判断 |
| [10-config-and-id.md](./10-config-and-id.md) | `.dotenvx-keychain`、ID バリデーション、自動生成、ルート解決 |
| [20-secret-store-backend.md](./20-secret-store-backend.md) | シークレットストア抽象、OS 別マッピング、バックエンド異常 |
| [30-cli-runtime-common.md](./30-cli-runtime-common.md) | 引数解析、`dotenvx` 解決、子プロセス起動、終了コード伝播 |
| [35-dotenvx-adapter.md](./35-dotenvx-adapter.md) | `dotenvx` 暗号化・鍵取得・`.env.keys` 後処理 |
| [40-command-init.md](./40-command-init.md) | `init` の正常系、上書き、ロールバック、後処理 |
| [50-command-run.md](./50-command-run.md) | `run` の ID 解決、鍵注入、子プロセス実行、失敗分岐 |
| [60-command-admin.md](./60-command-admin.md) | `list` と `remove` の出力、整列、削除契約 |
| [70-error-security-test.md](./70-error-security-test.md) | エラー分類、セキュリティ要件、受け入れ観点 |
| [90-future-init-key-generation.md](./90-future-init-key-generation.md) | `init` bootstrap の安全設計と採用理由 |

## 4. 執筆ルール

- 仕様書の節番号を必要に応じて参照しつつ、ここでは実装責務の視点で再構成する。
- 1 つの文書につき、最低でも「目的」「設計対象」「フロー」「異常系」「未確定事項」を持つ。
- コード断片を書く場合は、公開 API ではなく責務境界が分かる最小例にとどめる。
- 秘密値の実例は記載しない。

## 5. 現時点の未確定事項

- Linux を含む 3 OS をまたぐ Secret Store 実装に、
  どの OSS または OS 別実装方針を採用するか。
- 実ストア確認を含むクロスプラットフォーム試験を CI でどこまで自動化するか。
