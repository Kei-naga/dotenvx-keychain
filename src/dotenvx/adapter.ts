import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
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

export interface DotenvxAdapter {
  readPrivateKey(projectRoot: string): Promise<string | null>;
}

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

function parsePrivateKey(stdout: string): string | null {
  const lines = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length !== 1) {
    return null;
  }

  return lines[0] ?? null;
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
  ) {}

  public async readPrivateKey(projectRoot: string): Promise<string | null> {
    const envPath = path.join(projectRoot, ".env");
    const envKeysPath = path.join(projectRoot, ".env.keys");
    const hasLocalState =
      (await pathExists(envPath)) || (await pathExists(envKeysPath));

    if (!hasLocalState) {
      return null;
    }

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
        args: [binaryPath, "keypair", "DOTENV_PRIVATE_KEY"],
        cwd: projectRoot,
      });
    } catch (error) {
      throw new DotenvxAdapterError(
        "Failed to run dotenvx while reading a local key.",
        error,
      );
    }

    if (result.exitCode !== 0 || result.signal !== null) {
      throw new DotenvxAdapterError(
        "dotenvx failed while reading a local key.",
      );
    }

    const privateKey = parsePrivateKey(result.stdout);

    if (!privateKey) {
      throw new DotenvxAdapterError(
        "dotenvx returned an unexpected key output.",
      );
    }

    return privateKey;
  }
}
