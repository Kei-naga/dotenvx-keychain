import { CLI_EXIT_CODE } from "../cli/exitCodes.js";
import { InvalidIdError, assertValidId } from "../config/id.js";
import { defaultSecretStoreFactory } from "../secretStore/factory.js";
import {
  SecretStoreError,
  type SecretStoreFactory,
} from "../secretStore/interface.js";

export interface RemoveCommandDependencies {
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  secretStoreFactory?: SecretStoreFactory;
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
        return "Failed to remove the stored secret.";
    }
  }

  return "Failed to remove the stored secret.";
}

export async function removeCommand(
  command: { id: string },
  dependencies: RemoveCommandDependencies = {},
): Promise<number> {
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;

  try {
    assertValidId(command.id);
  } catch (error) {
    if (error instanceof InvalidIdError) {
      stderr(error.message);
      return CLI_EXIT_CODE.usage;
    }

    stderr("Invalid ID.");
    return CLI_EXIT_CODE.usage;
  }

  let store;

  try {
    store = await (dependencies.secretStoreFactory ?? defaultSecretStoreFactory).create();
  } catch (error) {
    stderr(formatSecretStoreError(error));
    return CLI_EXIT_CODE.infrastructure;
  }

  try {
    const removed = await store.remove(command.id);

    if (!removed) {
      stderr(`No key found for id: ${command.id}`);
      return CLI_EXIT_CODE.notFound;
    }

    stdout(`Removed key: ${command.id}`);
    return CLI_EXIT_CODE.success;
  } catch (error) {
    stderr(formatSecretStoreError(error));
    return CLI_EXIT_CODE.infrastructure;
  }
}
