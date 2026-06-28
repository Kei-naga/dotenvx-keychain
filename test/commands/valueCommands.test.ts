import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeConfig } from "../../src/config/configFile.js";
import { createAutoIdFromRealPath } from "../../src/config/id.js";
import { getCommand } from "../../src/commands/get.js";
import { setCommand } from "../../src/commands/set.js";
import { MockSecretStore } from "../../src/secretStore/mock/mockSecretStore.js";

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "dxk-values-"));
  const canonicalDirectory = await realpath(directory);
  tempDirectories.push(canonicalDirectory);
  return canonicalDirectory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("setCommand", () => {
  it("reads the nearest config, uses the stored key, and executes in the project root", async () => {
    const rootDirectory = await createTempDirectory();
    const projectRoot = path.join(rootDirectory, "apps");
    const childDirectory = path.join(projectRoot, "web");
    const store = new MockSecretStore([["child-id", "stored-secret"]]);
    const stderr: string[] = [];

    await mkdir(childDirectory, { recursive: true });
    await writeConfig(projectRoot, "child-id");

    const exitCode = await setCommand(
      { key: "HELLO", value: "world" },
      {
        cwd: childDirectory,
        env: {
          PATH: process.env.PATH,
        },
        stderr: (message) => {
          stderr.push(message);
        },
        secretStoreFactory: {
          create: async () => store,
        },
        resolveDotenvxBinary: async () => "/fake/dotenvx.js",
        runProcess: async (options) => {
          expect(options.cwd).toBe(projectRoot);
          expect(options.args).toEqual([
            "/fake/dotenvx.js",
            "set",
            "HELLO",
            "world",
          ]);
          expect(options.env.DOTENV_PRIVATE_KEY).toBe("stored-secret");
          return { exitCode: 0, signal: null };
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
  });

  it("falls back to an automatic ID when no config file exists", async () => {
    const directory = await createTempDirectory();
    const autoId = createAutoIdFromRealPath(directory);
    const store = new MockSecretStore([[autoId, "stored-secret"]]);

    const exitCode = await setCommand(
      { key: "HELLO", value: "world" },
      {
        cwd: directory,
        env: {
          PATH: process.env.PATH,
        },
        secretStoreFactory: {
          create: async () => store,
        },
        resolveDotenvxBinary: async () => "/fake/dotenvx.js",
        runProcess: async (options) => {
          expect(options.cwd).toBe(directory);
          expect(options.env.DOTENV_PRIVATE_KEY).toBe("stored-secret");
          return { exitCode: 0, signal: null };
        },
      },
    );

    expect(exitCode).toBe(0);
  });

  it("returns exit 3 when no stored key exists", async () => {
    const directory = await createTempDirectory();
    const stderr: string[] = [];

    await writeConfig(directory, "app-a");

    const exitCode = await setCommand(
      { key: "HELLO", value: "world" },
      {
        cwd: directory,
        env: {
          PATH: process.env.PATH,
        },
        stderr: (message) => {
          stderr.push(message);
        },
        secretStoreFactory: {
          create: async () => new MockSecretStore(),
        },
      },
    );

    expect(exitCode).toBe(3);
    expect(stderr).toEqual([
      "No key found for id: app-a",
      "Run `dotenvx-keychain init` in the project root to register a key.",
    ]);
  });
});

describe("getCommand", () => {
  it("uses a pre-injected key, skips store lookup, and still executes in the nearest project root", async () => {
    const rootDirectory = await createTempDirectory();
    const projectRoot = path.join(rootDirectory, "apps");
    const childDirectory = path.join(projectRoot, "web");
    const stderr: string[] = [];
    let factoryCalls = 0;

    await mkdir(childDirectory, { recursive: true });
    await writeConfig(projectRoot, "child-id");

    const exitCode = await getCommand(
      { key: "HELLO" },
      {
        cwd: childDirectory,
        env: {
          DOTENV_PRIVATE_KEY: "pre-injected",
          PATH: process.env.PATH,
        },
        stderr: (message) => {
          stderr.push(message);
        },
        secretStoreFactory: {
          create: async () => {
            factoryCalls += 1;
            return new MockSecretStore();
          },
        },
        resolveDotenvxBinary: async () => "/fake/dotenvx.js",
        runProcess: async (options) => {
          expect(options.cwd).toBe(projectRoot);
          expect(options.args).toEqual(["/fake/dotenvx.js", "get", "HELLO"]);
          expect(options.env.DOTENV_PRIVATE_KEY).toBe("pre-injected");
          return { exitCode: 7, signal: null };
        },
      },
    );

    expect(exitCode).toBe(7);
    expect(factoryCalls).toBe(0);
    expect(stderr.join("\n")).not.toContain("pre-injected");
  });

  it("returns exit 4 for an invalid config even when DOTENV_PRIVATE_KEY is pre-injected", async () => {
    const directory = await createTempDirectory();
    const stderr: string[] = [];

    await writeFile(
      path.join(directory, ".dotenvx-keychain"),
      "{bad json",
      "utf8",
    );

    const exitCode = await getCommand(
      { key: "HELLO" },
      {
        cwd: directory,
        env: {
          DOTENV_PRIVATE_KEY: "pre-injected",
          PATH: process.env.PATH,
        },
        stderr: (message) => {
          stderr.push(message);
        },
      },
    );

    expect(exitCode).toBe(4);
    expect(stderr[0]).toContain("Invalid config file:");
    expect(stderr.join("\n")).not.toContain("pre-injected");
  });

  it("does not print a stored key when dotenvx resolution fails", async () => {
    const directory = await createTempDirectory();
    const stderr: string[] = [];

    await writeConfig(directory, "app-a");

    const exitCode = await getCommand(
      { key: "HELLO" },
      {
        cwd: directory,
        env: {
          PATH: process.env.PATH,
        },
        stderr: (message) => {
          stderr.push(message);
        },
        secretStoreFactory: {
          create: async () => new MockSecretStore([["app-a", "stored-secret"]]),
        },
        resolveDotenvxBinary: async () => {
          throw new Error("resolution failed");
        },
      },
    );

    expect(exitCode).toBe(4);
    expect(stderr).toContain("The bundled dotenvx dependency is unavailable.");
    expect(stderr.join("\n")).not.toContain("stored-secret");
  });
});
