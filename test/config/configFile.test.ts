import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CONFIG_FILE_NAME,
  ReadConfigError,
  getConfigPath,
  readConfig,
  writeConfig,
} from "../../src/config/configFile.js";

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "dxk-config-"));
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

describe("readConfig", () => {
  it("reads valid config files and ignores extra keys", async () => {
    const directory = await createTempDirectory();
    const filePath = path.join(directory, CONFIG_FILE_NAME);

    await writeFile(
      filePath,
      '\ufeff{\n  "id": "my-app-v2",\n  "ignored": true\n}\n',
      "utf8",
    );

    await expect(readConfig(filePath)).resolves.toEqual({
      id: "my-app-v2",
      path: filePath,
    });
  });

  it("classifies missing config files as not-found", async () => {
    const directory = await createTempDirectory();
    const filePath = path.join(directory, CONFIG_FILE_NAME);

    await expect(readConfig(filePath)).rejects.toMatchObject<
      Partial<ReadConfigError>
    >({
      code: "not-found",
      path: filePath,
    });
  });

  it("classifies JSON parse failures as invalid-json", async () => {
    const directory = await createTempDirectory();
    const filePath = path.join(directory, CONFIG_FILE_NAME);

    await writeFile(filePath, '{"id":', "utf8");

    await expect(readConfig(filePath)).rejects.toMatchObject<
      Partial<ReadConfigError>
    >({
      code: "invalid-json",
      path: filePath,
    });
  });

  it("classifies invalid IDs as invalid-schema", async () => {
    const directory = await createTempDirectory();
    const filePath = path.join(directory, CONFIG_FILE_NAME);

    await writeFile(filePath, '{"id":"bad id"}\n', "utf8");

    await expect(readConfig(filePath)).rejects.toMatchObject<
      Partial<ReadConfigError>
    >({
      code: "invalid-schema",
      path: filePath,
    });
  });
});

describe("writeConfig", () => {
  it("writes the canonical JSON payload with an LF terminator", async () => {
    const directory = await createTempDirectory();

    const filePath = await writeConfig(directory, "my-app-v2");
    const contents = await readFile(filePath, "utf8");

    expect(filePath).toBe(getConfigPath(directory));
    expect(contents).toBe('{\n  "id": "my-app-v2"\n}\n');
  });
});
