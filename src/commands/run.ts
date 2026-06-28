import { CLI_EXIT_CODE } from "../cli/exitCodes.js";
import {
  shouldUseWindowsShell,
} from "../cli/processRunner.js";
import {
  emitCommandFailure,
  hasPreInjectedPrivateKey,
  resolvePrivateKey,
  resolveProjectContext,
  runBundledDotenvxCommand,
  type DotenvxCommandDependencies,
} from "./dotenvxCommandRuntime.js";

export interface RunCommandDependencies extends DotenvxCommandDependencies {
  determineWindowsShell?: (
    command: string,
    cwd: string,
    env: NodeJS.ProcessEnv,
  ) => Promise<boolean>;
  propagateSignal?: (signal: NodeJS.Signals) => void;
}

export async function runCommand(
  command: { command: string; args: string[] },
  dependencies: RunCommandDependencies = {},
): Promise<number> {
  const cwd = dependencies.cwd ?? process.cwd();
  const env = dependencies.env ?? process.env;
  const stderr = dependencies.stderr ?? console.error;
  const determineWindowsShell =
    dependencies.determineWindowsShell ?? shouldUseWindowsShell;

  let privateKey: string;

  if (hasPreInjectedPrivateKey(env)) {
    privateKey = env.DOTENV_PRIVATE_KEY;
  } else {
    const projectContext = await resolveProjectContext(cwd);

    if (!projectContext.ok) {
      return emitCommandFailure(stderr, projectContext.failure);
    }

    const resolvedPrivateKey = await resolvePrivateKey(
      projectContext.value.id,
      env,
      dependencies.secretStoreFactory,
    );

    if (!resolvedPrivateKey.ok) {
      return emitCommandFailure(stderr, resolvedPrivateKey.failure);
    }

    privateKey = resolvedPrivateKey.value;
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

  return runBundledDotenvxCommand(
    ["run", "--", command.command, ...command.args],
    {
      cwd,
      env: {
        ...env,
        DOTENV_PRIVATE_KEY: privateKey,
      },
      shell,
      startFailureMessage: "Failed to start dotenvx run.",
    },
    dependencies,
  );
}
