import { CLI_EXIT_CODE } from "../cli/exitCodes.js";
import {
  defaultRunInheritedProcess,
  shouldUseWindowsShell,
  type RunInheritedProcess,
} from "../cli/processRunner.js";
import { readConfig, ReadConfigError } from "../config/configFile.js";
import { createAutoIdFromRealPath } from "../config/id.js";
import { resolveRunProject } from "../config/idResolver.js";
import { resolveDotenvxBinary } from "../dotenvx/resolver.js";
import { defaultSecretStoreFactory } from "../secretStore/factory.js";
import {
  SecretStoreError,
  type SecretStoreFactory,
} from "../secretStore/interface.js";

export interface RunCommandDependencies {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stderr?: (message: string) => void;
  secretStoreFactory?: SecretStoreFactory;
  resolveDotenvxBinary?: () => Promise<string>;
  runProcess?: RunInheritedProcess;
  determineWindowsShell?: (
    command: string,
    cwd: string,
    env: NodeJS.ProcessEnv,
  ) => Promise<boolean>;
  propagateSignal?: (signal: NodeJS.Signals) => void;
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function formatSecretStoreError(error: unknown): string {
  if (error instanceof SecretStoreError) {
    switch (error.code) {
      case "unsupported-platform":
        return "This platform is not supported by dotenvx-keychain.";
      case "backend-unavailable":
        return "The native secret store is unavailable.";
      case "backend-io-error":
      case "enumeration-failed":
      case "remove-failed":
        return "The native secret store operation failed.";
    }
  }

  return "The native secret store operation failed.";
}

function formatConfigReadError(error: ReadConfigError): string {
  if (error.code === "invalid-json" || error.code === "invalid-schema") {
    return `Invalid config file: ${error.path}`;
  }

  return `Failed to read config: ${error.path}`;
}

export async function runCommand(
  command: { command: string; args: string[] },
  dependencies: RunCommandDependencies = {},
): Promise<number> {
  const cwd = dependencies.cwd ?? process.cwd();
  const env = dependencies.env ?? process.env;
  const stderr = dependencies.stderr ?? console.error;
  const resolveBinary =
    dependencies.resolveDotenvxBinary ?? resolveDotenvxBinary;
  const runProcess = dependencies.runProcess ?? defaultRunInheritedProcess;
  const determineWindowsShell =
    dependencies.determineWindowsShell ?? shouldUseWindowsShell;
  const propagateSignal =
    dependencies.propagateSignal ??
    ((signal: NodeJS.Signals) => {
      process.kill(process.pid, signal);
    });

  let privateKey: string;

  if (isNonEmpty(env.DOTENV_PRIVATE_KEY)) {
    privateKey = env.DOTENV_PRIVATE_KEY;
  } else {
    const resolvedProject = await resolveRunProject(cwd);

    let id: string;

    if (resolvedProject.configPath !== null) {
      try {
        const config = await readConfig(resolvedProject.configPath);
        id = config.id;
      } catch (error) {
        if (error instanceof ReadConfigError) {
          stderr(formatConfigReadError(error));
          return CLI_EXIT_CODE.infrastructure;
        }

        stderr("Failed to read the project config.");
        return CLI_EXIT_CODE.infrastructure;
      }
    } else {
      id = createAutoIdFromRealPath(resolvedProject.projectRoot);
    }

    let store;

    try {
      store = await (
        dependencies.secretStoreFactory ?? defaultSecretStoreFactory
      ).create();
    } catch (error) {
      stderr(formatSecretStoreError(error));
      return CLI_EXIT_CODE.infrastructure;
    }

    try {
      const storedValue = await store.get(id);

      if (storedValue === null) {
        stderr(`No key found for id: ${id}`);
        stderr(
          "Run `dotenvx-keychain init` in the project root to register a key.",
        );
        return CLI_EXIT_CODE.notFound;
      }

      privateKey = storedValue;
    } catch (error) {
      stderr(formatSecretStoreError(error));
      return CLI_EXIT_CODE.infrastructure;
    }
  }

  let dotenvxBinary: string;

  try {
    dotenvxBinary = await resolveBinary();
  } catch {
    stderr("The bundled dotenvx dependency is unavailable.");
    return CLI_EXIT_CODE.infrastructure;
  }

  let shell = false;

  if (process.platform === "win32") {
    try {
      shell = await determineWindowsShell(command.command, cwd, env);
    } catch {
      stderr(`Failed to resolve command: ${command.command}`);
      return CLI_EXIT_CODE.infrastructure;
    }
  }

  try {
    const result = await runProcess({
      file: process.execPath,
      args: [dotenvxBinary, "run", "--", command.command, ...command.args],
      cwd,
      env: {
        ...env,
        DOTENV_PRIVATE_KEY: privateKey,
      },
      shell,
    });

    if (result.signal !== null) {
      propagateSignal(result.signal);
      return CLI_EXIT_CODE.infrastructure;
    }

    return result.exitCode ?? CLI_EXIT_CODE.infrastructure;
  } catch {
    stderr("Failed to start dotenvx run.");
    return CLI_EXIT_CODE.infrastructure;
  }
}
