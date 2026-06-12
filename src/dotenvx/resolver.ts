import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

interface DotenvxPackageJson {
  bin?: string | Record<string, string>;
}

export class DotenvxResolutionError extends Error {
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "DotenvxResolutionError";
  }
}

export async function resolveDotenvxBinary(): Promise<string> {
  let packageJsonPath: string;

  try {
    packageJsonPath = require.resolve("@dotenvx/dotenvx/package.json");
  } catch (error) {
    throw new DotenvxResolutionError(
      "Failed to locate the bundled dotenvx dependency.",
      error,
    );
  }

  let packageJson: DotenvxPackageJson;

  try {
    packageJson = JSON.parse(
      await readFile(packageJsonPath, "utf8"),
    ) as DotenvxPackageJson;
  } catch (error) {
    throw new DotenvxResolutionError(
      "Failed to read the bundled dotenvx package metadata.",
      error,
    );
  }

  const binPath =
    typeof packageJson.bin === "string"
      ? packageJson.bin
      : packageJson.bin?.dotenvx;

  if (!binPath) {
    throw new DotenvxResolutionError(
      "The bundled dotenvx package does not expose a dotenvx binary.",
    );
  }

  return path.resolve(path.dirname(packageJsonPath), binPath);
}
