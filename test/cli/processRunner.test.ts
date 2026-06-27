import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  resolveWindowsCommandPath,
  shouldUseWindowsShell,
} from "../../src/cli/processRunner.js";

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "dxk-process-runner-"));
  tempDirectories.push(directory);
  return directory;
}

async function createFile(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "", "utf8");
}

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("resolveWindowsCommandPath", () => {
  it("resolves a path-like command from the current working directory", async () => {
    const directory = await createTempDirectory();
    const commandPath = path.join(directory, "scripts", "deploy.cmd");

    await createFile(commandPath);

    await expect(
      resolveWindowsCommandPath("./scripts/deploy", directory, {
        PATH: "",
        PATHEXT: ".EXE;.CMD;.BAT",
      }),
    ).resolves.toBe(commandPath);
  });

  it("resolves PATH entries using Windows executable extensions", async () => {
    const directory = await createTempDirectory();
    const binDirectory = path.join(directory, "bin");
    const commandPath = path.join(binDirectory, "dotenvx-keychain.bat");

    await createFile(commandPath);

    await expect(
      resolveWindowsCommandPath("dotenvx-keychain", directory, {
        PATH: binDirectory,
        PATHEXT: ".EXE;.BAT;.CMD",
      }),
    ).resolves.toBe(commandPath);
  });
});

describe("shouldUseWindowsShell", () => {
  it("returns true for .cmd and .bat commands", async () => {
    const directory = await createTempDirectory();
    const binDirectory = path.join(directory, "bin");

    await createFile(path.join(binDirectory, "first.cmd"));
    await createFile(path.join(binDirectory, "second.bat"));

    await expect(
      shouldUseWindowsShell("first", directory, {
        PATH: binDirectory,
        PATHEXT: ".CMD;.EXE;.BAT",
      }),
    ).resolves.toBe(true);

    await expect(
      shouldUseWindowsShell("second", directory, {
        PATH: binDirectory,
        PATHEXT: ".EXE;.BAT;.CMD",
      }),
    ).resolves.toBe(true);
  });

  it("returns false for non-shell Windows executables", async () => {
    const directory = await createTempDirectory();
    const binDirectory = path.join(directory, "bin");

    await createFile(path.join(binDirectory, "node.exe"));

    await expect(
      shouldUseWindowsShell("node", directory, {
        PATH: binDirectory,
        PATHEXT: ".EXE;.CMD;.BAT",
      }),
    ).resolves.toBe(false);
  });

  it("throws when the command cannot be resolved", async () => {
    const directory = await createTempDirectory();

    await expect(
      shouldUseWindowsShell("missing-command", directory, {
        PATH: "",
        PATHEXT: ".EXE;.CMD;.BAT",
      }),
    ).rejects.toThrow("Failed to resolve command: missing-command");
  });
});
