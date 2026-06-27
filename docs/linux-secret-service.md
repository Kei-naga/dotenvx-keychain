# Linux Secret Service と WSL 検証メモ

## 1. 目的

- native Linux で `dotenvx-keychain` の Secret Service backend を使うための前提条件を 1 か所に集約する。
- README には要点だけを残し、native Linux 向けの具体的な確認手順と、WSL で Linux backend を強制したい場合の診断手順はこの文書に寄せる。
- release 前の `npm run test:real-store-smoke` を Linux で再現するための最小手順を残す。

## 2. 対象

- `process.platform === "linux"` で動く `dotenvx-keychain`
- native Linux の `keytar` backend と Secret Service 互換ストア
- desktop Linux だけでなく、headless Linux と、必要時に Linux backend を強制する WSL 診断フロー

通常の WSL 実行では、`dotenvx-keychain` は Linux Secret Service ではなく
Windows Credential Manager を使う。WSL でこの文書が直接必要になるのは、
native Linux backend の切り分けや `npm run test:real-store-smoke:wsl` による
比較診断を行う場合である。

## 3. 必須前提

native Linux backend では、少なくとも次の条件が揃っていないと store は使えない。

1. `libsecret-1.so.0` がインストールされ、`keytar` native addon から読み込めること
2. WSL 診断時も Windows 側ではなく Linux-native の `node` / `npm` を使うこと
3. 現在のログイン session に D-Bus session bus があること
4. Secret Service 互換 daemon が動作していること
5. 既定 collection が存在し、書き込み可能であること

補助的に、切り分け用として `secret-tool` が使えると確認しやすい。

WSL で `/mnt/c/.../npm` のような Windows npm を使うと、UNC path 上で
`cmd.exe` が起動して repository script 実行前に失敗することがある。
`command -v node` と `command -v npm` は Linux 側の path を返す状態にしておく。

## 4. Ubuntu 系での代表的な導入例

Ubuntu / Debian 系では、今回の確認に次の package を使った。

```bash
sudo apt-get install -y libsecret-1-0 gnome-keyring libsecret-tools
```

- `libsecret-1-0`: `keytar` 実行時に必要な runtime library
- `gnome-keyring`: Secret Service provider
- `libsecret-tools`: `secret-tool` による backend 切り分け用

## 5. 確認順序

### 5.1 `keytar` が `libsecret` を読めるか

```bash
find node_modules/keytar -name '*.node' -print -exec ldd {} \;
```

期待値:

- `libsecret-1.so.0 => /.../libsecret-1.so.0` のように解決される
- `not found` の場合は runtime library 不足

### 5.2 Secret Service が session bus に見えているか

```bash
gdbus introspect --session \
  --dest org.freedesktop.secrets \
  --object-path /org/freedesktop/secrets
```

期待値:

- `org.freedesktop.Secret.Service` が見える
- `org.freedesktop.DBus.Error.ServiceUnknown` の場合は provider 未導入または未起動

### 5.3 既定 collection alias を確認する

```bash
dbus-send --session --print-reply \
  --dest=org.freedesktop.secrets \
  /org/freedesktop/secrets \
  org.freedesktop.Secret.Service.ReadAlias \
  string:default
```

期待値:

- `object path "/org/freedesktop/secrets/collection/login"` などの既定 collection が返る
- alias が返っても、後続の store で `Object does not exist at path ...` が出る場合は collection 実体が壊れているか未初期化

### 5.4 `secret-tool` で backend を直接確認する

```bash
printf '%s' 'smoke-value' | secret-tool store \
  --label='dxk probe' \
  service dotenvx-keychain \
  account dxk-probe

secret-tool lookup service dotenvx-keychain account dxk-probe
secret-tool clear service dotenvx-keychain account dxk-probe
```

期待値:

- store / lookup / clear が通る
- ここで失敗するなら `dotenvx-keychain` 以前に Secret Service session の問題

### 5.5 repository smoke を流す

```bash
npm run test:real-store-smoke
```

期待値:

- `set/get/list/remove` が通る

### 5.6 WSL helper script を使う

WSL で native Linux backend を比較診断したい場合、ambient user session の
default collection が壊れた alias 状態で残ることがあるため、repository には
isolated session を張って Linux backend を強制する wrapper command を追加している。

```bash
npm run test:real-store-smoke:wsl
```

期待値:

- `dbus-run-session` と `gnome-keyring-daemon` 初期化を内部で行った上で
  `test/smoke/realSecretStore.test.ts` が Linux backend で通る
- WSL の通常 runtime path を検証するコマンドではなく、Linux backend の比較診断入口として使える

## 6. headless Linux / WSL 診断の確認済み手順

Ubuntu 24.04.1 LTS on WSL2 では、ambient user session の既定 collection alias が壊れた状態で残り、
そのままでは `secret-tool` と `keytar` の両方が
`Object does not exist at path "/org/freedesktop/secrets/collection/login"`
で失敗した。

今回通過確認できた最小手順は次のとおり。

```bash
dbus-run-session -- bash

export HOME="$PWD/.tmp/wsl-keyring-home"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_CACHE_HOME="$HOME/.cache"
mkdir -p "$HOME/.local/share/keyrings" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"

printf '%s' "$KEYRING_PASSWORD" | gnome-keyring-daemon --login >/dev/null
eval "$(gnome-keyring-daemon --start --components=secrets)"

printf '%s' 'smoke-value' | secret-tool store \
  --label='dxk probe' \
  service dotenvx-keychain \
  account dxk-probe
secret-tool lookup service dotenvx-keychain account dxk-probe
secret-tool clear service dotenvx-keychain account dxk-probe

npm run test:real-store-smoke
```

同等の手順を repository script として使う場合は、
`npm run test:real-store-smoke:wsl` を使ってよい。

ポイント:

- `dbus-run-session` で clean な session bus を作る
- `gnome-keyring-daemon --login` と `--start` を順に実行して login collection を実体化する
- ambient user session の壊れた alias を避けるため、検証専用の HOME を使う

## 7. 代表的な失敗パターン

| 症状                                                                        | 意味                                                         | 優先確認項目                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `Failed to load the native secret store backend.`                           | `keytar` addon 自体が読めていない                            | `libsecret-1.so.0` の有無、`ldd` の結果                            |
| `GDBus.Error:org.freedesktop.DBus.Error.ServiceUnknown`                     | Secret Service provider が session bus にいない              | `gnome-keyring` 導入状態、daemon 起動状態                          |
| `Object does not exist at path "/org/freedesktop/secrets/collection/login"` | default alias はあるが collection 実体が壊れているか未初期化 | isolated D-Bus session、`gnome-keyring-daemon --login` / `--start` |
| `Cannot create an item in a locked collection`                              | default collection は見えているが lock されたまま            | collection unlock 状態、isolated session での `gnome-keyring-daemon --login` 実行 |
| CLI が exit `4` で失敗                                                      | backend unavailable として正しい                             | 平文 fallback が起きていないことを確認                             |

## 8. 今回の確認済み環境

- OS: Ubuntu 24.04.1 LTS on WSL2
- Node.js: v20.20.2
- package: `libsecret-1-0`, `gnome-keyring`, `libsecret-tools`
- success path: isolated `dbus-run-session` + `gnome-keyring-daemon --login` + `--start --components=secrets`
- unavailable path: `libsecret-1.so.0` 不在時の exit `4` と秘密値非露出を確認済み

## 9. 関連文書

- [README.md](../README.md)
- [spec.md](./spec.md)
- [designs/20-secret-store-backend.md](./designs/20-secret-store-backend.md)
- [memo/implementation-status.md](./memo/implementation-status.md)
