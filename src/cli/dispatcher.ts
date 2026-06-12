import { parseCliArgs } from "./parseArgs.js";
import { initCommand, type InitCommandDependencies } from "../commands/init.js";
import { listCommand, type ListCommandDependencies } from "../commands/list.js";
import { removeCommand, type RemoveCommandDependencies } from "../commands/remove.js";
import { runCommand, type RunCommandDependencies } from "../commands/run.js";

export interface DispatchDependencies
  extends InitCommandDependencies,
    RunCommandDependencies,
    ListCommandDependencies,
    RemoveCommandDependencies {}

export function formatUsage(): string {
  return [
    "Usage:",
    "  dotenvx-keychain init [id]",
    "  dotenvx-keychain run -- <command> [args...]",
    "  dotenvx-keychain list",
    "  dotenvx-keychain remove <id>",
    "",
    "Aliases:",
    "  dxk",
    "  ls -> list",
    "  rm -> remove",
  ].join("\n");
}

export async function dispatch(
  argv: string[],
  dependencies: DispatchDependencies = {},
): Promise<number> {
  const parsed = parseCliArgs(argv);

  if (parsed.type === "help") {
    console.log(formatUsage());
    return argv.length === 0 ? 2 : 0;
  }

  if (parsed.type === "usage-error") {
    console.error(parsed.message);
    console.error(formatUsage());
    return 2;
  }

  if (parsed.command.name === "init") {
    return initCommand(parsed.command, dependencies);
  }

  if (parsed.command.name === "run") {
    return runCommand(parsed.command, dependencies);
  }

  if (parsed.command.name === "list") {
    return listCommand(dependencies);
  }

  if (parsed.command.name === "remove") {
    return removeCommand(parsed.command, dependencies);
  }
  return 4;
}

