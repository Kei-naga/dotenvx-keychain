import {
  access,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DefaultDotenvxAdapter } from "../../src/dotenvx/adapter.js";

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "dxk-dotenvx-adapter-"));
  const canonicalDirectory = await realpath(directory);
  tempDirectories.push(canonicalDirectory);
  return canonicalDirectory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("DefaultDotenvxAdapter", () => {
  it("treats dotenvx keypair null output as a missing key", async () => {
    const directory = await createTempDirectory();
    const envPath = path.join(directory, ".env");
    const adapter = new DefaultDotenvxAdapter();

    await writeFile(envPath, "HELLO=world\n", "utf8");

    await expect(adapter.readPrivateKey(directory)).resolves.toBeNull();
  });

  it("fails when dotenvx keypair returns empty output for a local key read", async () => {
    const directory = await createTempDirectory();
    const envPath = path.join(directory, ".env");
    const adapter = new DefaultDotenvxAdapter(
      async () => "dotenvx.js",
      async () => ({
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
      }),
    );

    await writeFile(envPath, "HELLO=world\n", "utf8");

    await expect(adapter.readPrivateKey(directory)).rejects.toThrow(
      "dotenvx returned an unexpected key output.",
    );
  });

  it("fails when dotenvx keypair returns multiple lines for a local key read", async () => {
    const directory = await createTempDirectory();
    const envPath = path.join(directory, ".env");
    const adapter = new DefaultDotenvxAdapter(
      async () => "dotenvx.js",
      async () => ({
        exitCode: 0,
        signal: null,
        stdout: "first\nsecond\n",
        stderr: "",
      }),
    );

    await writeFile(envPath, "HELLO=world\n", "utf8");

    await expect(adapter.readPrivateKey(directory)).rejects.toThrow(
      "dotenvx returned an unexpected key output.",
    );
  });

  it("bootstraps a plaintext .env without mutating the project root", async () => {
    const directory = await createTempDirectory();
    const envPath = path.join(directory, ".env");
    const adapter = new DefaultDotenvxAdapter();

    await writeFile(envPath, "HELLO=world\n", "utf8");

    const result = await adapter.bootstrapProjectEnv(directory);

    expect(result.privateKey.length).toBeGreaterThan(0);
    expect(result.encryptedEnvContents).toContain("DOTENV_PUBLIC_KEY");
    expect(result.encryptedEnvContents).not.toContain("HELLO=world");
    await expect(readFile(envPath, "utf8")).resolves.toBe("HELLO=world\n");
    await expect(
      access(path.join(directory, ".env.keys")),
    ).rejects.toBeTruthy();
  });

  it("sanitizes ambient environment during empty-project bootstrap", async () => {
    const directory = await createTempDirectory();
    const adapter = new DefaultDotenvxAdapter(undefined, undefined, {
      ...process.env,
      DXK_SENTINEL: "should_not_leak",
    });

    const result = await adapter.bootstrapProjectEnv(directory);

    expect(result.privateKey.length).toBeGreaterThan(0);
    expect(result.encryptedEnvContents).toContain("DOTENV_PUBLIC_KEY");
    expect(result.encryptedEnvContents).not.toContain(
      "DXK_BOOTSTRAP_PLACEHOLDER",
    );
    expect(result.encryptedEnvContents).not.toContain("DXK_SENTINEL");
    expect(result.encryptedEnvContents).not.toContain("PATH=");
    expect(result.encryptedEnvContents).not.toContain("HOME=");
    expect(result.encryptedEnvContents).not.toContain("should_not_leak");
    await expect(access(path.join(directory, ".env"))).rejects.toBeTruthy();
    await expect(
      access(path.join(directory, ".env.keys")),
    ).rejects.toBeTruthy();
  });

  it("treats whitespace-only .env as empty during bootstrap", async () => {
    const directory = await createTempDirectory();
    const envPath = path.join(directory, ".env");
    const adapter = new DefaultDotenvxAdapter(undefined, undefined, {
      ...process.env,
      DXK_SENTINEL: "should_not_leak",
    });

    await writeFile(envPath, " \n\t", "utf8");

    const result = await adapter.bootstrapProjectEnv(directory);

    expect(result.privateKey.length).toBeGreaterThan(0);
    expect(result.encryptedEnvContents).toContain("DOTENV_PUBLIC_KEY");
    expect(result.encryptedEnvContents).not.toContain(
      "DXK_BOOTSTRAP_PLACEHOLDER",
    );
    expect(result.encryptedEnvContents).not.toContain("DXK_SENTINEL");
    expect(result.encryptedEnvContents).not.toContain("PATH=");
    expect(result.encryptedEnvContents).not.toContain("HOME=");
    expect(result.encryptedEnvContents).not.toContain("should_not_leak");
    await expect(readFile(envPath, "utf8")).resolves.toBe(" \n\t");
    await expect(
      access(path.join(directory, ".env.keys")),
    ).rejects.toBeTruthy();
  });
});
