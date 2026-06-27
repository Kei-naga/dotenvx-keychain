import { access, realpath } from "node:fs/promises";
import path from "node:path";

import { getConfigPath, readConfig } from "./configFile.js";
import { assertValidId, createAutoIdFromRealPath } from "./id.js";

export interface ResolvedInitId {
  id: string;
  projectRoot: string;
  configPath: string;
  source: "explicit" | "existing-config" | "auto";
}

export interface ResolvedRunProject {
  projectRoot: string;
  configPath: string | null;
  source: "nearest-config" | "cwd-fallback";
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;

    if (code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function resolveInitId(
  cwd: string,
  explicitId?: string,
): Promise<ResolvedInitId> {
  const projectRoot = await realpath(cwd);
  const configPath = getConfigPath(projectRoot);

  if (typeof explicitId === "string") {
    return {
      id: assertValidId(explicitId),
      projectRoot,
      configPath,
      source: "explicit",
    };
  }

  try {
    const config = await readConfig(configPath);

    return {
      id: config.id,
      projectRoot,
      configPath,
      source: "existing-config",
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code !== "not-found"
    ) {
      throw error;
    }
  }

  return {
    id: createAutoIdFromRealPath(projectRoot),
    projectRoot,
    configPath,
    source: "auto",
  };
}

export async function resolveRunProject(
  cwd: string,
): Promise<ResolvedRunProject> {
  const startDirectory = await realpath(cwd);
  let currentDirectory = startDirectory;

  while (true) {
    const configPath = getConfigPath(currentDirectory);

    if (await fileExists(configPath)) {
      return {
        projectRoot: currentDirectory,
        configPath,
        source: "nearest-config",
      };
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return {
        projectRoot: startDirectory,
        configPath: null,
        source: "cwd-fallback",
      };
    }

    currentDirectory = parentDirectory;
  }
}
