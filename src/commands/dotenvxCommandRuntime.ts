import { CLI_EXIT_CODE } from "../cli/exitCodes.js";
import {
  defaultRunInheritedProcess,
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
import { formatSecretStoreUnavailableMessage } from "../secretStore/userMessages.js";

export interface DotenvxCommandDependencies {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stderr?: (message: string) => void;
  secretStoreFactory?: SecretStoreFactory;
  resolveDotenvxBinary?: () => Promise<string>;
  runProcess?: RunInheritedProcess;
  propagateSignal?: (signal: NodeJS.Signals) => void;
}

export interface ResolvedProjectContext {
  projectRoot: string;
  id: string;
}

export interface CommandFailure {
  exitCode: number;
  messages: string[];
}

export type CommandResolutionResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: CommandFailure };

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function formatSecretStoreError(error: unknown): string {
  if (error instanceof SecretStoreError) {
    switch (error.code) {
      case "unsupported-platform":
        return "This platform is not supported by dotenvx-keychain.";
      case "backend-unavailable":
        return formatSecretStoreUnavailableMessage();
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

function success<T>(value: T): CommandResolutionResult<T> {
  return {
    ok: true,
    value,
  };
}

function failure(
  exitCode: number,
  ...messages: string[]
): CommandResolutionResult<never> {
  return {
    ok: false,
    failure: {
      exitCode,
      messages,
    },
  };
}

export function emitCommandFailure(
  stderr: (message: string) => void,
  commandFailure: CommandFailure,
): number {
  for (const message of commandFailure.messages) {
    stderr(message);
  }

  return commandFailure.exitCode;
}

export function hasPreInjectedPrivateKey(
  env: NodeJS.ProcessEnv,
): env is NodeJS.ProcessEnv & { DOTENV_PRIVATE_KEY: string } {
  return isNonEmpty(env.DOTENV_PRIVATE_KEY);
}

export async function resolveProjectContext(
  cwd: string,
): Promise<CommandResolutionResult<ResolvedProjectContext>> {
  const resolvedProject = await resolveRunProject(cwd);

  if (resolvedProject.configPath !== null) {
    try {
      const config = await readConfig(resolvedProject.configPath);

      return success({
        projectRoot: resolvedProject.projectRoot,
        id: config.id,
      });
    } catch (error) {
      if (error instanceof ReadConfigError) {
        return failure(
          CLI_EXIT_CODE.infrastructure,
          formatConfigReadError(error),
        );
      }

      throw error;
    }
  }

  return success({
    projectRoot: resolvedProject.projectRoot,
    id: createAutoIdFromRealPath(resolvedProject.projectRoot),
  });
}

export async function resolvePrivateKey(
  id: string,
  env: NodeJS.ProcessEnv,
  secretStoreFactory: SecretStoreFactory = defaultSecretStoreFactory,
): Promise<CommandResolutionResult<string>> {
  if (isNonEmpty(env.DOTENV_PRIVATE_KEY)) {
    return success(env.DOTENV_PRIVATE_KEY);
  }

  let store;

  try {
    store = await secretStoreFactory.create();
  } catch (error) {
    return failure(CLI_EXIT_CODE.infrastructure, formatSecretStoreError(error));
  }

  try {
    const storedValue = await store.get(id);

    if (storedValue === null) {
      return failure(
        CLI_EXIT_CODE.notFound,
        `No key found for id: ${id}`,
        "Run `dotenvx-keychain init` in the project root to register a key.",
      );
    }

    return success(storedValue);
  } catch (error) {
    return failure(CLI_EXIT_CODE.infrastructure, formatSecretStoreError(error));
  }
}

export async function runBundledDotenvxCommand(
  dotenvxArgs: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    startFailureMessage: string;
    shell?: boolean;
  },
  dependencies: Pick<
    DotenvxCommandDependencies,
    "stderr" | "resolveDotenvxBinary" | "runProcess" | "propagateSignal"
  > = {},
): Promise<number> {
  const stderr = dependencies.stderr ?? console.error;
  const resolveBinary =
    dependencies.resolveDotenvxBinary ?? resolveDotenvxBinary;
  const runProcess = dependencies.runProcess ?? defaultRunInheritedProcess;
  const propagateSignal =
    dependencies.propagateSignal ??
    ((signal: NodeJS.Signals) => {
      try {
        process.kill(process.pid, signal);
      } catch {
        // Keep the child-signal path deterministic when the host cannot re-emit.
      }
    });

  let dotenvxBinary: string;

  try {
    dotenvxBinary = await resolveBinary();
  } catch {
    stderr("The bundled dotenvx dependency is unavailable.");
    return CLI_EXIT_CODE.infrastructure;
  }

  try {
    const result = await runProcess({
      file: process.execPath,
      args: [dotenvxBinary, ...dotenvxArgs],
      cwd: options.cwd,
      env: options.env,
      shell: options.shell ?? false,
    });

    if (result.signal !== null) {
      propagateSignal(result.signal);
      return CLI_EXIT_CODE.infrastructure;
    }

    return result.exitCode ?? CLI_EXIT_CODE.infrastructure;
  } catch {
    stderr(options.startFailureMessage);
    return CLI_EXIT_CODE.infrastructure;
  }
}
