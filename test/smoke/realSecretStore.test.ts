import { describe, expect, it } from "vitest";

import { createSecretStore } from "../../src/secretStore/factory.js";

function createSmokeId(): string {
  return `dxk-smoke-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

describe("real secret store smoke", () => {
  it("sets, gets, lists, and removes a key on the current platform", async () => {
    const store = await createSecretStore();
    const id = createSmokeId();
    const value = `smoke-value-${Date.now()}`;

    try {
      await store.remove(id).catch(() => false);

      await store.set(id, value);
      await expect(store.get(id)).resolves.toBe(value);
      await expect(store.list()).resolves.toContain(id);
      await expect(store.remove(id)).resolves.toBe(true);
      await expect(store.get(id)).resolves.toBeNull();
    } finally {
      await store.remove(id).catch(() => false);
    }
  }, 60_000);
});
