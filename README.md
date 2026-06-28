# dotenvx-keychain

`dotenvx-keychain` is a thin CLI wrapper around `dotenvx` for local development.
It keeps `DOTENV_PRIVATE_KEY` out of your working tree by storing it in the
native OS secret store and injecting it only into the command you run.

Use it when you want encrypted `.env` files from `dotenvx` without leaving
`.env.keys` in a repository that local tools or coding agents can read.

## Quick Start

Node.js 20 or newer is required.

You can install `dotenvx-keychain` from npm:

```bash
npm install --save-dev dotenvx-keychain
npx dxk init
npx dxk set HELLO world
npx dxk get HELLO
npx dxk run -- node app.js
```

You can also invoke the published package directly for one-off usage:

```bash
npx dotenvx-keychain init
npx dotenvx-keychain set HELLO world
npx dotenvx-keychain get HELLO
npx dotenvx-keychain run -- node app.js
```

Use a custom shared ID when you want multiple checkouts or teammates to target
the same stored key:

```bash
npx dotenvx-keychain init my-app-v2
```

No separate global `dotenvx` install is required. `dotenvx-keychain` runs the
bundled `dotenvx` dependency for you.

## Typical Workflows

### Start a new project

1. Run `init` in the project root.
2. Let `init` create or connect `.dotenvx-keychain` and store the private key in your OS secret store.
3. Start your app or script with `run`.
4. Commit `.dotenvx-keychain` and your encrypted `.env`, but do not commit `.env.keys`.

Example:

```bash
npx dotenvx-keychain init
npx dotenvx-keychain run -- npm run dev
```

### Join an existing project

1. Clone the project and keep the committed `.dotenvx-keychain` file.
2. Receive the current `DOTENV_PRIVATE_KEY` through an approved channel, or make sure it already exists in your local secret store.
3. Run `init` in the project so the local machine is connected to the existing key relationship.
4. Start the app with `run`.

Example:

```bash
export DOTENV_PRIVATE_KEY='...'
npx dotenvx-keychain init
npx dotenvx-keychain run -- node app.js
```

For an existing encrypted project, `init` reuses the current key relationship.
It does not silently generate a different key and overwrite the project setup.

## Commands

### `init [id]`

Use `init` to connect a project to a stored `DOTENV_PRIVATE_KEY`.

- Without an argument, `init` creates `.dotenvx-keychain` with an auto-generated project ID.
- With an explicit ID, `init` uses that shared ID instead.
- On a new project, `init` can bootstrap the first encrypted `.env` and move the generated key into the native secret store.
- On an existing project, `init` reuses the current key relationship instead of silently rotating to a new key.
- If you are joining an existing project, `init` expects the current key to come from your local secret store, the parent `DOTENV_PRIVATE_KEY`, or an existing `.env.keys` file.

Examples:

```bash
npx dotenvx-keychain init
npx dotenvx-keychain init my-app-v2
```

### `run -- <command> [args...]`

Use `run` when you want to start an app, script, or tool with the stored
`DOTENV_PRIVATE_KEY` available only to that child process.

- `run` resolves the project ID from `.dotenvx-keychain` and executes bundled `dotenvx run -- <command>`.
- `run` searches upward from the current directory and uses the nearest `.dotenvx-keychain`, so it also works from project subdirectories.
- You can use it for local app startup, scripts, tests, or any other command that needs dotenvx decryption.
- If `DOTENV_PRIVATE_KEY` is already set in the parent environment, `run` uses that value and skips local config and secret-store lookup.

Examples:

```bash
npx dotenvx-keychain run -- node app.js
npx dotenvx-keychain run -- npm run dev
npx dxk run -- vitest
```

### `set <key> <value>`

Use `set` when you want to update a single encrypted `.env` value through the
bundled `dotenvx set` command.

- `set` accepts exactly two positional arguments: a key and a value.
- `set` searches upward from the current directory, resolves the nearest `.dotenvx-keychain`, and runs from that project root because it modifies project files.
- If `DOTENV_PRIVATE_KEY` is already set in the parent environment, `set` still resolves the project root but skips local secret-store lookup.
- v1 provides no command alias, JSON mode, or quiet mode for `set`.

Examples:

```bash
npx dotenvx-keychain set HELLO world
npx dxk set API_URL https://example.test
```

### `get <key>`

Use `get` when you want to print a single decrypted `.env` value through the
bundled `dotenvx get` command.

- `get` accepts exactly one positional argument.
- `get` resolves the project root the same way as `set` and executes from that resolved root.
- If `DOTENV_PRIVATE_KEY` is already set in the parent environment, `get` still resolves the project root but skips local secret-store lookup.
- `get` intentionally prints the requested value to stdout.
- The wrapper never prints `DOTENV_PRIVATE_KEY`.

> [!TIP]
> If you use AI agents or editor tooling that can execute commands, consider adding `dotenvx-keychain get` and `dxk get` to that tool's blocked-command list or denylist, because `get` prints plaintext values and should be treated as a security-sensitive command.

Examples:

```bash
npx dotenvx-keychain get HELLO
npx dxk get API_URL
```

### `list` / `ls`

Use `list` to see which project IDs are currently stored on this machine.
This prints IDs only, never the secret value itself.
It reflects the local secret store only.

Example:

```bash
npx dotenvx-keychain list
npx dxk ls
```

### `remove <id>` / `rm <id>`

Use `remove` when an ID is no longer needed on the current machine, such as
after renaming a project ID or cleaning up an old checkout.
It removes the stored key entry only and does not edit `.dotenvx-keychain` or
other project files.

Example:

```bash
npx dotenvx-keychain remove my-app-v2
npx dxk rm my-app-v2
```

## What Gets Stored

- `.dotenvx-keychain` stores only the project ID and is safe to commit.
- `DOTENV_PRIVATE_KEY` is stored only in the native OS secret store.
- `run` injects `DOTENV_PRIVATE_KEY` into the spawned child process only.
- `set` and `get` operate on encrypted `.env` contents through the bundled `dotenvx`; they do not create raw per-variable keychain entries.
- `get` may print the requested decrypted value to stdout, but `DOTENV_PRIVATE_KEY` remains stored only in the native OS secret store and is never printed by the wrapper.
- Successful `init` should not leave `.env.keys` in the project root.

## Platform Support

- `darwin`: uses the macOS login keychain.
- `win32`: uses Windows Credential Manager.
- native `linux`: requires `libsecret-1.so.0`, a working D-Bus session, and a Secret Service compatible store.
- `linux` on WSL: uses the current Windows user session's Credential Manager through `powershell.exe` interop while still requiring Linux-native Node.js and npm inside WSL.
- other platforms: unsupported and expected to fail explicitly.

On Ubuntu or Debian based Linux environments, the verified runtime package set
was:

```bash
sudo apt-get install -y libsecret-1-0 gnome-keyring libsecret-tools
```

For Linux and WSL prerequisites, troubleshooting, and the forced-Linux WSL
diagnostic flow, see:

- <https://github.com/Kei-naga/dotenvx-keychain/blob/main/docs/linux-secret-service.md>

## Troubleshooting

- Key not found: if `run` or `init` says the key is missing for an existing project, get the current `DOTENV_PRIVATE_KEY` through your team's approved path, export it temporarily, and run `init` again.
- Secret store unavailable: this tool does not fall back to plaintext files. On Linux or WSL, check the platform prerequisites above and the Linux / WSL guide.
- WSL toolchain issues: use Linux-native `node` and `npm` inside WSL. If `command -v npm` points into `/mnt/c/...`, switch to the Linux toolchain before running `dotenvx-keychain`.

## CI And Production

`dotenvx-keychain` is for local development. In CI and production, inject
`DOTENV_PRIVATE_KEY` from your platform secret manager or environment instead of
depending on a local OS secret store.

If `DOTENV_PRIVATE_KEY` is already present, `run` will honor it and skip local
config and secret-store lookup. `set` and `get` will honor it for key
resolution while still resolving the nearest project root before they touch
project files.
