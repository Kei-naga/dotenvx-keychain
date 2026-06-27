# dotenvx-keychain Specification

## 1. Role of This Document

- This document expands the [PRD](./prd.md) to an implementable level of detail.
- The target version is the v1 CLI.
- For Git / GitHub development workflow, see [contributing.md](./contributing.md).
- If the PRD and this document conflict, treat the difference as an issue to resolve and confirm whether the PRD should also be updated.

## 2. Scope

This document defines the following scope.

- The `init`, `run`, `list`, and `remove` commands of a CLI for local development environments
- The format and resolution rules for the `.dotenvx-keychain` config file
- The persistence rules for storing values in the OS-native secret store
- The behavior for injecting the key required when executing `dotenvx`
- An execution mode that prioritizes a pre-injected `DOTENV_PRIVATE_KEY`

The following are out of scope.

- The secret distribution, storage, or rotation mechanisms themselves for CI/CD or production environments
- The encryption algorithm or file format of `dotenvx` itself
- Multiple key formats other than `DOTENV_PRIVATE_KEY`
- Automation-oriented output controls such as JSON output or quiet mode
- Key export, import, backup, sync, sharing, or recovery
- Integration with a remote KMS or cloud secret manager

## 3. Assumptions and Decisions

- Each project has exactly one active identifier.
- Each identifier maps to exactly one `DOTENV_PRIVATE_KEY` value.
- `.dotenvx-keychain` does not contain secret material, so it may be committed to Git.
- If `init` is run with no arguments and `.dotenvx-keychain` already exists in the same directory, it reuses that `id`.
- `run` is allowed not only from the project root, but also from child directories under it.
- `run` uses an auto-derived ID from the current directory only when no config file can be found.
- If the parent process environment variable `DOTENV_PRIVATE_KEY` is set to a non-empty value when `run` executes, that value takes top priority and the OS store must not be consulted.
- When initializing an existing project on a different terminal or machine, v1 does not automate shared-key distribution itself. The required key is assumed to be supplied through the existing OS store or the parent process `DOTENV_PRIVATE_KEY`.
- If `init` reuses the `id` from an existing config file and no local key is available, it must not generate a new key automatically and must instead fail, requiring the existing key to be supplied.
- The key sources that `init` may consume are: an existing OS store value for the resolved ID, the parent process `DOTENV_PRIVATE_KEY`, an existing local key that the bundled `dotenvx` can read, or an isolated bootstrap flow for a new project.
- For a new project with neither an existing config file nor an encrypted `.env`, `init` may generate the first `DOTENV_PRIVATE_KEY` and encrypted `.env` through the bundled `dotenvx`, but only when no reusable key can be found.
- `dotenvx` is treated as a bundled runtime dependency of this tool and must not require a global installation.
- The distribution target is a public npm package that can be used through `npx dotenvx-keychain` or a locally installed `dotenvx-keychain` / `dxk` binary.
- The published package must include the `dotenvx` runtime dependency required for CLI execution, plus README and LICENSE.
- Supported operating systems are limited to `darwin`, `win32`, and `linux`; all others must fail as unsupported platforms.
- In v1, the only key format that can be stored and injected is `DOTENV_PRIVATE_KEY`.
- In v1, CLI output is plain text for humans only; JSON output and quiet mode are not provided.
- Key import, export, and backup are future capabilities and are not provided in v1.
- If the OS-native store is unavailable, the tool must not fall back to a plaintext file or alternate store.

## 4. Terminology

- Project root:
  The directory that contains `.dotenvx-keychain`.
- ID:
  The string that uniquely identifies a key entry inside the keychain.
- Config file:
  The `.dotenvx-keychain` JSON file placed in the project root.
- Secret entry:
  The actual `DOTENV_PRIVATE_KEY` value stored in the OS-native store.
- Pre-injected key:
  A value that is already set in the parent process environment variable `DOTENV_PRIVATE_KEY`.

## 5. Managed Artifacts and Persistence Rules

### 5.1 Files and Store

- `.env`:
  Assume `dotenvx` keeps it encrypted and leave it in place.
- `.env.keys`:
  It may already exist because of prior `dotenvx` operations.
  `init` may read it as an existing key source, but it must not remain after success.
- `.dotenvx-keychain`:
  Place it in the project root as a config file that does not contain secret material.
- OS secret store:
  This is the only persistent location for the actual `DOTENV_PRIVATE_KEY` value.

### 5.2 `.dotenvx-keychain` Format

The file content is UTF-8 JSON, and the only required field is `id`.

```json
{
  "id": "my-app-v2"
}
```

- `id` is a required string.
- Unknown additional properties may be ignored when reading.
- The file must not contain secret values such as keys or tokens.

### 5.3 Logical Model in the Store

- The namespace is fixed as `dotenvx-keychain`.
- The lookup key is `id`.
- The stored value is the raw `DOTENV_PRIVATE_KEY` string.
- Per-OS API differences are absorbed by the implementation, and this logical model is the user-facing contract.

### 5.4 Platform-specific Store Mapping

- On every platform, storage is limited to the store associated with the current logged-in user.
- On macOS, store the value as a generic password in the login keychain with `service=dotenvx-keychain` and `account=id`.
- On Windows, store the value as a Generic Credential in Credential Manager with `TargetName=dotenvx-keychain/<id>`.
- On native Linux, store the value in the default Secret Service collection and make it discoverable again through at least the attributes `service=dotenvx-keychain` and `id=<id>`.
- On WSL, use Credential Manager for the current Windows logged-in user, with `TargetName=dotenvx-keychain/<id>` just as on Windows.
- To implement `list` and `remove`, every backend must support namespace-level enumeration and exact-match deletion by ID.
- If a Secret Service-compatible daemon or default collection is unavailable on native Linux, the tool must end with a backend-unavailable error rather than treating the environment as simply uninitialized.
- If Windows Credential Manager integration is unavailable on WSL, the tool must also end with a backend-unavailable error and must not fall back to an alternate store.

## 6. ID Specification

### 6.1 Explicit IDs

An ID provided by the user through `init <id>` must satisfy the following conditions.

- Between 1 and 128 characters inclusive
- Allowed characters are `a-z`, `A-Z`, `0-9`, `.`, `_`, and `-`
- No whitespace, including at the beginning or end
- Must not contain `/` or `\\`

If the input does not satisfy these conditions, the command must end with an input error.

### 6.2 Auto-generated IDs

If `init` runs with no arguments and `.dotenvx-keychain` does not exist in the same directory, an auto-generated ID is created from the current directory path.

The generation steps are as follows.

1. Obtain the absolute real path of the target directory.
2. On Windows, lowercase the drive letter.
3. Normalize path separators to `/`.
4. Extract the trailing directory name as `basename`.
5. Compute the SHA-256 of the normalized path and take the first 12 characters.
6. Use `basename-hash12` as the auto-generated ID.

For example, a directory named `my-app` would produce a format such as `my-app-1a2b3c4d5e6f`.

## 7. Common Behavior

### 7.1 Project Root Resolution During `run`

`run` searches upward from the current working directory and adopts the first `.dotenvx-keychain` it finds.

- If found:
  The directory containing that file becomes the project root.
- If not found:
  Treat the current working directory as the project root.

If config files exist at multiple ancestor levels, the nearest one takes priority.

### 7.2 Principles of Child Process Execution

- Do not modify the parent process environment.
- Inject `DOTENV_PRIVATE_KEY` only into the child process environment.
- Start the child process directly without a shell whenever possible.
- However, on Windows, if the user-specified command resolves to a `.cmd` or `.bat`, shell-based startup is allowed only for that command.
- The parent CLI must propagate the child process exit code and signal unchanged.

### 7.3 Resolving the `dotenvx` Dependency

- The CLI must prefer the bundled `dotenvx`.
- Users must not be required to install `dotenvx` globally.
- If the bundled `dotenvx` is unavailable, the command must end with a dependency error.

### 7.4 Platform Detection and Backend Abstraction

- The implementation selects the backend based on `process.platform`.
- When `process.platform === "linux"`, the implementation may further distinguish native Linux from WSL.
- Secret store integration is wrapped in a common abstraction with four operations: `set`, `get`, `list`, and `remove`.
- The CLI itself must not branch directly on OS-specific APIs and must access everything through that abstraction.
- On unsupported platforms, all of `init`, `run`, `list`, and `remove` must fail with a non-zero exit status.
- If native store initialization fails, the tool must not fall back to a plaintext file, a different environment variable, or an in-memory cache.

### 7.5 Prerequisites for Linux / WSL Backends

- Native Linux support requires a Secret Service API-compatible implementation and an available writable default collection.
- GNOME Keyring is a representative example, but the implementation judges compatibility by Secret Service behavior rather than by product name.
- If the backend is unavailable because the D-Bus session is missing, the default collection has not been created, the collection cannot be unlocked, or similar conditions apply, the tool must exit with an error message that includes remediation guidance.
- WSL support requires that `powershell.exe` can be launched from the Linux side and that the current Windows logged-in user's Credential Manager is reachable.
- If WSL does not satisfy those conditions, the tool must also exit with an error message that includes remediation guidance and must not automatically fall back to a plaintext file or Linux Secret Service.

### 7.6 Recommended Implementation Approach

- For cross-platform secret-store integration, the implementation may use a mature OSS library that exposes a single API across macOS, Windows, and Linux.
- However, the public CLI contract must not depend directly on that OSS API; it must be confined within the common abstraction described in [7.4](#74-platform-detection-and-backend-abstraction).
- CLI-specific logic such as child-process launching and ID resolution must not be delegated to OSS and must remain controlled by this tool.
- The Linux availability checks, unsupported-OS handling, and no-plaintext-fallback policy must be preserved even when OSS dependencies are adopted.

### 7.7 Command Names and Aliases

- The CLI accepts `dotenvx-keychain` as the canonical executable name and `dxk` as the short executable name.
- `list` accepts `ls` as an alias, and `remove` accepts `rm` as an alias.
- `init` and `run` have no aliases.
- Canonical names and aliases can be mixed. For example, `dxk init`, `dotenvx-keychain ls`, and `dxk rm` are all valid.
- Aliases are fully synonymous with their canonical names and must not change argument parsing, messages, exit codes, or security requirements.

### 7.8 npm Distribution Contract

- The publication target is the public npm registry.
- `npx dotenvx-keychain <command>` must run the CLI directly.
- When the package is installed locally, it must provide both `dotenvx-keychain` and `dxk`.
- Runtime execution must not require a global `dotenvx` or extra setup.
- The published tarball must include the artifacts required for CLI execution, plus README and LICENSE.

### 7.9 Key Source Priority and Operational Boundaries

- The key source priority for `run` is: pre-injected key, OS store, then error.
- If a pre-injected key is present for `run`, skip the project-root search from [7.1](#71-project-root-resolution-during-run) and the OS store lookup, and pass that value directly to the child process.
- The key source priority for `init` is: existing OS store value, pre-injected key, existing local `.env.keys`, fresh bootstrap, then error.
- However, if the `init` ID was determined by reusing an existing config file, and none of the OS store, pre-injected key, or local `.env.keys` contains a value, the command must fail as a missing-existing-key case.
- Only when there is no existing config file and no reusable key may `init` execute the bundled `dotenvx` in an isolated temporary directory to generate a new `DOTENV_PRIVATE_KEY` and encrypted `.env`.
- If an encrypted `.env` already exists in the project, `init` must not generate a new key automatically and replace the existing encrypted state.
- v1 has no team-oriented key distribution mechanism.
- In CI/CD or production environments, `DOTENV_PRIVATE_KEY` is expected to be injected directly through the platform-standard secret-management mechanism. This tool does not handle distribution, storage, or sync there.

### 7.10 Performance Target

- In v1, performance evaluation targets only the additional wrapper overhead introduced by `run`.
- Measure additional overhead as the wall-clock difference between running the same command directly with `dotenvx run -- <command>` and running it through `dotenvx-keychain run -- <command>` on the same machine, up to startup completion.
- The measurement conditions assume that `dotenvx` dependency resolution has already completed and exclude first-time `npx` downloads and module installation.
- The key source is either a pre-injected key or an existing OS store entry; key generation through `init` is excluded.
- The child command is a short-lived process equivalent to `node -e "0"`.
- The acceptance target is additional overhead across 20 consecutive runs of median 200 ms or less and p95 500 ms or less.
- Keychain unlock UI, first-time cache generation, and network-caused delays are outside the evaluation scope.

## 8. Command Specifications

### 8.1 `init`

#### 8.1.1 Invocation

```bash
dotenvx-keychain init
dxk init

dotenvx-keychain init <id>
dxk init <id>
```

#### 8.1.2 Input Resolution

The target directory of `init` is the current working directory at execution time.

The ID resolution order is as follows.

1. If an explicit `<id>` argument is provided, use it.
2. If there is no explicit argument and `.dotenvx-keychain` exists in the same directory, use its `id`.
3. Otherwise, auto-generate the ID from the current directory.

During later key resolution, the implementation must distinguish whether the adopted ID came from an explicit argument, existing-config reuse, or auto-generation.

#### 8.1.3 Happy-path Flow

1. Determine the ID to use and whether its source is an explicit argument, existing-config reuse, or auto-generation.
2. If the OS store already contains a key for that ID, reuse it.
3. If step 2 does not apply and the parent process `DOTENV_PRIVATE_KEY` is non-empty, store that value in the OS store.
4. If steps 2 and 3 do not apply and an existing `.env.keys` is present in the project root, obtain `DOTENV_PRIVATE_KEY` from it and store it in the OS store.
5. If steps 2 through 4 do not apply and the ID source is existing-config reuse, fail with a missing-existing-key error.
6. If steps 2 through 5 do not apply and an encrypted `.env` already exists, fail with a missing key for the existing encrypted state.
7. If steps 2 through 6 do not apply, run the bundled `dotenvx` in an isolated temporary directory to generate a new `DOTENV_PRIVATE_KEY` and encrypted `.env`, store that key in the OS store, and then reflect the generated `.env` into the project root.
8. Write `.dotenvx-keychain` in the form `{ "id": "..." }`.
9. Delete `.env.keys` if it exists.
10. Display a success message that includes the ID and the config-file location.

#### 8.1.4 Overwrite Rules

- If an entry for the same ID already exists, overwriting is allowed.
- If a different ID is given explicitly, `.dotenvx-keychain` is updated to the new ID.
- The keychain entry for the old ID is not removed automatically.

#### 8.1.5 Failure Rules

- When reusing an existing config file, if none of the OS store, parent-process environment, or local `.env.keys` provides a key, the command must end with a missing-existing-key error and instruct the user to obtain the key through an approved separate path before retrying.
- If no usable key exists during a new setup, attempt a fresh bootstrap.
- During fresh bootstrap, unrelated variables inherited from the parent environment must not be captured into the generated `.env`.
- If an encrypted `.env` already exists but the corresponding key cannot be obtained, exit without generating a new key automatically.
- If reading a key from local `.env.keys` fails, exit.
- If saving to the OS store fails, exit.
- If reflecting `.env` after fresh bootstrap fails, attempt to roll back the store entry and `.env` updated by that execution.
- Exit on unsupported platforms or when the native store is unavailable.
- If writing the config file fails after store persistence succeeds, attempt to roll back the entry and `.env` updated by that execution.
- If deleting `.env.keys` fails, the command must always exit non-zero, explicitly show the remaining path, and instruct the user to handle it manually.

### 8.2 `run`

#### 8.2.1 Invocation

```bash
dotenvx-keychain run -- <command> [args...]
dxk run -- <command> [args...]
```

- Treat everything after `--` as the child-process command line.
- `run` itself has no alias.
- If no child command is provided, the command must end with a usage error.

#### 8.2.2 ID Resolution

- If the parent process `DOTENV_PRIVATE_KEY` is set to a non-empty value, `run` operates in pre-injected-key mode and must not perform the ID resolution below.

1. Only if there is no pre-injected key, determine the project root according to [7.1](#71-project-root-resolution-during-run).
2. If `.dotenvx-keychain` exists at that root, read its `id`.
3. If not found, auto-generate the ID from that root.

#### 8.2.3 Execution Flow

1. If a pre-injected key exists, use it. Otherwise, retrieve the secret key for the resolved ID from the OS store.
2. Copy the current environment variables and set `DOTENV_PRIVATE_KEY` for the child process.
3. Start `dotenvx run -- <command> [args...]` as a child process.
4. Return the child process exit code or signal unchanged.

#### 8.2.4 Failure Rules

- If a pre-injected key exists, the command must not fail solely because the native store is unavailable.
- If there is no pre-injected key and the key for the resolved ID cannot be found, exit with a message that instructs the user to rerun `init` or inject the key through an approved separate path.
- If starting `dotenvx` fails, exit with a dependency error.
- If the platform is unsupported, or the native store is unavailable while no pre-injected key exists, exit with an environment-prerequisite error.
- If the config file is malformed, exit with a syntax error.
- If the command is used in CI/CD or production without a pre-injected key, exit with a message that instructs the user to inject secrets through the platform-standard mechanism.

### 8.3 `list`

#### 8.3.1 Invocation

```bash
dotenvx-keychain list
dxk ls
```

#### 8.3.2 Behavior

- Enumerate the IDs stored in the `dotenvx-keychain` namespace.
- Write plain text to stdout, one ID per line.
- Sort output in ascending order.
- Do not display the key string, redacted values, or metadata.
- Do not provide JSON output or quiet mode.
- If there are zero entries, the command may exit with stdout left empty.

### 8.4 `remove`

#### 8.4.1 Invocation

```bash
dotenvx-keychain remove <id>
dxk rm <id>
```

#### 8.4.2 Behavior

- Delete only the entry that exactly matches the specified ID.
- Do not modify project files such as `.dotenvx-keychain` or `.env`.
- On successful deletion, display a message that includes the removed ID.
- If the target does not exist, exit with a not-found error.
- Do not prompt for interactive confirmation.

## 9. Exit Codes

- `0`: Success
- `2`: Usage or input-value error
- `3`: The key for the resolved ID was not found, or the required key for an `init` that reuses existing config was not supplied
- `4`: Failure in `dotenvx` or OS store integration
- `5`: Security-relevant post-processing failure, such as failure to delete `.env.keys`

## 10. Security Requirements

- The key string must never appear in stdout, stderr, or logs.
- `list` must not output anything other than the IDs needed to confirm key presence.
- `run` must limit environment-variable injection to the spawned child-process tree.
- `init` must not leave key files in the working tree on completion.
- Even when `init` generates or updates `.env` through fresh bootstrap, it must not capture unrelated values from the parent-process environment.
- Secret values must not appear in exception messages or stack traces.

## 11. Acceptance Criteria

- In a new directory where `.env.keys` already exists, running `init` with no arguments creates `.dotenvx-keychain` with an auto-generated ID and leaves no `.env.keys` behind.
- In a new directory where the local store, `DOTENV_PRIVATE_KEY`, and `.env.keys` are all absent, running `init` with no arguments creates `.dotenvx-keychain` with an auto-generated ID and an encrypted `.env`, and leaves no `.env.keys` behind.
- In a new directory where only a plaintext `.env` exists and the local store, `DOTENV_PRIVATE_KEY`, and `.env.keys` are all absent, running `init` replaces the existing `.env` contents with an encrypted `.env` and stores the corresponding key in the OS store.
- In a directory that already has `.dotenvx-keychain`, running `init` with no arguments reuses the existing `id`.
- In a directory that already has `.dotenvx-keychain`, if the local store has no key, `DOTENV_PRIVATE_KEY` is unset, and `.env.keys` is also absent, running `init` with no arguments exits non-zero without generating a new key.
- In a new directory that already contains an encrypted `.env`, if the corresponding key cannot be obtained from the local store, `DOTENV_PRIVATE_KEY`, or `.env.keys`, the command exits non-zero without generating a new key.
- In a directory that already has `.dotenvx-keychain`, if `DOTENV_PRIVATE_KEY` is set, `init` succeeds by storing that value even when the local store has no key.
- In a new or existing directory, if `.env.keys` exists even though the local store has no key, `init` succeeds by storing the key from that file.
- Running `run` from a child directory still resolves the ancestor directory's `.dotenvx-keychain`.
- If `DOTENV_PRIVATE_KEY` is pre-set, running `run` can start the child process with that value even when `.dotenvx-keychain` or the local store cannot be consulted.
- On each supported OS, macOS, Windows, and Linux, `init`, `run`, `list`, and `remove` behave under the same logical contract.
- `dxk init`, `dxk run -- <command> [args...]`, `dxk ls`, and `dxk rm <id>` behave with the same exit codes and output contract as their canonical counterparts.
- If a tarball generated by `npm pack` is installed into a temporary environment, both `dotenvx-keychain` and `dxk` can start without a global `dotenvx`.
- A tarball generated by `npm pack` includes the artifacts required for CLI execution, plus README and LICENSE.
- Running `run` when no key exists ends non-zero and instructs the user to run `init`.
- If Secret Service is unavailable on native Linux, or Windows Credential Manager integration is unavailable on WSL, the command ends non-zero without falling back to plaintext and reports the cause.
- On unsupported platforms, every command exits with an explicit unsupported-platform error.
- The output of `list` does not include the key string.
- `remove` changes only the keychain and does not modify `.dotenvx-keychain`.
- Across 20 consecutive `run -- node -e "0"` executions, the median additional overhead versus direct `dotenvx run -- node -e "0"` stays at 200 ms or less, and p95 stays at 500 ms or less.

## 12. Future Considerations

- Reevaluate whether support for multiple key formats or multiple namespaces is needed.
- Clarify what automation use cases would justify JSON output or quiet mode.
- Reevaluate whether a safe key-migration path for team sharing is necessary.
- If `dotenvx` adds a safe official interface dedicated to key generation, re-evaluate how much the current placeholder-based bootstrap can be simplified.
