import { describe, expect, it } from "vitest";

import { formatSecretStoreUnavailableMessage } from "../../src/secretStore/userMessages.js";

describe("formatSecretStoreUnavailableMessage", () => {
  it("returns Linux guidance for Linux platforms", () => {
    expect(formatSecretStoreUnavailableMessage("linux")).toBe(
      "The native secret store is unavailable. On Linux, verify that libsecret is installed, a D-Bus session is available, and a Secret Service compatible keyring with an unlocked default collection is running.",
    );
  });

  it("returns macOS guidance for darwin platforms", () => {
    expect(formatSecretStoreUnavailableMessage("darwin")).toBe(
      "The native secret store is unavailable. On macOS, verify that you are running in a logged-in user session, the login keychain is present and unlocked, and Keychain Access can open it.",
    );
  });

  it("returns the generic message for other platforms", () => {
    expect(formatSecretStoreUnavailableMessage("win32")).toBe(
      "The native secret store is unavailable.",
    );
  });
});
