import { describe, expect, it } from "vitest";

import { listCommand } from "../../src/commands/list.js";
import { removeCommand } from "../../src/commands/remove.js";
import { MockSecretStore } from "../../src/secretStore/mock/mockSecretStore.js";

describe("listCommand", () => {
  it("prints sorted IDs", async () => {
    const stdout: string[] = [];

    const exitCode = await listCommand({
      stdout: (message) => {
        stdout.push(message);
      },
      secretStoreFactory: {
        create: async () => ({
          async set(): Promise<void> {},
          async get(): Promise<string | null> {
            return null;
          },
          async list(): Promise<string[]> {
            return ["sample-project", "app-a", "my-app-v2", "app-a"];
          },
          async remove(): Promise<boolean> {
            return false;
          },
        }),
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toEqual(["app-a", "my-app-v2", "sample-project"]);
  });
});

describe("removeCommand", () => {
  it("removes an existing ID and reports success", async () => {
    const stdout: string[] = [];
    const store = new MockSecretStore([["app-a", "secret-a"]]);

    const exitCode = await removeCommand(
      { id: "app-a" },
      {
        stdout: (message) => {
          stdout.push(message);
        },
        secretStoreFactory: {
          create: async () => store,
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toEqual(["Removed key: app-a"]);
    await expect(store.get("app-a")).resolves.toBeNull();
  });

  it("returns exit 3 when the target ID does not exist", async () => {
    const stderr: string[] = [];

    const exitCode = await removeCommand(
      { id: "app-a" },
      {
        stderr: (message) => {
          stderr.push(message);
        },
        secretStoreFactory: {
          create: async () => new MockSecretStore(),
        },
      },
    );

    expect(exitCode).toBe(3);
    expect(stderr).toEqual(["No key found for id: app-a"]);
  });

  it("returns exit 2 for invalid IDs", async () => {
    const stderr: string[] = [];

    const exitCode = await removeCommand(
      { id: "bad id" },
      {
        stderr: (message) => {
          stderr.push(message);
        },
      },
    );

    expect(exitCode).toBe(2);
    expect(stderr[0]).toContain("Invalid ID");
  });
});
