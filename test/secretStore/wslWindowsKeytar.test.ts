import { describe, expect, it } from "vitest";

import {
  createWslWindowsKeytar,
  type RunWslPowerShell,
} from "../../src/secretStore/backends/wslWindowsKeytar.js";

function createMockRunner(
  handler: (input: {
    operation: string;
    service: string;
    account?: string;
    password?: string;
  }) => {
    exitCode?: number | null;
    stdout?: string;
    stderr?: string;
  },
): {
  calls: Array<{ file: string; args: string[]; input: string }>;
  runPowerShell: RunWslPowerShell;
} {
  const calls: Array<{ file: string; args: string[]; input: string }> = [];

  return {
    calls,
    runPowerShell: async (options) => {
      calls.push(options);
      const result = handler(
        JSON.parse(options.input) as {
          operation: string;
          service: string;
          account?: string;
          password?: string;
        },
      );

      return {
        exitCode: result.exitCode ?? 0,
        stdout: result.stdout ?? '{"ok":true}',
        stderr: result.stderr ?? "",
      };
    },
  };
}

function decodeEncodedCommand(args: string[]): string {
  const encodedCommandIndex = args.indexOf("-EncodedCommand");

  expect(encodedCommandIndex).toBeGreaterThanOrEqual(0);

  return Buffer.from(args[encodedCommandIndex + 1] ?? "", "base64").toString(
    "utf16le",
  );
}

describe("WslWindowsKeytar", () => {
  it("maps CRUD operations through the Windows credential bridge", async () => {
    const credentials = new Map<string, string>();
    const runner = createMockRunner((request) => {
      const key = `${request.service}/${request.account ?? ""}`;

      switch (request.operation) {
        case "set":
          credentials.set(key, request.password ?? "");
          return {};
        case "get":
          return {
            stdout: JSON.stringify({
              password: credentials.get(key) ?? null,
            }),
          };
        case "delete": {
          const deleted = credentials.delete(key);
          return {
            stdout: JSON.stringify({ deleted }),
          };
        }
        case "list":
          return {
            stdout: JSON.stringify({
              credentials: Array.from(credentials.entries()).map(
                ([entryKey, password]) => ({
                  account: entryKey.slice(request.service.length + 1),
                  password,
                }),
              ),
            }),
          };
        default:
          throw new Error("unsupported operation");
      }
    });

    const keytar = await createWslWindowsKeytar({
      powershellCommand: "powershell.exe",
      runPowerShell: runner.runPowerShell,
    });

    await keytar.setPassword("dotenvx-keychain", "app-a", "secret-a");
    await expect(
      keytar.getPassword("dotenvx-keychain", "app-a"),
    ).resolves.toBe("secret-a");
    await expect(keytar.findCredentials("dotenvx-keychain")).resolves.toEqual(
      [{ account: "app-a", password: "secret-a" }],
    );
    await expect(
      keytar.deletePassword("dotenvx-keychain", "app-a"),
    ).resolves.toBe(true);
    await expect(
      keytar.getPassword("dotenvx-keychain", "app-a"),
    ).resolves.toBeNull();

    expect(runner.calls[0]?.file).toBe("powershell.exe");
    expect(runner.calls[0]?.args).toContain("-EncodedCommand");
  });

  it("scopes credential enumeration to the exact service namespace", async () => {
    const runner = createMockRunner(() => ({
      stdout: JSON.stringify({ credentials: [] }),
    }));

    const keytar = await createWslWindowsKeytar({
      runPowerShell: runner.runPowerShell,
    });

    await expect(keytar.findCredentials("dotenvx-keychain")).resolves.toEqual(
      [],
    );

    const bridgeCommand = decodeEncodedCommand(runner.calls[0]?.args ?? []);

    expect(bridgeCommand).toContain(
      'if (!CredEnumerate(targetPrefix + "*", 0, out count, out credentialsPtr))',
    );
    expect(bridgeCommand).toContain(
      "credential.TargetName.StartsWith(targetPrefix, StringComparison.Ordinal)",
    );
    expect(bridgeCommand).not.toContain(
      'if (!CredEnumerate(service + "*", 0, out count, out credentialsPtr))',
    );
  });

  it("normalizes process failures into credential-manager errors", async () => {
    const keytar = await createWslWindowsKeytar({
      runPowerShell: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "Bridge failed",
      }),
    });

    await expect(
      keytar.setPassword("dotenvx-keychain", "app-a", "secret-a"),
    ).rejects.toThrow(
      "Credential Manager operation failed: Bridge failed",
    );
  });

  it("rejects invalid bridge output", async () => {
    const keytar = await createWslWindowsKeytar({
      runPowerShell: async () => ({
        exitCode: 0,
        stdout: "not-json",
        stderr: "",
      }),
    });

    await expect(
      keytar.getPassword("dotenvx-keychain", "app-a"),
    ).rejects.toThrow("Credential Manager returned an invalid response.");
  });
});