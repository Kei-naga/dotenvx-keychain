# dotenvx-keychain Product Requirements Document (PRD)

## 1. Product Overview

As AI coding agents such as Cursor and Claude Code become widespread, development workflows that autonomously scan local files are becoming standard. In that environment, traditional plaintext `.env` files create clear security risks: agents can read, leak, or overwrite API keys and other secret values.

`dotenvx` solves part of this problem by encrypting environment variables. However, if the decryption key (`DOTENV_PRIVATE_KEY`) remains inside the repository as `.env.keys`, it is still visible to agents, so the root problem is not actually resolved.

`dotenvx-keychain` is a very thin Node.js CLI wrapper around `dotenvx`. It delegates environment variable encryption to `dotenvx` while automatically isolating the decryption key inside the OS-native keychain. The result is a zero-trust local development workflow that is better aligned with the agent era.

The tool is also intended to be continuously maintainable as OSS and published on npm, with a distribution model that lets both individuals and teams start immediately through `npx` or a normal package install.

## 2. Core Values

- **Zero-trace filesystem:** Never leave key files such as `.env.keys` in the working tree. Agents should only be able to see the encrypted `.env`.
- **Maximum DX:** Developers should not need to think about copying, pasting, or managing keys. The tool should work transparently through an initial `init` and the usual `run` flow.
- **Seamless team adoption:** A non-secret config file that stores only the identifier can be shared through Git so that team members can share the same namespace without friction.

---

## 3. CLI Specification and Functional Requirements

- The canonical CLI binary name is `dotenvx-keychain`, with an additional short alias `dxk`.
- Command aliases are `list` = `ls` and `remove` = `rm`.
- `init` and `run` are available only under their canonical names.
- Aliases must preserve the same argument contract, exit codes, and output contract as the canonical commands.

### 1. Initialization Command: `init`

`init` has two roles. For projects where a decryption key is already available, it registers that key in the OS keychain and immediately discards any unnecessary `.env.keys`. For new projects that do not yet have key material, it performs the initial bootstrap with `dotenvx` inside an isolated temporary environment, stores the generated decryption key in the keychain, and leaves only the encrypted `.env` and an identifier-bearing config file in the project. On success, it must write a config file that records the identifier.

- **Pattern A: Default execution with no arguments**

```bash
npx dotenvx-keychain init
```

- **Behavior:** Automatically derive an identifier from the current directory path, its hash, or its folder name. If an existing key can be reused, store it in the keychain. If no reusable key exists but the project is new, perform a safe first-time bootstrap.
- **File output:** Create `.dotenvx-keychain` in the project root with content such as `{"id": "auto-generated-identifier"}`.

- **Pattern B: Explicit custom identifier**

```bash
npx dotenvx-keychain init my-app-v2
```

- **Behavior:** Use the supplied `my-app-v2` as the identifier and store any available existing key in the keychain. If no existing key is available, and the case is not reusing an existing encrypted `.env` or existing config, perform a safe first-time bootstrap.
- **File output:** Create `.dotenvx-keychain` in the project root with content `{"id": "my-app-v2"}`.

**Scenario assumptions**
The key source priority for `init` is: existing local keychain value, parent process `DOTENV_PRIVATE_KEY`, existing `.env.keys`, then fresh bootstrap. A new project must be able to start from `init` alone even when `dotenvx` has not been used to prepare keys in advance. By contrast, a project that already has an encrypted `.env`, or one that is reusing an existing `.dotenvx-keychain`, must not silently generate a new key and overwrite the current encrypted state.

**Operational best practice**
`.dotenvx-keychain` does not contain secret material, so it should be committed to Git. That lets other developers clone the repo, obtain the key through an approved path, run `init`, and complete the local keychain setup under the same identifier.

### 2. Execution Command: `run`

Wrap application execution and inject the key automatically.

```bash
npx dotenvx-keychain run -- node index.js
```

- **Identifier resolution logic:**

1. Read the `.dotenvx-keychain` file in the current directory and obtain the stored `id`. This file is the single source of truth.
2. If the file does not exist, for example after manual deletion, fall back to auto-deriving the identifier from the path.

- **In-memory injection and execution:** Fetch the key associated with the resolved `id` from the keychain, place it into memory as environment variable `DOTENV_PRIVATE_KEY`, and execute `dotenvx run -- <command>` as a child process.

### 3. Administrative Commands: `list` / `remove`

- **`list`:** Show the list of identifiers stored locally for this tool. Never display the actual key string.
- **`remove <id>`:** Safely delete the key for an obsolete project from the keychain.

---

## 4. Non-functional Requirements

- **Distribution and publication model:** Publish as OSS on npm. Users must be able to run the CLI through `npx dotenvx-keychain ...` or a normal npm install, and the published package must include the runtime binaries and core documentation needed for local development.

| Item | Requirement details |
| --- | --- |
| **Cross-platform** | Must support macOS (Keychain Access), Windows (Credential Manager), and Linux (Secret Service API / libsecret) through native OS integrations. |
| **Security boundary** | Never expose the key string to stdout or stderr. Restrict environment variable injection to only the child process started by `run`, and do not contaminate the parent process or current shell. |
| **Performance** | As an extremely thin Node.js wrapper, keep the overhead from keychain lookup through process launch in the millisecond range. |
| **Separation from CI/CD** | The tool is for local development only. In CI/CD systems such as GitHub Actions and in production, the tool should not intervene; existing flows should continue to inject `DOTENV_PRIVATE_KEY` directly from the platform-standard secret manager. |

---

## 5. Competitive Advantage Compared with Existing Approaches

1. **Compared with `envchain` and similar tools:** Instead of hiding all environment variables, this design isolates only the single decryption key. That preserves the core `dotenv` developer experience of listing, managing, and sharing environment variables through files.
2. **Compared with manual scripts:** Teams do not need to hand-roll OS-specific branching or their own `.env.keys` registration and deletion logic. The setup flow around `dotenvx` stays thin and standardized.
3. **For team development:** Sharing the namespace through `.dotenvx-keychain` removes the need for each developer to manually coordinate keychain entry names and makes it easier to standardize a secure development setup across the team.
