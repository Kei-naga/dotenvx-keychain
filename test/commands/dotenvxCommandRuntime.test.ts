import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeConfig } from "../../src/config/configFile.js";
import { CLI_EXIT_CODE } from "../../src/cli/exitCodes.js";
import { resolveProjectContext } from "../../src/commands/dotenvxCommandRuntime.js";

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "dxk-command-runtime-"));
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

describe("resolveProjectContext", () => {
  it("returns infrastructure failure when config reading throws an unexpected error", async () => {
    const directory = await createTempDirectory();

    await writeConfig(directory, "app-a");

    const result = await resolveProjectContext(directory, {
      readConfig: async () => {
        throw new Error("unexpected config failure");
      },
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        exitCode: CLI_EXIT_CODE.infrastructure,
        messages: [
          `Failed to read config: ${path.join(directory, ".dotenvx-keychain")}`,
        ],
      },
    });
  });
});
