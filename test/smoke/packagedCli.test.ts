import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getNpmExecPath(): string {
  const npmExecPath = process.env.npm_execpath;

  if (!npmExecPath) {
    throw new Error(
      "npm_execpath is unavailable. Run this smoke test through an npm script.",
    );
  }

  return npmExecPath;
}

async function runProcess(
  file: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    shell?: boolean;
  },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: options.env,
      shell: options.shell ?? false,
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

async function runNpmCommand(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProcessResult> {
  return runProcess(process.execPath, [getNpmExecPath(), ...args], {
    cwd,
    env,
  });
}

function getInstalledBinPath(
  installDirectory: string,
  binName: string,
): string {
  return path.join(
    installDirectory,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${binName}.cmd` : binName,
  );
}

async function runInstalledBinary(
  installDirectory: string,
  binName: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
  return runProcess(getInstalledBinPath(installDirectory, binName), args, {
    cwd: installDirectory,
    env,
    shell: process.platform === "win32",
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("packaged CLI smoke", () => {
  it("packs, installs, exposes both bin entries, and resolves bundled dotenvx during run", async () => {
    const repositoryRoot = process.cwd();
    const packDirectory = await createTemporaryDirectory("dxk-pack-");
    const installDirectory = await createTemporaryDirectory("dxk-install-");

    const packResult = await runNpmCommand(
      ["pack", "--json", "--pack-destination", packDirectory],
      repositoryRoot,
    );

    expect(packResult.exitCode).toBe(0);

    const tarballs = JSON.parse(packResult.stdout.trim()) as Array<{
      filename: string;
    }>;
    const tarballFilename = tarballs[0]?.filename;

    expect(tarballFilename).toBeTruthy();

    const tarballPath = path.join(packDirectory, tarballFilename ?? "");

    await writeFile(
      path.join(installDirectory, "package.json"),
      JSON.stringify({ name: "dxk-smoke", private: true }, null, 2),
      "utf8",
    );

    const installResult = await runNpmCommand(
      ["install", "--no-package-lock", "--ignore-scripts", tarballPath],
      installDirectory,
    );

    expect(installResult.exitCode).toBe(0);
    expect(
      await pathExists(
        getInstalledBinPath(installDirectory, "dotenvx-keychain"),
      ),
    ).toBe(true);
    expect(await pathExists(getInstalledBinPath(installDirectory, "dxk"))).toBe(
      true,
    );

    const smokeKey = "dxk-packaged-smoke-key";
    const smokeCommand = [
      "run",
      "--",
      "node",
      "-p",
      "process.env.DOTENV_PRIVATE_KEY",
    ];
    const smokeEnv = {
      ...process.env,
      DOTENV_PRIVATE_KEY: smokeKey,
    };

    const primaryResult = await runInstalledBinary(
      installDirectory,
      "dotenvx-keychain",
      smokeCommand,
      smokeEnv,
    );

    expect(primaryResult.exitCode).toBe(0);
    expect(primaryResult.signal).toBeNull();
    expect(primaryResult.stdout).toContain(smokeKey);

    const aliasResult = await runInstalledBinary(
      installDirectory,
      "dxk",
      smokeCommand,
      smokeEnv,
    );

    expect(aliasResult.exitCode).toBe(0);
    expect(aliasResult.signal).toBeNull();
    expect(aliasResult.stdout).toContain(smokeKey);
  }, 120_000);
});
