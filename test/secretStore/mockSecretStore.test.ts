import { describe, expect, it } from "vitest";

import { MockSecretStore } from "../../src/secretStore/mock/mockSecretStore.js";

describe("MockSecretStore", () => {
  it("stores, retrieves, lists, and removes secrets by ID", async () => {
    const store = new MockSecretStore();

    await store.set("app-a", "secret-a");
    await store.set("app-b", "secret-b");

    await expect(store.get("app-a")).resolves.toBe("secret-a");
    await expect(store.get("missing")).resolves.toBeNull();
    await expect(store.list()).resolves.toEqual(["app-a", "app-b"]);
    await expect(store.remove("app-a")).resolves.toBe(true);
    await expect(store.remove("app-a")).resolves.toBe(false);
    await expect(store.list()).resolves.toEqual(["app-b"]);
  });
});
