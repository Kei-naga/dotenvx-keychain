import { createHash } from "node:crypto";

const ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export class InvalidIdError extends Error {
  public readonly id: string;

  public constructor(id: string) {
    super(
      `Invalid ID ${JSON.stringify(id)}. Allowed characters: a-z, A-Z, 0-9, ., _, - (1-128 chars).`,
    );
    this.name = "InvalidIdError";
    this.id = id;
  }
}

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function assertValidId(id: string): string {
  if (!isValidId(id)) {
    throw new InvalidIdError(id);
  }

  return id;
}

export function normalizePathForId(
  realPath: string,
  platform: NodeJS.Platform,
): string {
  const forwardSlashPath = realPath.replace(/\\/g, "/");

  if (platform === "win32" && /^[A-Z]:/.test(forwardSlashPath)) {
    const driveLetter = forwardSlashPath.slice(0, 1);
    return `${driveLetter.toLowerCase()}${forwardSlashPath.slice(1)}`;
  }

  return forwardSlashPath;
}

function basenameFromNormalizedPath(normalizedPath: string): string {
  const trimmedPath = normalizedPath.replace(/\/+$/g, "") || normalizedPath;
  const segments = trimmedPath.split("/");
  const candidate = segments.at(-1) ?? "";

  return candidate.length > 0 ? candidate : "project";
}

function buildHashedId(prefix: string, normalizedPath: string): string {
  const hash12 = createHash("sha256")
    .update(normalizedPath)
    .digest("hex")
    .slice(0, 12);

  return `${prefix}-${hash12}`;
}

export function createAutoIdFromRealPath(
  realPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const normalizedPath = normalizePathForId(realPath, platform);
  const basename = basenameFromNormalizedPath(normalizedPath);
  const primaryId = buildHashedId(basename, normalizedPath);

  if (isValidId(primaryId)) {
    return primaryId;
  }

  const fallbackId = buildHashedId("project", normalizedPath);

  if (isValidId(fallbackId)) {
    return fallbackId;
  }

  throw new Error("Unable to generate a valid automatic ID.");
}
