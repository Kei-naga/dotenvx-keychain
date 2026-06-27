import { release } from "node:os";

import { isWslLinux } from "./platform.js";

export function formatSecretStoreUnavailableMessage(
  platform: NodeJS.Platform = process.platform,
  osRelease: string = release(),
): string {
  if (isWslLinux(platform, osRelease)) {
    return "The native secret store is unavailable. On WSL, verify that powershell.exe is reachable from the Linux environment and that the current Windows user session can access Credential Manager.";
  }

  if (platform === "linux") {
    return "The native secret store is unavailable. On Linux, verify that libsecret is installed, a D-Bus session is available, and a Secret Service compatible keyring with an unlocked default collection is running.";
  }

  if (platform === "darwin") {
    return "The native secret store is unavailable. On macOS, verify that you are running in a logged-in user session, the login keychain is present and unlocked, and Keychain Access can open it.";
  }

  return "The native secret store is unavailable.";
}
