# 設計: シークレットストアバックエンド

## 1. 目的

- [仕様書](../spec.md) の 5.3、5.4、7.4、7.5、7.6 を詳細化する。
- OS 差分を隠蔽する共通抽象と、各プラットフォームの保存契約を定義する。

## 2. 設計対象

- `SecretStore` 抽象
- `set`、`get`、`list`、`remove` の契約
- プラットフォーム判定とバックエンド選択
- macOS、Windows、Linux の保存先マッピング
- 初期化失敗、利用不可、未対応 OS の扱い

対象外:

- 実際の鍵生成処理
- `.dotenvx-keychain` の読書き
- CLI 引数解釈

## 3. 共通抽象

### 3.1 想定インターフェース

```ts
type SecretStore = {
  set(id: string, value: string): Promise<void>;
  get(id: string): Promise<string | null>;
  list(): Promise<string[]>;
  remove(id: string): Promise<boolean>;
};
```

補助的に、初期化時点で失敗を分類するための factory を持つ。

```ts
type SecretStoreFactory = {
  create(platform: NodeJS.Platform): Promise<SecretStore>;
};
```

### 3.2 抽象の責務

- 名前空間を `dotenvx-keychain` に固定する。
- CLI へ OS 固有 API を露出しない。
- 例外をそのまま流さず、分類可能なエラーへ変換する。
- `id` と値のエンコード差分を吸収する。
- `list` が返す ID の重複を除去する。
- 実際の保存値をログや例外本文へ露出させない。

### 3.3 操作契約

- `set(id, value)`:
  同じ ID の既存エントリがあれば上書きする。
- `get(id)`:
  完全一致で取得し、未検出時は `null` を返す。
- `list()`:
  名前空間 `dotenvx-keychain` に属する ID だけを返す。
- `remove(id)`:
  完全一致で削除し、対象がなければ `false` を返す。

戻り値の方針:

- 未検出は `null` または `false` で返す。
- バックエンド障害は例外ではなく分類済みエラーへ変換する。

### 3.4 エラー型

少なくとも次の論理分類を持つ。

- `unsupported-platform`
- `backend-unavailable`
- `backend-io-error`
- `enumeration-failed`
- `remove-failed`

## 4. プラットフォーム別設計

### 4.1 macOS

- ログインキーチェーン上の generic password として保存する。
- `service` は `dotenvx-keychain` に固定する。
- `account` は ID と完全一致させる。
- 保存値は `DOTENV_PRIVATE_KEY` の生文字列とする。
- `list` は同一 `service` の項目を列挙し、`account` を ID とみなす。
- `remove` は `service + account` の完全一致で削除する。
- ログインキーチェーンがアンロックされていない場合は、
  `backend-unavailable` へ変換する。

### 4.2 Windows

- Credential Manager の Generic Credential を使う。
- `TargetName` は `dotenvx-keychain/<id>` とする。
- `list` は `TargetName` の接頭辞が `dotenvx-keychain/` の項目だけを集める。
- ID は接頭辞を除いた残り全体を採用する。
- 保存値は Unicode 文字列として扱える実装を選ぶ。
- Windows 固有メタデータは CLI 契約へ露出しない。

### 4.3 Linux

- native Linux では Secret Service API 互換バックエンドを前提とする。
- 書き込み先は既定コレクションとする。
- 少なくとも `service=dotenvx-keychain` と `id=<id>` を
  検索属性として持たせる。
- D-Bus セッションが存在しない場合は `backend-unavailable` とする。
- 既定コレクションが存在しない、またはアンロック不能な場合も
  `backend-unavailable` とする。
- headless Linux のように desktop login が無い環境では、
  `gnome-keyring-daemon --login` と `--start` のような明示初期化を行わないと
  `login` collection が実体化しない場合がある。
- `list` は `service=dotenvx-keychain` で絞り込み、
  `id` 属性だけを返す。
- 製品名ではなく Secret Service 互換性だけで可否を判定する。

WSL では別扱いとし、現在の Windows ログインユーザーの Credential Manager を
Windows と同じ `dotenvx-keychain/<id>` の TargetName で利用する。
Linux 側からは `powershell.exe` 経由の interop で到達し、利用不能時は
`backend-unavailable` として扱う。

### 4.4 各 OS の共通制約

- 保存先は現在のログインユーザーにひもづく領域に限定する。
- システム全体共有ストアは使わない。
- 平文のキャッシュやローカルファイルへの退避は行わない。
- 値は取得直後に CLI 側へ渡し、長期メモリ保持を避ける。

## 5. バックエンド選択フロー

1. `process.platform` を読む。
2. 対応 OS か判定する。
3. 対応するバックエンドを初期化する。
4. 初期化不能なら環境要件エラーへ変換する。

判定表:

- `darwin`: macOS 実装を使う。
- `win32`: Windows 実装を使う。
- `linux`: native Linux 実装または WSL 実装を使う。
- それ以外: `unsupported-platform` を返す。

`create(platform)` は初回利用時に 1 回だけ初期化し、
同一実行中では再利用してよい。

## 6. エラー方針

- 鍵未検出は `get` の戻り値で表し、例外にしない。
- バックエンド利用不可は初期化時点で分類して返す。
- 未対応プラットフォームは全コマンドで同じエラー種別を返す。
- `list` の列挙不能は `enumeration-failed` とする。
- `remove` の対象未検出は成功ではなく `false` で返す。
- `remove` の実行障害だけを `remove-failed` とする。

CLI への引き渡し規則:

- `unsupported-platform` と `backend-unavailable` は
  終了コード `4` へ変換する。
- `get` の `null` は `run` では終了コード `3`、
  `remove` では終了コード `3` へ変換する。

## 7. ライブラリ選定観点

- 3 OS を単一 API で扱えること
- `list` と `remove` に必要な列挙能力があること
- 同期 API ではなく Promise ベースで扱えること
- メンテナンス状況が継続していること
- Node.js の現行 LTS でビルド可能であること
- Linux で Secret Service 属性検索が実現できること
- 依存ライブラリ自身が秘密値をログ出力しないこと

選定方針:

- まず単一 OSS で 3 OS を扱える候補を探す。
- `list` 実装に不足がある場合だけ、抽象の内側で OS 別補完を検討する。
- CLI 公開契約は OSS 名や戻り値構造へ依存させない。

## 8. 前提

- 平文ファイルや代替ストアへのフォールバックは行わない。
- 保存対象は `DOTENV_PRIVATE_KEY` のみとする。
- `list` と `remove` を成立させるため、
  バックエンドは列挙可能でなければならない。

## 9. Linux 利用不可時の案内

- 利用者向けメッセージは、まず native secret store が利用不可であることを短く伝える。
- Linux では復旧手順として、少なくとも次の確認を促す。
  - `libsecret` ランタイムが導入され、読み込み可能であること
  - 現在のログインセッションに D-Bus session があること
  - Secret Service 互換の keyring daemon が動作していること
  - 既定コレクションが存在し、アンロック済みであること
- WSL では復旧手順として、少なくとも次の確認を促す。
  - Linux 側から `powershell.exe` を起動できること
  - 現在の Windows ログインユーザーが Credential Manager を利用できること
- 内部例外の生文面や秘密値は、その案内文へ直接含めない。
