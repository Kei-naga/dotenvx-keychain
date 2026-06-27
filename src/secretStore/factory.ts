import { KeytarSecretStore } from "./backends/keytarStore.js";
import {
  SecretStoreError,
  type KeytarLike,
  type SecretStore,
  type SecretStoreFactory,
} from "./interface.js";

export interface CreateSecretStoreOptions {
  loadKeytar?: () => Promise<KeytarLike>;
}

async function loadKeytarModule(): Promise<KeytarLike> {
  const moduleName = "keytar";

  try {
    const imported = (await import(moduleName)) as {
      default?: KeytarLike;
    } & Partial<KeytarLike>;
    return imported.default ?? (imported as KeytarLike);
  } catch (error) {
    throw new SecretStoreError(
      "backend-unavailable",
      "Failed to load the native secret store backend.",
      error,
    );
  }
}

export async function createSecretStore(
  platform: NodeJS.Platform = process.platform,
  options: CreateSecretStoreOptions = {},
): Promise<SecretStore> {
  switch (platform) {
    case "darwin":
    case "win32":
    case "linux": {
      const loadKeytar = options.loadKeytar ?? loadKeytarModule;
      const store = new KeytarSecretStore(await loadKeytar());
      await store.probe();
      return store;
    }

    default:
      throw new SecretStoreError(
        "unsupported-platform",
        `Unsupported platform: ${platform}`,
      );
  }
}

export const defaultSecretStoreFactory: SecretStoreFactory = {
  create(platform?: NodeJS.Platform) {
    return createSecretStore(platform);
  },
};
