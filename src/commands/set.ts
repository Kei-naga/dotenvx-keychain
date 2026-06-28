import {
  emitCommandFailure,
  resolvePrivateKey,
  resolveProjectContext,
  runBundledDotenvxCommand,
  type DotenvxCommandDependencies,
} from "./dotenvxCommandRuntime.js";

export type SetCommandDependencies = DotenvxCommandDependencies;

export async function setCommand(
  command: { key: string; value: string },
  dependencies: SetCommandDependencies = {},
): Promise<number> {
  const cwd = dependencies.cwd ?? process.cwd();
  const env = dependencies.env ?? process.env;
  const stderr = dependencies.stderr ?? console.error;

  const projectContext = await resolveProjectContext(cwd);

  if (!projectContext.ok) {
    return emitCommandFailure(stderr, projectContext.failure);
  }

  const privateKey = await resolvePrivateKey(
    projectContext.value.id,
    env,
    dependencies.secretStoreFactory,
  );

  if (!privateKey.ok) {
    return emitCommandFailure(stderr, privateKey.failure);
  }

  return runBundledDotenvxCommand(
    ["set", command.key, command.value],
    {
      cwd: projectContext.value.projectRoot,
      env: {
        ...env,
        DOTENV_PRIVATE_KEY: privateKey.value,
      },
      startFailureMessage: "Failed to start dotenvx set.",
    },
    dependencies,
  );
}