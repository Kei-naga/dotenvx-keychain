# 設計記録: `init` の隔離ブートストラップ

## 1. 目的

- `init` が新規プロジェクトを 1 コマンドで開始できるようになった経緯と、
  現在の安全設計を記録する。
- 「なぜ project root でそのまま `dotenvx encrypt` を呼ばないのか」を
  将来の保守者向けに明文化する。

## 2. 現在の位置づけ

- v1 の `init` は、既存鍵の取り込みに加えて、
  新規プロジェクトの隔離ブートストラップを本契約に含める。
- この文書は将来案ではなく、現在実装の設計記録である。

## 3. 確認された危険性

- `.env` 不在または空ファイルのディレクトリで
  `dotenvx encrypt` を直接実行すると、新しい `.env` と `.env.keys` が生成される。
- その際、実行環境に残した変数が `.env` へ暗号化されて書き込まれることがある。
- `PATH` や `HOME` のような実行基盤変数であっても、
  開発者が意図しない値をプロジェクトへ持ち込む点で不適切である。

## 4. 採用した対策

### 4.1 一時ディレクトリ実行

- `dotenvx encrypt` と `dotenvx keypair DOTENV_PRIVATE_KEY` は、
  実プロジェクトルートではなく隔離した一時ディレクトリで実行する。
- 成果物として持ち帰るのは `DOTENV_PRIVATE_KEY` と暗号化済み `.env` 内容だけとする。

### 4.2 placeholder-only `.env`

- 実プロジェクト側 `.env` が存在しないか空なら、
  一時ディレクトリでは `DXK_BOOTSTRAP_PLACEHOLDER=bootstrap` だけを書いた
  仮の `.env` を使う。
- `encrypt` 後にその placeholder の暗号化行を除去し、
  最終的な `.env` へは残さない。
- これにより `.env.keys` と `DOTENV_PUBLIC_KEY` は得つつ、
  実行環境の変数が最終 `.env` に混ざることを避ける。

### 4.3 自動ローテーション禁止

- 既に暗号化済みの `.env` があるプロジェクトでは、
  対応する鍵が見つからなくても `init` は bootstrap に進まない。
- `cwd/.dotenvx-keychain` が存在するプロジェクトでも同様に、
  既存状態の復旧を優先し、新鍵生成で上書きしない。

### 4.4 ロールバック

- bootstrap 鍵をストアへ保存した後に `.env` 更新や設定ファイル書き込みが失敗した場合は、
  ストアエントリ削除と `.env` 復元を試みる。
- `.env.keys` 削除失敗は引き続き exit `5` とし、
  セキュリティ上の失敗として扱う。

## 5. 残るトレードオフ

- 空プロジェクト bootstrap 後の `.env` は、
  `DOTENV_PUBLIC_KEY` と説明コメントだけを持つことがある。
- これは「暗号化対象のユーザー変数がまだ存在しない」状態を表し、
  不要な placeholder や親環境変数を残さないことを優先した結果である。

## 6. 将来の簡素化余地

次のいずれかが満たされた場合は、現在の bootstrap 実装を簡素化できるか再評価してよい。

1. `dotenvx` 側に鍵生成専用で安全な公式インターフェースが追加されたとき
2. placeholder を使わずに同じ安全性を満たせる upstream の振る舞いが確認できたとき
3. 複数 `.env*` 系列や環境別鍵へ拡張する要件が出たとき

## 7. 関連文書

- [../spec.md](../spec.md)
- [05-implementation-readiness.md](./05-implementation-readiness.md)
- [35-dotenvx-adapter.md](./35-dotenvx-adapter.md)
- [40-command-init.md](./40-command-init.md)
