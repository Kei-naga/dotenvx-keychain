import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

export interface InheritedProcessOptions {
  file: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell?: boolean;
}

export interface InheritedProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export type RunInheritedProcess = (
  options: InheritedProcessOptions,
) => Promise<InheritedProcessResult>;

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isPathLikeCommand(command: string): boolean {
  return (
    command.includes("/") ||
    command.includes("\\") ||
    command.startsWith(".") ||
    /^[A-Za-z]:/.test(command)
  );
}

function getWindowsExecutableExtensions(env: NodeJS.ProcessEnv): string[] {
  const pathExtensions = env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD";
  const extensions = pathExtensions
    .split(";")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return extensions.length > 0 ? extensions : [".com", ".exe", ".bat", ".cmd"];
}

function withCandidateExtensions(
  basePath: string,
  env: NodeJS.ProcessEnv,
): string[] {
  if (path.extname(basePath) !== "") {
    return [basePath];
  }

  return [
    basePath,
    ...getWindowsExecutableExtensions(env).map(
      (extension) => `${basePath}${extension}`,
    ),
  ];
}

async function firstExistingPath(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function resolveWindowsCommandPath(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  if (isPathLikeCommand(command)) {
    const directPath = path.isAbsolute(command)
      ? command
      : path.resolve(cwd, command);
    return firstExistingPath(withCandidateExtensions(directPath, env));
  }

  const pathEntries = (env.PATH ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const pathEntry of pathEntries) {
    const resolvedPath = await firstExistingPath(
      withCandidateExtensions(path.join(pathEntry, command), env),
    );

    if (resolvedPath) {
      return resolvedPath;
    }
  }

  return null;
}

export async function shouldUseWindowsShell(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  const resolvedPath = await resolveWindowsCommandPath(command, cwd, env);

  if (resolvedPath === null) {
    throw new Error(`Failed to resolve command: ${command}`);
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  return extension === ".cmd" || extension === ".bat";
}

export async function defaultRunInheritedProcess(
  options: InheritedProcessOptions,
): Promise<InheritedProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.file, options.args, {
      cwd: options.cwd,
      env: options.env,
      shell: options.shell ?? false,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
      });
    });
  });
}
