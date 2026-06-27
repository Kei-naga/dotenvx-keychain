import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CONFIG_FILE_NAME, writeConfig } from "../../src/config/configFile.js";
import { initCommand } from "../../src/commands/init.js";
import type { DotenvxAdapter } from "../../src/dotenvx/adapter.js";
import { SecretStoreError } from "../../src/secretStore/interface.js";
import { MockSecretStore } from "../../src/secretStore/mock/mockSecretStore.js";
import { formatSecretStoreUnavailableMessage } from "../../src/secretStore/userMessages.js";

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "dxk-init-"));
  const canonicalDirectory = await realpath(directory);
  tempDirectories.push(canonicalDirectory);
  return canonicalDirectory;
}

function createOutputCapture(): {
  stdout: string[];
  stderr: string[];
  emitStdout: (message: string) => void;
  emitStderr: (message: string) => void;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    stdout,
    stderr,
    emitStdout(message: string) {
      stdout.push(message);
    },
    emitStderr(message: string) {
      stderr.push(message);
    },
  };
}

function createDotenvxAdapter(
  readPrivateKey: (projectRoot: string) => Promise<string | null>,
  bootstrapProjectEnv: DotenvxAdapter["bootstrapProjectEnv"] = async () => {
    throw new Error("bootstrapProjectEnv is not configured for this test");
  },
): DotenvxAdapter {
  return {
    readPrivateKey,
    bootstrapProjectEnv,
  };
}

function createMissingFileError(): NodeJS.ErrnoException {
  const error = new Error("file already removed") as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
}

function createPermissionDeniedError(): NodeJS.ErrnoException {
  const error = new Error("permission denied") as NodeJS.ErrnoException;
  error.code = "EACCES";
  return error;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("initCommand", () => {
  it("reuses an existing store value before checking other key sources", async () => {
    const directory = await createTempDirectory();
    const store = new MockSecretStore([["app-a", "stored-secret"]]);
    const output = createOutputCapture();
    let adapterCalls = 0;

    const exitCode = await initCommand(
      { id: "app-a" },
      {
        cwd: directory,
        stdout: output.emitStdout,
        stderr: output.emitStderr,
        secretStoreFactory: {
          create: async () => store,
        },
        dotenvxAdapter: createDotenvxAdapter(async () => {
          adapterCalls += 1;
          return "adapter-secret";
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(adapterCalls).toBe(0);
    expect(output.stderr).toEqual([]);
    expect([...output.stdout, ...output.stderr].join("\n")).not.toContain(
      "stored-secret",
    );
    await expect(
      readFile(path.join(directory, CONFIG_FILE_NAME), "utf8"),
    ).resolves.toBe('{\n  "id": "app-a"\n}\n');
  });

  it("stores the parent DOTENV_PRIVATE_KEY when the store is empty", async () => {
    const directory = await createTempDirectory();
    const store = new MockSecretStore();
    const output = createOutputCapture();

    const exitCode = await initCommand(
      { id: "app-a" },
      {
        cwd: directory,
        env: {
          DOTENV_PRIVATE_KEY: "from-env",
        },
        stdout: output.emitStdout,
        stderr: output.emitStderr,
        secretStoreFactory: {
          create: async () => store,
        },
        dotenvxAdapter: createDotenvxAdapter(async () => null),
      },
    );

    expect(exitCode).toBe(0);
    await expect(store.get("app-a")).resolves.toBe("from-env");
    expect(output.stdout).toEqual([
      "Initialized dotenvx-keychain with id: app-a",
      "Wrote config: .dotenvx-keychain",
    ]);
  });

  it("reads a local dotenvx key and deletes .env.keys after success", async () => {
    const directory = await createTempDirectory();
    const envKeysPath = path.join(directory, ".env.keys");
    const store = new MockSecretStore();
    const output = createOutputCapture();

    await writeFile(envKeysPath, "placeholder", "utf8");

    const exitCode = await initCommand(
      { id: "app-a" },
      {
        cwd: directory,
        stdout: output.emitStdout,
        stderr: output.emitStderr,
        secretStoreFactory: {
          create: async () => store,
        },
        dotenvxAdapter: createDotenvxAdapter(async () => "from-local-dotenvx"),
      },
    );

    expect(exitCode).toBe(0);
    await expect(store.get("app-a")).resolves.toBe("from-local-dotenvx");
    expect([...output.stdout, ...output.stderr].join("\n")).not.toContain(
      "from-local-dotenvx",
    );
    await expect(
      readFile(path.join(directory, CONFIG_FILE_NAME), "utf8"),
    ).resolves.toBe('{\n  "id": "app-a"\n}\n');
    await expect(readFile(envKeysPath, "utf8")).rejects.toBeTruthy();
  });

  it("bootstraps a new project when no key source is available", async () => {
    const directory = await createTempDirectory();
    const envPath = path.join(directory, ".env");
    const store = new MockSecretStore();
    const output = createOutputCapture();

    const exitCode = await initCommand(
      { id: "app-a" },
      {
        cwd: directory,
        stdout: output.emitStdout,
        stderr: output.emitStderr,
        secretStoreFactory: {
          create: async () => store,
        },
        dotenvxAdapter: createDotenvxAdapter(
          async () => null,
          async () => ({
            privateKey: "generated-private-key",
            encryptedEnvContents:
              'DOTENV_PUBLIC_KEY="public"\nHELLO=encrypted:value\n',
          }),
        ),
      },
    );

    expect(exitCode).toBe(0);
    await expect(store.get("app-a")).resolves.toBe("generated-private-key");
    await expect(readFile(envPath, "utf8")).resolves.toContain(
      "HELLO=encrypted:value",
    );
    expect(output.stderr).toEqual([]);
    expect([...output.stdout, ...output.stderr].join("\n")).not.toContain(
      "generated-private-key",
    );
  });

  it("returns exit 4 when reading the existing .env for bootstrap rollback fails", async () => {
    const directory = await createTempDirectory();
    const store = new MockSecretStore();
    const output = createOutputCapture();
    let readCalls = 0;

    const exitCode = await initCommand(
      { id: "app-a" },
      {
        cwd: directory,
        stdout: output.emitStdout,
        stderr: output.emitStderr,
        secretStoreFactory: {
          create: async () => store,
        },
        dotenvxAdapter: createDotenvxAdapter(
          async () => null,
          async () => ({
            privateKey: "generated-private-key",
            encryptedEnvContents:
              'DOTENV_PUBLIC_KEY="public"\nHELLO=encrypted:value\n',
          }),
        ),
        readTextFile: async () => {
          readCalls += 1;

          if (readCalls === 1) {
            return "HELLO=world\n";
          }

          throw createPermissionDeniedError();
        },
      },
    );

    expect(exitCode).toBe(4);
    await expect(store.get("app-a")).resolves.toBeNull();
    expect(output.stderr).toEqual(["Failed to read project env: .env"]);
    expect([...output.stdout, ...output.stderr].join("\n")).not.toContain(
      "generated-private-key",
    );
  });

  it("restores the original .env when bootstrap succeeds but config writing fails", async () => {
    const directory = await createTempDirectory();
    const envPath = path.join(directory, ".env");
    const store = new MockSecretStore();
    const output = createOutputCapture();

    await writeFile(envPath, "HELLO=world\n", "utf8");

    const exitCode = await initCommand(
      { id: "app-a" },
      {
        cwd: directory,
        stdout: output.emitStdout,
        stderr: output.emitStderr,
        secretStoreFactory: {
          create: async () => store,
        },
        dotenvxAdapter: createDotenvxAdapter(
          async () => null,
          async () => ({
            privateKey: "generated-private-key",
            encryptedEnvContents:
              'DOTENV_PUBLIC_KEY="public"\nHELLO=encrypted:value\n',
          }),
        ),
        writeConfig: async () => {
          throw new Error("write failed");
        },
      },
    );

    expect(exitCode).toBe(4);
    await expect(store.get("app-a")).resolves.toBeNull();
    await expect(readFile(envPath, "utf8")).resolves.toBe("HELLO=world\n");
    expect(output.stderr).toContain(
      "Failed to write config: .dotenvx-keychain",
    );
  });

  it("does not bootstrap an encrypted .env when no key source is available", async () => {
    const directory = await createTempDirectory();
    const envPath = path.join(directory, ".env");
    const store = new MockSecretStore();
    const output = createOutputCapture();
    let bootstrapCalls = 0;

    await writeFile(
      envPath,
      'DOTENV_PUBLIC_KEY="public"\nHELLO=encrypted:value\n',
      "utf8",
    );

    const exitCode = await initCommand(
      { id: "app-a" },
      {
        cwd: directory,
        stdout: output.emitStdout,
        stderr: output.emitStderr,
        secretStoreFactory: {
          create: async () => store,
        },
        dotenvxAdapter: createDotenvxAdapter(async () => null, async () => {
          bootstrapCalls += 1;
          return {
            privateKey: "generated-private-key",
            encryptedEnvContents:
              'DOTENV_PUBLIC_KEY="public"\nHELLO=encrypted:new-value\n',
          };
        }),
      },
    );

    expect(exitCode).toBe(3);
    expect(bootstrapCalls).toBe(0);
    expect(output.stderr).toEqual([
      "No reusable key was found for the existing encrypted .env.",
      "Provide DOTENV_PRIVATE_KEY or restore .env.keys before running init again.",
    ]);
    await expect(readFile(envPath, "utf8")).resolves.toBe(
      'DOTENV_PUBLIC_KEY="public"\nHELLO=encrypted:value\n',
    );
  });

  it("bootstraps when a plaintext .env only mentions encrypted markers", async () => {
    const directory = await createTempDirectory();
    const envPath = path.join(directory, ".env");
    const store = new MockSecretStore();
    const output = createOutputCapture();
    let bootstrapCalls = 0;

    await writeFile(
      envPath,
      [
        "# DOTENV_PUBLIC_KEY=mentioned-in-comment",
        "MESSAGE=DOTENV_PUBLIC_KEY is documented here",
        "NOTE=plaintext example with =encrypted: in the middle",
        "HELLO=world",
        "",
      ].join("\n"),
      "utf8",
    );

    const exitCode = await initCommand(
      { id: "app-a" },
      {
        cwd: directory,
        stdout: output.emitStdout,
        stderr: output.emitStderr,
        secretStoreFactory: {
          create: async () => store,
        },
        dotenvxAdapter: createDotenvxAdapter(async () => null, async () => {
          bootstrapCalls += 1;
          return {
            privateKey: "generated-private-key",
            encryptedEnvContents:
              'DOTENV_PUBLIC_KEY="public"\nHELLO=encrypted:value\n',
          };
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(bootstrapCalls).toBe(1);
    await expect(store.get("app-a")).resolves.toBe("generated-private-key");
    expect(output.stderr).toEqual([]);
    await expect(readFile(envPath, "utf8")).resolves.toBe(
      'DOTENV_PUBLIC_KEY="public"\nHELLO=encrypted:value\n',
    );
  });

  it("rolls back the stored key when config writing fails", async () => {
    const directory = await createTempDirectory();
    const store = new MockSecretStore();
    const output = createOutputCapture();

    const exitCode = await initCommand(
      { id: "app-a" },
      {
        cwd: directory,
        env: {
          DOTENV_PRIVATE_KEY: "from-env",
        },
        stdout: output.emitStdout,
        stderr: output.emitStderr,
        secretStoreFactory: {
          create: async () => store,
        },
        dotenvxAdapter: createDotenvxAdapter(async () => null),
        writeConfig: async () => {
          throw new Error("write failed");
        },
      },
    );

    expect(exitCode).toBe(4);
    await expect(store.get("app-a")).resolves.toBeNull();
    expect(output.stderr).toContain(
      "Failed to write config: .dotenvx-keychain",
    );
    expect([...output.stdout, ...output.stderr].join("\n")).not.toContain(
      "from-env",
    );
  });

  it("returns exit 5 when removing .env.keys fails after success", async () => {
    const directory = await createTempDirectory();
    const envKeysPath = path.join(directory, ".env.keys");
    const store = new MockSecretStore();
    const output = createOutputCapture();

    await writeFile(envKeysPath, "placeholder", "utf8");

    const exitCode = await initCommand(
      { id: "app-a" },
      {
        cwd: directory,
        env: {
          DOTENV_PRIVATE_KEY: "from-env",
        },
        stdout: output.emitStdout,
        stderr: output.emitStderr,
        secretStoreFactory: {
          create: async () => store,
        },
        dotenvxAdapter: createDotenvxAdapter(async () => null),
        deleteFile: async () => {
          throw new Error("cannot delete");
        },
      },
    );

    expect(exitCode).toBe(5);
    expect(output.stderr).toContain(
      `Failed to remove local key file: ${envKeysPath}`,
    );
  });

  it("ignores ENOENT when .env.keys is already gone during cleanup", async () => {
    const directory = await createTempDirectory();
    const envKeysPath = path.join(directory, ".env.keys");
    const store = new MockSecretStore();
    const output = createOutputCapture();

    await writeFile(envKeysPath, "placeholder", "utf8");

    const exitCode = await initCommand(
      { id: "app-a" },
      {
        cwd: directory,
        env: {
          DOTENV_PRIVATE_KEY: "from-env",
        },
        stdout: output.emitStdout,
        stderr: output.emitStderr,
        secretStoreFactory: {
          create: async () => store,
        },
        dotenvxAdapter: createDotenvxAdapter(async () => null),
        deleteFile: async (filePath) => {
          await rm(filePath, { force: true });
          throw createMissingFileError();
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(output.stderr).toEqual([]);
    await expect(readFile(envKeysPath, "utf8")).rejects.toBeTruthy();
  });

  it("returns exit 3 when no key source is available for an existing config", async () => {
    const directory = await createTempDirectory();
    const store = new MockSecretStore();
    const output = createOutputCapture();

    await writeConfig(directory, "app-a");

    const exitCode = await initCommand(
      {},
      {
        cwd: directory,
        stdout: output.emitStdout,
        stderr: output.emitStderr,
        secretStoreFactory: {
          create: async () => store,
        },
        dotenvxAdapter: createDotenvxAdapter(async () => null),
      },
    );

    expect(exitCode).toBe(3);
    expect(output.stderr[0]).toBe("No key found for id: app-a");
  });

  it("fails safely when the native secret store is unavailable", async () => {
    const directory = await createTempDirectory();
    const output = createOutputCapture();

    const exitCode = await initCommand(
      { id: "app-a" },
      {
        cwd: directory,
        env: {
          DOTENV_PRIVATE_KEY: "from-env",
        },
        stdout: output.emitStdout,
        stderr: output.emitStderr,
        secretStoreFactory: {
          create: async () => {
            throw new SecretStoreError(
              "backend-unavailable",
              "backend unavailable",
            );
          },
        },
        dotenvxAdapter: createDotenvxAdapter(async () => null),
      },
    );

    expect(exitCode).toBe(4);
    expect(output.stderr).toEqual([formatSecretStoreUnavailableMessage()]);
    expect([...output.stdout, ...output.stderr].join("\n")).not.toContain(
      "from-env",
    );
  });
});
