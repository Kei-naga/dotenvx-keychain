import { describe, expect, it } from "vitest";

import { formatSecretStoreUnavailableMessage } from "../../src/secretStore/userMessages.js";

describe("formatSecretStoreUnavailableMessage", () => {
  it("returns WSL guidance for WSL environments", () => {
    expect(
      formatSecretStoreUnavailableMessage("linux", "5.15.167.4-microsoft"),
    ).toBe(
      "The native secret store is unavailable. On WSL, verify that powershell.exe is reachable from the Linux environment and that the current Windows user session can access Credential Manager.",
    );
  });

  it("returns Linux guidance for Linux platforms", () => {
    expect(formatSecretStoreUnavailableMessage("linux", "6.8.0-generic")).toBe(
      "The native secret store is unavailable. On Linux, verify that libsecret is installed, a D-Bus session is available, and a Secret Service compatible keyring with an unlocked default collection is running.",
    );
  });

  it("returns macOS guidance for darwin platforms", () => {
    expect(formatSecretStoreUnavailableMessage("darwin", "23.0.0")).toBe(
      "The native secret store is unavailable. On macOS, verify that you are running in a logged-in user session, the login keychain is present and unlocked, and Keychain Access can open it.",
    );
  });

  it("returns the generic message for other platforms", () => {
    expect(formatSecretStoreUnavailableMessage("win32", "10.0.0")).toBe(
      "The native secret store is unavailable.",
    );
  });
});
