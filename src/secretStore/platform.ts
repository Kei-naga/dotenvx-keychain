import { release } from "node:os";

export function isWslLinux(
  platform: NodeJS.Platform = process.platform,
  osRelease: string = release(),
): boolean {
  return platform === "linux" && /microsoft/i.test(osRelease);
}