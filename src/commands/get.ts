import {
  emitCommandFailure,
  resolvePrivateKey,
  resolveProjectContext,
  runBundledDotenvxCommand,
  type DotenvxCommandDependencies,
} from "./dotenvxCommandRuntime.js";

export type GetCommandDependencies = DotenvxCommandDependencies;

export async function getCommand(
  command: { key: string },
  dependencies: GetCommandDependencies = {},
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
    ["get", command.key],
    {
      cwd: projectContext.value.projectRoot,
      env: {
        ...env,
        DOTENV_PRIVATE_KEY: privateKey.value,
      },
      startFailureMessage: "Failed to start dotenvx get.",
    },
    dependencies,
  );
}
