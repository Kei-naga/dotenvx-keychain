import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getConfigPath, writeConfig } from "../../src/config/configFile.js";
import { createAutoIdFromRealPath } from "../../src/config/id.js";
import {
  resolveInitId,
  resolveRunProject,
} from "../../src/config/idResolver.js";

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "dxk-id-"));
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

describe("createAutoIdFromRealPath", () => {
  it("normalizes the Windows drive letter before hashing", () => {
    const upperCaseDrive = createAutoIdFromRealPath(
      "C:\\Users\\keita\\source\\my-app",
      "win32",
    );
    const lowerCaseDrive = createAutoIdFromRealPath(
      "c:\\Users\\keita\\source\\my-app",
      "win32",
    );

    expect(upperCaseDrive).toBe(lowerCaseDrive);
  });

  it("falls back to the project prefix when the basename is invalid", () => {
    expect(createAutoIdFromRealPath("/tmp/my app", "linux")).toMatch(
      /^project-[a-f0-9]{12}$/,
    );
  });
});

describe("resolveInitId", () => {
  it("prefers an explicit ID over an existing config file", async () => {
    const directory = await createTempDirectory();
    await writeConfig(directory, "existing-id");

    await expect(
      resolveInitId(directory, "override-id"),
    ).resolves.toMatchObject({
      id: "override-id",
      projectRoot: directory,
      configPath: getConfigPath(directory),
      source: "explicit",
    });
  });

  it("reuses the existing config ID when no explicit ID is provided", async () => {
    const directory = await createTempDirectory();
    await writeConfig(directory, "existing-id");

    await expect(resolveInitId(directory)).resolves.toMatchObject({
      id: "existing-id",
      projectRoot: directory,
      configPath: getConfigPath(directory),
      source: "existing-config",
    });
  });

  it("generates an automatic ID when no config file exists", async () => {
    const directory = await createTempDirectory();

    await expect(resolveInitId(directory)).resolves.toMatchObject({
      id: createAutoIdFromRealPath(directory),
      projectRoot: directory,
      configPath: getConfigPath(directory),
      source: "auto",
    });
  });
});

describe("resolveRunProject", () => {
  it("returns the nearest ancestor config file", async () => {
    const rootDirectory = await createTempDirectory();
    const childDirectory = path.join(rootDirectory, "apps");
    const nestedDirectory = path.join(childDirectory, "web");

    await mkdir(nestedDirectory, { recursive: true });
    await writeConfig(rootDirectory, "root-id");
    await writeConfig(childDirectory, "child-id");

    await expect(resolveRunProject(nestedDirectory)).resolves.toEqual({
      projectRoot: childDirectory,
      configPath: getConfigPath(childDirectory),
      source: "nearest-config",
    });
  });

  it("falls back to the current directory when no config file exists", async () => {
    const directory = await createTempDirectory();
    const nestedDirectory = path.join(directory, "nested");

    await mkdir(nestedDirectory, { recursive: true });

    await expect(resolveRunProject(nestedDirectory)).resolves.toEqual({
      projectRoot: nestedDirectory,
      configPath: null,
      source: "cwd-fallback",
    });
  });
});
