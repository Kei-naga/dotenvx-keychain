import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeConfig } from "../../src/config/configFile.js";
import { createAutoIdFromRealPath } from "../../src/config/id.js";
import { runCommand } from "../../src/commands/run.js";
import { MockSecretStore } from "../../src/secretStore/mock/mockSecretStore.js";

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "dxk-run-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("runCommand", () => {
  it("bypasses config and store lookup when DOTENV_PRIVATE_KEY is pre-injected", async () => {
    const directory = await createTempDirectory();
    let factoryCalls = 0;
    const output: string[] = [];

    const exitCode = await runCommand(
      { command: "node", args: ["app.js"] },
      {
        cwd: directory,
        env: {
          DOTENV_PRIVATE_KEY: "pre-injected",
          PATH: process.env.PATH,
        },
        secretStoreFactory: {
          create: async () => {
            factoryCalls += 1;
            return new MockSecretStore();
          },
        },
        stderr: (message) => {
          output.push(message);
        },
        resolveDotenvxBinary: async () => "C:/fake/dotenvx.js",
        runProcess: async (options) => {
          expect(options.args).toEqual([
            "C:/fake/dotenvx.js",
            "run",
            "--",
            "node",
            "app.js",
          ]);
          expect(options.env.DOTENV_PRIVATE_KEY).toBe("pre-injected");
          return { exitCode: 0, signal: null };
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(factoryCalls).toBe(0);
    expect(output.join("\n")).not.toContain("pre-injected");
  });

  it("reads the nearest config and uses the stored key", async () => {
    const rootDirectory = await createTempDirectory();
    const childDirectory = path.join(rootDirectory, "apps", "web");
    const store = new MockSecretStore([["child-id", "stored-secret"]]);
    const output: string[] = [];

    await mkdir(childDirectory, { recursive: true });
    await writeConfig(path.join(rootDirectory, "apps"), "child-id");

    const exitCode = await runCommand(
      { command: "node", args: ["app.js"] },
      {
        cwd: childDirectory,
        env: {
          PATH: process.env.PATH,
        },
        stderr: (message) => {
          output.push(message);
        },
        secretStoreFactory: {
          create: async () => store,
        },
        resolveDotenvxBinary: async () => "C:/fake/dotenvx.js",
        runProcess: async (options) => {
          expect(options.cwd).toBe(childDirectory);
          expect(options.env.DOTENV_PRIVATE_KEY).toBe("stored-secret");
          return { exitCode: 7, signal: null };
        },
      },
    );

    expect(exitCode).toBe(7);
    expect(output.join("\n")).not.toContain("stored-secret");
  });

  it("does not print a pre-injected key when dotenvx resolution fails", async () => {
    const directory = await createTempDirectory();
    const output: string[] = [];

    const exitCode = await runCommand(
      { command: "node", args: ["app.js"] },
      {
        cwd: directory,
        env: {
          DOTENV_PRIVATE_KEY: "pre-injected",
          PATH: process.env.PATH,
        },
        stderr: (message) => {
          output.push(message);
        },
        resolveDotenvxBinary: async () => {
          throw new Error("resolution failed");
        },
      },
    );

    expect(exitCode).toBe(4);
    expect(output).toContain("The bundled dotenvx dependency is unavailable.");
    expect(output.join("\n")).not.toContain("pre-injected");
  });

  it("does not print a stored key when dotenvx resolution fails", async () => {
    const directory = await createTempDirectory();
    const output: string[] = [];

    await writeConfig(directory, "app-a");

    const exitCode = await runCommand(
      { command: "node", args: ["app.js"] },
      {
        cwd: directory,
        env: {
          PATH: process.env.PATH,
        },
        stderr: (message) => {
          output.push(message);
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
    expect(output).toContain("The bundled dotenvx dependency is unavailable.");
    expect(output.join("\n")).not.toContain("stored-secret");
  });

  it("falls back to an automatic ID when no config file exists", async () => {
    const directory = await createTempDirectory();
    const autoId = createAutoIdFromRealPath(directory);
    const store = new MockSecretStore([[autoId, "stored-secret"]]);

    const exitCode = await runCommand(
      { command: "node", args: ["app.js"] },
      {
        cwd: directory,
        env: {
          PATH: process.env.PATH,
        },
        secretStoreFactory: {
          create: async () => store,
        },
        resolveDotenvxBinary: async () => "C:/fake/dotenvx.js",
        runProcess: async (options) => {
          expect(options.env.DOTENV_PRIVATE_KEY).toBe("stored-secret");
          return { exitCode: 0, signal: null };
        },
      },
    );

    expect(exitCode).toBe(0);
  });

  it("fails when the config file is invalid", async () => {
    const directory = await createTempDirectory();
    const output: string[] = [];

    await writeFile(
      path.join(directory, ".dotenvx-keychain"),
      "{bad json",
      "utf8",
    );

    const exitCode = await runCommand(
      { command: "node", args: ["app.js"] },
      {
        cwd: directory,
        env: {
          PATH: process.env.PATH,
        },
        stderr: (message) => {
          output.push(message);
        },
      },
    );

    expect(exitCode).toBe(4);
    expect(output[0]).toContain("Invalid config file:");
  });

  it("returns exit 3 when no stored key exists", async () => {
    const directory = await createTempDirectory();
    const output: string[] = [];

    await writeConfig(directory, "app-a");

    const exitCode = await runCommand(
      { command: "node", args: ["app.js"] },
      {
        cwd: directory,
        env: {
          PATH: process.env.PATH,
        },
        stderr: (message) => {
          output.push(message);
        },
        secretStoreFactory: {
          create: async () => new MockSecretStore(),
        },
      },
    );

    expect(exitCode).toBe(3);
    expect(output[0]).toBe("No key found for id: app-a");
  });
});
