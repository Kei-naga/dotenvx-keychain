# src アーキテクチャ図

`src/` 配下の現在実装を、CLI 実行フローと主要な抽象に絞って整理したメモ。
主に `init` / `run` / `list` / `remove` の制御経路、設定ファイル解決、
Secret Store 抽象、`dotenvx` 連携の位置づけを把握するために使う。

## 対象範囲

- CLI entry point: [src/index.ts](../../src/index.ts)
- 引数解析と dispatch: [src/cli/parseArgs.ts](../../src/cli/parseArgs.ts), [src/cli/dispatcher.ts](../../src/cli/dispatcher.ts)
- command 本体: [src/commands/init.ts](../../src/commands/init.ts), [src/commands/run.ts](../../src/commands/run.ts), [src/commands/list.ts](../../src/commands/list.ts), [src/commands/remove.ts](../../src/commands/remove.ts)
- config / ID 解決: [src/config/configFile.ts](../../src/config/configFile.ts), [src/config/id.ts](../../src/config/id.ts), [src/config/idResolver.ts](../../src/config/idResolver.ts)
- Secret Store: [src/secretStore/interface.ts](../../src/secretStore/interface.ts), [src/secretStore/factory.ts](../../src/secretStore/factory.ts), [src/secretStore/backends/keytarStore.ts](../../src/secretStore/backends/keytarStore.ts)
- `dotenvx` 連携: [src/dotenvx/adapter.ts](../../src/dotenvx/adapter.ts), [src/dotenvx/resolver.ts](../../src/dotenvx/resolver.ts)

## 全体フロー

```mermaid
flowchart TD
    A["src/index.ts<br/>main()"] --> B["cli/dispatcher.ts<br/>dispatch(argv)"]
    B --> C["cli/parseArgs.ts<br/>parseCliArgs()"]

    C -->|help| D["usage / help を出力"]
    C -->|usage-error| E["message と usage を出力<br/>exit 2"]
    C -->|init| F["commands/init.ts<br/>initCommand()"]
    C -->|run| G["commands/run.ts<br/>runCommand()"]
    C -->|list| H["commands/list.ts<br/>listCommand()"]
    C -->|remove| I["commands/remove.ts<br/>removeCommand()"]

    F --> J["config/idResolver.ts<br/>resolveInitId()"]
    J --> K["config/configFile.ts<br/>readConfig() / writeConfig()"]
    J --> L["config/id.ts<br/>assertValidId() / createAutoIdFromRealPath()"]
    F --> M["secretStore/factory.ts<br/>createSecretStore()"]
    M --> N["secretStore/backends/keytarStore.ts<br/>KeytarSecretStore"]
    F --> O["dotenvx/adapter.ts<br/>DefaultDotenvxAdapter.readPrivateKey()"]
    O --> P["dotenvx/resolver.ts<br/>resolveDotenvxBinary()"]

    G --> Q["config/idResolver.ts<br/>resolveRunProject()"]
    Q --> K
    G --> L
    G --> M
    G --> P
    G --> R["cli/processRunner.ts<br/>defaultRunInheritedProcess()"]
    G --> S["cli/processRunner.ts<br/>shouldUseWindowsShell()"]

    H --> M
    I --> L
    I --> M
```

## `init` フロー

`initCommand()` は、ID 解決と鍵ソース解決を分けて扱う。
鍵の優先順位は次の通り。

1. 既存の Secret Store 内の鍵
2. 親プロセスの `DOTENV_PRIVATE_KEY`
3. ローカル `.env` / `.env.keys` から `dotenvx` 経由で読んだ鍵

```mermaid
flowchart TD
    A["initCommand()"] --> B["resolveInitId(cwd, explicitId?)"]
    B --> C["secretStoreFactory.create()"]
    C --> D["resolvePrivateKey()"]

    D --> E{"store.get(id) に鍵あり?"}
    E -->|yes| F["既存鍵を採用"]
    E -->|no| G{"env.DOTENV_PRIVATE_KEY あり?"}
    G -->|yes| H["環境変数の鍵を採用"]
    G -->|no| I["dotenvxAdapter.readPrivateKey(projectRoot)"]
    I --> J{"ローカル鍵あり?"}
    J -->|no| K["not found<br/>exit 3"]
    J -->|yes| L["ローカル鍵を採用"]

    H --> M{"store へ保存が必要?"}
    L --> M
    F --> N["writeConfig(projectRoot, id)"]
    M -->|yes| O["store.set(id, privateKey)"]
    M -->|no| N
    O --> N

    N -->|失敗| P["必要なら store.remove(id) で rollback<br/>exit 4"]
    N -->|成功| Q{".env.keys が存在?"}
    Q -->|yes| R["削除を試行"]
    Q -->|no| S["success<br/>exit 0"]
    R -->|成功| S
    R -->|失敗| T["post-process failure<br/>exit 5"]
```

## `run` フロー

`runCommand()` は、すでに `DOTENV_PRIVATE_KEY` が注入済みならそのまま使い、
未注入時だけ config 探索と Secret Store 解決に進む。

```mermaid
flowchart TD
    A["runCommand()"] --> B{"env.DOTENV_PRIVATE_KEY あり?"}
    B -->|yes| C["環境変数の鍵をそのまま使用"]
    B -->|no| D["resolveRunProject(cwd)"]

    D --> E{"config が見つかった?"}
    E -->|yes| F["readConfig(configPath) で id を取得"]
    E -->|no| G["createAutoIdFromRealPath(projectRoot)"]

    F --> H["secretStoreFactory.create()"]
    G --> H
    H --> I["store.get(id)"]
    I --> J{"鍵あり?"}
    J -->|no| K["init を案内して<br/>exit 3"]
    J -->|yes| L["privateKey を確定"]

    C --> M["resolveDotenvxBinary()"]
    L --> M
    M --> N{"Windows?"}
    N -->|yes| O["shouldUseWindowsShell(command, cwd, env)"]
    N -->|no| P["shell = false"]
    O --> Q["defaultRunInheritedProcess()<br/>node dotenvx run -- command"]
    P --> Q

    Q --> R{"signal で終了した?"}
    R -->|yes| S["親プロセスへ signal 伝播<br/>exit 4"]
    R -->|no| T["child exitCode を返す"]
```

## 主要インターフェースと実装

```mermaid
classDiagram
    class SecretStore {
        <<interface>>
        +set(id, value) Promise~void~
        +get(id) Promise~string|null~
        +list() Promise~string[]~
        +remove(id) Promise~boolean~
    }

    class SecretStoreFactory {
        <<interface>>
        +create(platform?) Promise~SecretStore~
    }

    class KeytarLike {
        <<interface>>
        +setPassword(service, account, password) Promise~void~
        +getPassword(service, account) Promise~string|null~
        +deletePassword(service, account) Promise~boolean~
        +findCredentials(service) Promise~SecretStoreCredential[]~
    }

    class KeytarSecretStore {
        +probe() Promise~void~
        +set(id, value) Promise~void~
        +get(id) Promise~string|null~
        +list() Promise~string[]~
        +remove(id) Promise~boolean~
    }

    class MockSecretStore {
        +set(id, value) Promise~void~
        +get(id) Promise~string|null~
        +list() Promise~string[]~
        +remove(id) Promise~boolean~
    }

    class DotenvxAdapter {
        <<interface>>
        +readPrivateKey(projectRoot) Promise~string|null~
    }

    class DefaultDotenvxAdapter {
        +readPrivateKey(projectRoot) Promise~string|null~
    }

    class DotenvxAdapterError

    class ReadConfigError {
        +code: ReadConfigErrorCode
        +path: string
    }

    class SecretStoreError {
        +code: SecretStoreErrorCode
    }

    class InvalidIdError {
        +id: string
    }

    SecretStore <|.. KeytarSecretStore
    SecretStore <|.. MockSecretStore
    DotenvxAdapter <|.. DefaultDotenvxAdapter
    SecretStoreFactory ..> SecretStore : create()
    KeytarSecretStore --> KeytarLike : uses
    KeytarSecretStore ..> SecretStoreError : throws
    DefaultDotenvxAdapter ..> DotenvxAdapterError : throws
```

## ディレクトリごとの責務

| ディレクトリ       | 主な責務                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| `src/cli/`         | 引数解析、command dispatch、終了コード、子プロセス起動、Windows シェル判定 |
| `src/commands/`    | CLI 契約を実行時処理へ変換する orchestration                               |
| `src/config/`      | `.dotenvx-keychain` の読み書き、ID 検証、自動 ID 生成、親ディレクトリ探索  |
| `src/dotenvx/`     | 同梱 `dotenvx` バイナリ解決とローカル鍵読取                                |
| `src/secretStore/` | OS Secret Store 抽象、backend 生成、`keytar` 実装、テスト用 mock           |

## 補足メモ

- `list` は Secret Store から ID を列挙し、重複除去後に昇順出力するだけの薄い command である。
- `remove` は ID バリデーション後に exact match で削除し、未存在時は `exit 3` を返す。
- `run` の Windows 分岐は `.cmd` / `.bat` のときだけ `shell = true` に切り替える。
- 自動 ID は実パスを正規化し、basename と SHA-256 由来の 12 桁ハッシュを組み合わせて生成する。
