export function formatSecretStoreUnavailableMessage(
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "linux") {
    return "The native secret store is unavailable. On Linux, verify that libsecret is installed, a D-Bus session is available, and a Secret Service compatible keyring with an unlocked default collection is running.";
  }

  return "The native secret store is unavailable.";
}
