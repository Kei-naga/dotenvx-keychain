export function formatSecretStoreUnavailableMessage(
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "linux") {
    return "The native secret store is unavailable. On Linux, verify that libsecret is installed, a D-Bus session is available, and a Secret Service compatible keyring with an unlocked default collection is running.";
  }

  if (platform === "darwin") {
    return "The native secret store is unavailable. On macOS, verify that you are running in a logged-in user session, the login keychain is present and unlocked, and Keychain Access can open it.";
  }

  return "The native secret store is unavailable.";
}
