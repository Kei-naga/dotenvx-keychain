import { parseCliArgs } from "./parseArgs.js";
import { CLI_EXIT_CODE } from "./exitCodes.js";
import { getCommand, type GetCommandDependencies } from "../commands/get.js";
import { initCommand, type InitCommandDependencies } from "../commands/init.js";
import { listCommand, type ListCommandDependencies } from "../commands/list.js";
import {
  removeCommand,
  type RemoveCommandDependencies,
} from "../commands/remove.js";
import { runCommand, type RunCommandDependencies } from "../commands/run.js";
import { setCommand, type SetCommandDependencies } from "../commands/set.js";

export interface DispatchDependencies
  extends
    InitCommandDependencies,
    RunCommandDependencies,
    ListCommandDependencies,
    RemoveCommandDependencies,
    SetCommandDependencies,
    GetCommandDependencies {}

export function formatUsage(): string {
  return [
    "Usage:",
    "  dotenvx-keychain init [id]",
    "  dotenvx-keychain run -- <command> [args...]",
    "  dotenvx-keychain set <key> <value>",
    "  dotenvx-keychain get <key>",
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
    return argv.length === 0 ? CLI_EXIT_CODE.usage : CLI_EXIT_CODE.success;
  }

  if (parsed.type === "usage-error") {
    console.error(parsed.message);
    console.error(formatUsage());
    return CLI_EXIT_CODE.usage;
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

  if (parsed.command.name === "set") {
    return setCommand(parsed.command, dependencies);
  }

  if (parsed.command.name === "get") {
    return getCommand(parsed.command, dependencies);
  }

  return CLI_EXIT_CODE.infrastructure;
}
