import { CLI_EXIT_CODE } from "../cli/exitCodes.js";
import { defaultSecretStoreFactory } from "../secretStore/factory.js";
import {
  SecretStoreError,
  type SecretStoreFactory,
} from "../secretStore/interface.js";
import { formatSecretStoreUnavailableMessage } from "../secretStore/userMessages.js";

export interface ListCommandDependencies {
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
        return formatSecretStoreUnavailableMessage();
      case "backend-io-error":
      case "enumeration-failed":
      case "remove-failed":
        return "Failed to enumerate stored IDs.";
    }
  }

  return "Failed to enumerate stored IDs.";
}

export async function listCommand(
  dependencies: ListCommandDependencies = {},
): Promise<number> {
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;

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
    const ids = Array.from(new Set(await store.list())).sort();

    for (const id of ids) {
      stdout(id);
    }

    return CLI_EXIT_CODE.success;
  } catch (error) {
    stderr(formatSecretStoreError(error));
    return CLI_EXIT_CODE.infrastructure;
  }
}
