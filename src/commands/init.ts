import { access, readFile, rm, writeFile } from "node:fs/promises";
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
  readTextFile?: (filePath: string) => Promise<string>;
  writeTextFile?: (filePath: string, contents: string) => Promise<void>;
  writeConfig?: (projectRoot: string, id: string) => Promise<string>;
}

type InitKeySource =
  | "secret-store"
  | "environment"
  | "local-dotenvx"
  | "bootstrap";

interface ResolvedInitKey {
  privateKey: string | null;
  source: InitKeySource | null;
  encryptedEnvContents: string | null;
  requiresExistingKey: boolean;
}

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

async function readTextFile(filePath: string): Promise<string> {
  return await readFile(filePath, "utf8");
}

async function writeTextFile(
  filePath: string,
  contents: string,
): Promise<void> {
  await writeFile(filePath, contents, "utf8");
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

async function readOptionalTextFile(
  filePath: string,
  readTextFileImpl: (filePath: string) => Promise<string>,
): Promise<string | null> {
  try {
    return await readTextFileImpl(filePath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

function isEncryptedEnvFile(contents: string | null): boolean {
  if (contents === null) {
    return false;
  }

  return contents.split(/\r?\n/u).some((line) => {
    const trimmedLine = line.trim();

    if (trimmedLine === "" || trimmedLine.startsWith("#")) {
      return false;
    }

    if (/^(?:export\s+)?DOTENV_PUBLIC_KEY\s*=/.test(trimmedLine)) {
      return true;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      return false;
    }

    const value = trimmedLine.slice(separatorIndex + 1).trimStart();
    return value.startsWith("encrypted:");
  });
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
  allowBootstrap: boolean,
  readTextFileImpl: (filePath: string) => Promise<string>,
): Promise<ResolvedInitKey> {
  const storedValue = await store.get(id);

  if (storedValue !== null) {
    return {
      privateKey: storedValue,
      source: "secret-store",
      encryptedEnvContents: null,
      requiresExistingKey: false,
    };
  }

  if (isNonEmpty(env.DOTENV_PRIVATE_KEY)) {
    return {
      privateKey: env.DOTENV_PRIVATE_KEY,
      source: "environment",
      encryptedEnvContents: null,
      requiresExistingKey: false,
    };
  }

  const localValue = await dotenvxAdapter.readPrivateKey(projectRoot);

  if (localValue !== null) {
    return {
      privateKey: localValue,
      source: "local-dotenvx",
      encryptedEnvContents: null,
      requiresExistingKey: false,
    };
  }

  const envContents = await readOptionalTextFile(
    path.join(projectRoot, ".env"),
    readTextFileImpl,
  );
  const existingEncryptedEnv = isEncryptedEnvFile(envContents);

  if (!allowBootstrap || existingEncryptedEnv) {
    return {
      privateKey: null,
      source: null,
      encryptedEnvContents: null,
      requiresExistingKey: existingEncryptedEnv,
    };
  }

  const bootstrapResult = await dotenvxAdapter.bootstrapProjectEnv(projectRoot);

  return {
    privateKey: bootstrapResult.privateKey,
    source: "bootstrap",
    encryptedEnvContents: bootstrapResult.encryptedEnvContents,
    requiresExistingKey: false,
  };
}

async function restoreProjectEnv(
  envPath: string,
  previousContents: string | null,
  writeTextFileImpl: (filePath: string, contents: string) => Promise<void>,
  deleteFileImpl: (filePath: string) => Promise<void>,
): Promise<void> {
  if (previousContents === null) {
    await deleteFileImpl(envPath);
    return;
  }

  await writeTextFileImpl(envPath, previousContents);
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
  const readTextFileImpl = dependencies.readTextFile ?? readTextFile;
  const writeTextFileImpl = dependencies.writeTextFile ?? writeTextFile;
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
  const envPath = path.join(resolvedInit.projectRoot, ".env");
  const hasExistingConfig = await fileExists(resolvedInit.configPath);

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
      !hasExistingConfig,
      readTextFileImpl,
    );
  } catch {
    stderr("Failed to prepare a dotenvx key.");
    if (await fileExists(envKeysPath)) {
      emitPreservedEnvKeysMessage(stderr, envKeysPath);
    }
    return CLI_EXIT_CODE.infrastructure;
  }

  if (resolvedKey.privateKey === null) {
    if (hasExistingConfig) {
      stderr(`No key found for id: ${resolvedInit.id}`);
      stderr(
        "Provide DOTENV_PRIVATE_KEY or restore the key before running init again.",
      );
    } else {
      stderr("No reusable key was found for the existing encrypted .env.");
      stderr(
        "Provide DOTENV_PRIVATE_KEY or restore .env.keys before running init again.",
      );
    }
    return CLI_EXIT_CODE.notFound;
  }

  let storedByThisRun = false;
  const shouldWriteBootstrapEnv =
    resolvedKey.source === "bootstrap" &&
    resolvedKey.encryptedEnvContents !== null;
  let previousEnvContents: string | null = null;

  if (shouldWriteBootstrapEnv) {
    try {
      previousEnvContents = await readOptionalTextFile(
        envPath,
        readTextFileImpl,
      );
    } catch {
      stderr("Failed to read project env: .env");
      return CLI_EXIT_CODE.infrastructure;
    }
  }

  let envWriteAttempted = false;
  let envRollbackFailed = false;

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

  if (shouldWriteBootstrapEnv) {
    envWriteAttempted = true;
    const bootstrapEnvContents = resolvedKey.encryptedEnvContents;

    if (bootstrapEnvContents === null) {
      stderr("Failed to prepare a bootstrap .env file.");
      return CLI_EXIT_CODE.infrastructure;
    }

    try {
      await writeTextFileImpl(envPath, bootstrapEnvContents);
    } catch {
      try {
        await restoreProjectEnv(
          envPath,
          previousEnvContents,
          writeTextFileImpl,
          deleteFileImpl,
        );
      } catch {
        envRollbackFailed = true;
      }

      let rollbackFailed = false;

      if (storedByThisRun) {
        try {
          await store.remove(resolvedInit.id);
        } catch {
          rollbackFailed = true;
        }
      }

      stderr("Failed to update project env: .env");

      if (rollbackFailed || envRollbackFailed) {
        stderr("Manual project state verification is required.");
      }

      return CLI_EXIT_CODE.infrastructure;
    }
  }

  try {
    await writeConfigImpl(resolvedInit.projectRoot, resolvedInit.id);
  } catch {
    let rollbackFailed = false;

    if (shouldWriteBootstrapEnv && envWriteAttempted) {
      try {
        await restoreProjectEnv(
          envPath,
          previousEnvContents,
          writeTextFileImpl,
          deleteFileImpl,
        );
      } catch {
        envRollbackFailed = true;
      }
    }

    if (storedByThisRun) {
      try {
        await store.remove(resolvedInit.id);
      } catch {
        rollbackFailed = true;
      }
    }

    stderr(`Failed to write config: ${CONFIG_FILE_NAME}`);

    if (rollbackFailed || envRollbackFailed) {
      stderr("Manual project state verification is required.");
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
