import { access, rm } from "node:fs/promises";
import path from "node:path";

import { CLI_EXIT_CODE } from "../cli/exitCodes.js";
import {
  CONFIG_FILE_NAME,
  ReadConfigError,
  writeConfig,
} from "../config/configFile.js";
import { InvalidIdError } from "../config/id.js";
import { resolveInitId } from "../config/idResolver.js";
import {
  DefaultDotenvxAdapter,
  type DotenvxAdapter,
} from "../dotenvx/adapter.js";
import { defaultSecretStoreFactory } from "../secretStore/factory.js";
import {
  SecretStoreError,
  type SecretStore,
  type SecretStoreFactory,
} from "../secretStore/interface.js";
import { formatSecretStoreUnavailableMessage } from "../secretStore/userMessages.js";

export interface InitCommandDependencies {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  secretStoreFactory?: SecretStoreFactory;
  dotenvxAdapter?: DotenvxAdapter;
  fileExists?: (filePath: string) => Promise<boolean>;
  deleteFile?: (filePath: string) => Promise<void>;
  writeConfig?: (projectRoot: string, id: string) => Promise<string>;
}

type InitKeySource = "secret-store" | "environment" | "local-dotenvx";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function deleteFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function formatSecretStoreError(error: unknown): string {
  if (error instanceof SecretStoreError) {
    switch (error.code) {
      case "unsupported-platform":
        return "This platform is not supported by dotenvx-keychain.";
      case "backend-unavailable":
        return formatSecretStoreUnavailableMessage();
      case "enumeration-failed":
      case "remove-failed":
      case "backend-io-error":
        return "The native secret store operation failed.";
    }
  }

  return "The native secret store operation failed.";
}

function emitPreservedEnvKeysMessage(
  stderr: (message: string) => void,
  envKeysPath: string,
): void {
  stderr(`Local key file remains: ${envKeysPath}`);
}

async function resolvePrivateKey(
  store: SecretStore,
  id: string,
  projectRoot: string,
  env: NodeJS.ProcessEnv,
  dotenvxAdapter: DotenvxAdapter,
): Promise<{ privateKey: string | null; source: InitKeySource | null }> {
  const storedValue = await store.get(id);

  if (storedValue !== null) {
    return { privateKey: storedValue, source: "secret-store" };
  }

  if (isNonEmpty(env.DOTENV_PRIVATE_KEY)) {
    return {
      privateKey: env.DOTENV_PRIVATE_KEY,
      source: "environment",
    };
  }

  const localValue = await dotenvxAdapter.readPrivateKey(projectRoot);

  return {
    privateKey: localValue,
    source: localValue === null ? null : "local-dotenvx",
  };
}

export async function initCommand(
  command: { id?: string },
  dependencies: InitCommandDependencies = {},
): Promise<number> {
  const cwd = dependencies.cwd ?? process.cwd();
  const env = dependencies.env ?? process.env;
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;
  const secretStoreFactory =
    dependencies.secretStoreFactory ?? defaultSecretStoreFactory;
  const dotenvxAdapter =
    dependencies.dotenvxAdapter ?? new DefaultDotenvxAdapter();
  const fileExists = dependencies.fileExists ?? pathExists;
  const deleteFileImpl = dependencies.deleteFile ?? deleteFile;
  const writeConfigImpl = dependencies.writeConfig ?? writeConfig;

  let resolvedInit;

  try {
    resolvedInit = await resolveInitId(cwd, command.id);
  } catch (error) {
    if (error instanceof InvalidIdError) {
      stderr(error.message);
      return CLI_EXIT_CODE.usage;
    }

    if (error instanceof ReadConfigError) {
      stderr(`Failed to read config: ${error.path}`);
      return CLI_EXIT_CODE.infrastructure;
    }

    stderr("Failed to resolve the project ID.");
    return CLI_EXIT_CODE.infrastructure;
  }

  const envKeysPath = path.join(resolvedInit.projectRoot, ".env.keys");

  let store: SecretStore;

  try {
    store = await secretStoreFactory.create();
  } catch (error) {
    stderr(formatSecretStoreError(error));
    return CLI_EXIT_CODE.infrastructure;
  }

  let resolvedKey;

  try {
    resolvedKey = await resolvePrivateKey(
      store,
      resolvedInit.id,
      resolvedInit.projectRoot,
      env,
      dotenvxAdapter,
    );
  } catch {
    stderr("Failed to read a local dotenvx key.");
    if (await fileExists(envKeysPath)) {
      emitPreservedEnvKeysMessage(stderr, envKeysPath);
    }
    return CLI_EXIT_CODE.infrastructure;
  }

  if (resolvedKey.privateKey === null) {
    if (resolvedInit.source === "existing-config") {
      stderr(`No key found for id: ${resolvedInit.id}`);
      stderr(
        "Provide DOTENV_PRIVATE_KEY or restore the key before running init again.",
      );
    } else {
      stderr(
        "No key source is available. Prepare a dotenvx key or provide DOTENV_PRIVATE_KEY first.",
      );
    }
    return CLI_EXIT_CODE.notFound;
  }

  let storedByThisRun = false;

  if (resolvedKey.source !== "secret-store") {
    try {
      await store.set(resolvedInit.id, resolvedKey.privateKey);
      storedByThisRun = true;
    } catch (error) {
      stderr(formatSecretStoreError(error));
      if (
        resolvedKey.source === "local-dotenvx" &&
        (await fileExists(envKeysPath))
      ) {
        emitPreservedEnvKeysMessage(stderr, envKeysPath);
      }
      return CLI_EXIT_CODE.infrastructure;
    }
  }

  try {
    await writeConfigImpl(resolvedInit.projectRoot, resolvedInit.id);
  } catch {
    let rollbackFailed = false;

    if (storedByThisRun) {
      try {
        await store.remove(resolvedInit.id);
      } catch {
        rollbackFailed = true;
      }
    }

    stderr(`Failed to write config: ${CONFIG_FILE_NAME}`);

    if (rollbackFailed) {
      stderr("Manual secret store verification is required.");
    }

    if (
      resolvedKey.source === "local-dotenvx" &&
      (await fileExists(envKeysPath))
    ) {
      emitPreservedEnvKeysMessage(stderr, envKeysPath);
    }

    return CLI_EXIT_CODE.infrastructure;
  }

  if (await fileExists(envKeysPath)) {
    try {
      await deleteFileImpl(envKeysPath);
    } catch (error) {
      if (isMissingFileError(error)) {
        // Another process may have removed .env.keys after the existence check.
      } else {
      stderr(`Failed to remove local key file: ${envKeysPath}`);
      return CLI_EXIT_CODE.postProcessFailure;
      }
    }
  }

  stdout(`Initialized dotenvx-keychain with id: ${resolvedInit.id}`);
  stdout(`Wrote config: ${CONFIG_FILE_NAME}`);
  return CLI_EXIT_CODE.success;
}
