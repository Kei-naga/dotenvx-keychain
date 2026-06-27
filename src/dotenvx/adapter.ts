import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveDotenvxBinary } from "./resolver.js";

export interface CapturedProcessOptions {
  file: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export interface CapturedProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export type CaptureProcess = (
  options: CapturedProcessOptions,
) => Promise<CapturedProcessResult>;

export interface DotenvxBootstrapResult {
  privateKey: string;
  encryptedEnvContents: string;
}

export interface DotenvxAdapter {
  readPrivateKey(projectRoot: string): Promise<string | null>;
  bootstrapProjectEnv(projectRoot: string): Promise<DotenvxBootstrapResult>;
}

const BOOTSTRAP_PLACEHOLDER_KEY = "DXK_BOOTSTRAP_PLACEHOLDER";
const BOOTSTRAP_PLACEHOLDER_VALUE = "bootstrap";

export class DotenvxAdapterError extends Error {
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "DotenvxAdapterError";
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

type ParsedSingleLineValue =
  | { kind: "invalid" }
  | { kind: "missing" }
  | { kind: "value"; value: string };

function parseSingleLineValue(stdout: string): ParsedSingleLineValue {
  const lines = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length !== 1) {
    return { kind: "invalid" };
  }

  const value = lines[0] ?? null;

  if (value === null || value === "null") {
    return { kind: "missing" };
  }

  return { kind: "value", value };
}

function createSanitizedEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowedKeys = [
    "APPDATA",
    "HOME",
    "HOMEDRIVE",
    "HOMEPATH",
    "LOCALAPPDATA",
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "TEMP",
    "TERM",
    "TMP",
    "TMPDIR",
    "USERPROFILE",
    "WINDIR",
  ] as const;

  const sanitizedEnv: NodeJS.ProcessEnv = {};

  for (const key of allowedKeys) {
    const value = baseEnv[key];

    if (typeof value === "string" && value.length > 0) {
      sanitizedEnv[key] = value;
    }
  }

  return sanitizedEnv;
}

function shouldSeedPlaceholderEnv(sourceEnvContents: string | null): boolean {
  return sourceEnvContents === null || sourceEnvContents.trim().length === 0;
}

function stripBootstrapPlaceholder(contents: string): string {
  return contents.replace(
    new RegExp(`^${BOOTSTRAP_PLACEHOLDER_KEY}=encrypted:[^\n]*(?:\n|$)`, "mu"),
    "",
  );
}

export async function defaultCaptureProcess(
  options: CapturedProcessOptions,
): Promise<CapturedProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.file, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stdout,
        stderr,
      });
    });
  });
}

export class DefaultDotenvxAdapter implements DotenvxAdapter {
  public constructor(
    private readonly resolveBinary: () => Promise<string> = resolveDotenvxBinary,
    private readonly captureProcess: CaptureProcess = defaultCaptureProcess,
    private readonly baseEnv: NodeJS.ProcessEnv = process.env,
  ) {}

  public async readPrivateKey(projectRoot: string): Promise<string | null> {
    const envPath = path.join(projectRoot, ".env");
    const envKeysPath = path.join(projectRoot, ".env.keys");
    const hasLocalState =
      (await pathExists(envPath)) || (await pathExists(envKeysPath));

    if (!hasLocalState) {
      return null;
    }

    const result = await this.runDotenvx(
      ["keypair", "DOTENV_PRIVATE_KEY"],
      projectRoot,
    );

    if (result.exitCode !== 0 || result.signal !== null) {
      throw new DotenvxAdapterError(
        "dotenvx failed while reading a local key.",
      );
    }

    const privateKey = parseSingleLineValue(result.stdout);

    if (privateKey.kind === "missing") {
      return null;
    }

    if (privateKey.kind === "invalid") {
      throw new DotenvxAdapterError(
        "dotenvx returned an unexpected key output.",
      );
    }

    return privateKey.value;
  }

  public async bootstrapProjectEnv(
    projectRoot: string,
  ): Promise<DotenvxBootstrapResult> {
    const sourceEnvPath = path.join(projectRoot, ".env");
    const sourceEnvContents = await readOptionalFile(sourceEnvPath);
    const tempProjectRoot = await mkdtemp(path.join(tmpdir(), "dxk-dotenvx-"));
    const shouldUsePlaceholder = shouldSeedPlaceholderEnv(sourceEnvContents);
    const tempEnvContents = shouldUsePlaceholder
      ? `${BOOTSTRAP_PLACEHOLDER_KEY}=${BOOTSTRAP_PLACEHOLDER_VALUE}\n`
      : sourceEnvContents;

    try {
      if (tempEnvContents !== null) {
        await writeFile(
          path.join(tempProjectRoot, ".env"),
          tempEnvContents,
          "utf8",
        );
      }

      const encryptResult = await this.runDotenvx(["encrypt"], tempProjectRoot);

      if (encryptResult.exitCode !== 0 || encryptResult.signal !== null) {
        throw new DotenvxAdapterError(
          "dotenvx failed while bootstrapping a project key.",
        );
      }

      const encryptedEnvContents = await readOptionalFile(
        path.join(tempProjectRoot, ".env"),
      );

      if (!encryptedEnvContents) {
        throw new DotenvxAdapterError(
          "dotenvx did not produce an encrypted .env file.",
        );
      }

      const privateKey = await this.readPrivateKeyFromProject(tempProjectRoot);

      return {
        privateKey,
        encryptedEnvContents: shouldUsePlaceholder
          ? stripBootstrapPlaceholder(encryptedEnvContents)
          : encryptedEnvContents,
      };
    } finally {
      await rm(tempProjectRoot, { recursive: true, force: true });
    }
  }

  private async readPrivateKeyFromProject(
    projectRoot: string,
  ): Promise<string> {
    const result = await this.runDotenvx(
      ["keypair", "DOTENV_PRIVATE_KEY"],
      projectRoot,
    );

    if (result.exitCode !== 0 || result.signal !== null) {
      throw new DotenvxAdapterError(
        "dotenvx failed while reading a local key.",
      );
    }

    const privateKey = parseSingleLineValue(result.stdout);

    if (privateKey.kind !== "value") {
      throw new DotenvxAdapterError(
        "dotenvx returned an unexpected key output.",
      );
    }

    return privateKey.value;
  }

  private async runDotenvx(
    args: string[],
    cwd: string,
  ): Promise<CapturedProcessResult> {
    let binaryPath: string;

    try {
      binaryPath = await this.resolveBinary();
    } catch (error) {
      throw new DotenvxAdapterError(
        "Failed to resolve the bundled dotenvx binary.",
        error,
      );
    }

    let result: CapturedProcessResult;

    try {
      result = await this.captureProcess({
        file: process.execPath,
        args: [binaryPath, ...args],
        cwd,
        env: createSanitizedEnv(this.baseEnv),
      });
    } catch (error) {
      throw new DotenvxAdapterError(
        `Failed to run dotenvx for ${args[0] ?? "the requested command"}.`,
        error,
      );
    }

    return result;
  }
}
