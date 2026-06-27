import { KeytarSecretStore } from "./backends/keytarStore.js";
import { createWslWindowsKeytar } from "./backends/wslWindowsKeytar.js";
import {
  SecretStoreError,
  type KeytarLike,
  type SecretStore,
  type SecretStoreFactory,
} from "./interface.js";
import { isWslLinux } from "./platform.js";

export interface CreateSecretStoreOptions {
  loadKeytar?: () => Promise<KeytarLike>;
  createWslKeytar?: () => Promise<KeytarLike>;
  detectWsl?: (platform?: NodeJS.Platform) => boolean | Promise<boolean>;
  env?: NodeJS.ProcessEnv;
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
  if (platform === "linux") {
    const env = options.env ?? process.env;
    const detectWsl = options.detectWsl ?? isWslLinux;
    const loadKeytar =
      env.DXK_WSL_USE_LINUX_SECRET_SERVICE !== "1" &&
      (await detectWsl(platform)) === true
        ? (options.createWslKeytar ?? createWslWindowsKeytar)
        : (options.loadKeytar ?? loadKeytarModule);
    const store = new KeytarSecretStore(await loadKeytar());
    await store.probe();
    return store;
  }

  switch (platform) {
    case "darwin":
    case "win32": {
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
