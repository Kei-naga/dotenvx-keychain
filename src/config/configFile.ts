import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isValidId } from "./id.js";

export const CONFIG_FILE_NAME = ".dotenvx-keychain";

export type ReadConfigErrorCode =
  | "not-found"
  | "invalid-json"
  | "invalid-schema"
  | "io-error";

export interface ConfigFileData {
  id: string;
  path: string;
}

export class ReadConfigError extends Error {
  public readonly code: ReadConfigErrorCode;
  public readonly path: string;

  public constructor(
    code: ReadConfigErrorCode,
    filePath: string,
    cause?: unknown,
  ) {
    super(`Failed to read config at ${filePath}: ${code}`, { cause });
    this.name = "ReadConfigError";
    this.code = code;
    this.path = filePath;
  }
}

function stripByteOrderMark(contents: string): string {
  return contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getConfigPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_FILE_NAME);
}

export async function readConfig(filePath: string): Promise<ConfigFileData> {
  let contents: string;

  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;

    if (code === "ENOENT") {
      throw new ReadConfigError("not-found", filePath, error);
    }

    throw new ReadConfigError("io-error", filePath, error);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(stripByteOrderMark(contents));
  } catch (error) {
    throw new ReadConfigError("invalid-json", filePath, error);
  }

  if (!isRecord(parsed)) {
    throw new ReadConfigError("invalid-schema", filePath);
  }

  const id = parsed.id;

  if (typeof id !== "string" || !isValidId(id)) {
    throw new ReadConfigError("invalid-schema", filePath);
  }

  return {
    id,
    path: filePath,
  };
}

export async function writeConfig(
  projectRoot: string,
  id: string,
): Promise<string> {
  if (!isValidId(id)) {
    throw new Error(`Cannot write invalid ID ${JSON.stringify(id)}.`);
  }

  const filePath = getConfigPath(projectRoot);
  const contents = `${JSON.stringify({ id }, null, 2)}\n`;

  await writeFile(filePath, contents, "utf8");

  return filePath;
}
