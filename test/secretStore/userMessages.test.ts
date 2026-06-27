import { describe, expect, it } from "vitest";

import { formatSecretStoreUnavailableMessage } from "../../src/secretStore/userMessages.js";

describe("formatSecretStoreUnavailableMessage", () => {
  it("returns Linux guidance for Linux platforms", () => {
    expect(formatSecretStoreUnavailableMessage("linux")).toBe(
      "The native secret store is unavailable. On Linux, verify that libsecret is installed, a D-Bus session is available, and a Secret Service compatible keyring with an unlocked default collection is running.",
    );
  });

  it("returns the generic message for non-Linux platforms", () => {
    expect(formatSecretStoreUnavailableMessage("darwin")).toBe(
      "The native secret store is unavailable.",
    );
  });
});
