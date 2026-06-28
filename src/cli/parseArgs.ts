export interface ParsedHelp {
  type: "help";
}

export interface ParsedInitCommand {
  name: "init";
  id?: string;
}

export interface ParsedRunCommand {
  name: "run";
  command: string;
  args: string[];
}

export interface ParsedListCommand {
  name: "list";
}

export interface ParsedRemoveCommand {
  name: "remove";
  id: string;
}

export interface ParsedSetCommand {
  name: "set";
  key: string;
  value: string;
}

export interface ParsedGetCommand {
  name: "get";
  key: string;
}

export type ParsedCommand =
  | ParsedInitCommand
  | ParsedRunCommand
  | ParsedListCommand
  | ParsedRemoveCommand
  | ParsedSetCommand
  | ParsedGetCommand;

export interface ParsedUsageError {
  type: "usage-error";
  message: string;
}

export interface ParsedCommandResult {
  type: "command";
  command: ParsedCommand;
}

export type ParseCliArgsResult =
  | ParsedHelp
  | ParsedUsageError
  | ParsedCommandResult;

function normalizeCommandName(
  commandName: string,
): "init" | "run" | "list" | "remove" | "set" | "get" | null {
  switch (commandName) {
    case "init":
    case "run":
    case "list":
    case "set":
    case "get":
      return commandName;
    case "remove":
      return "remove";
    case "ls":
      return "list";
    case "rm":
      return "remove";
    default:
      return null;
  }
}

export function parseCliArgs(argv: string[]): ParseCliArgsResult {
  const [commandName, ...commandArgs] = argv;

  if (
    !commandName ||
    commandName === "--help" ||
    commandName === "-h" ||
    commandName === "help"
  ) {
    return { type: "help" };
  }

  const normalizedCommand = normalizeCommandName(commandName);

  if (normalizedCommand === null) {
    return {
      type: "usage-error",
      message: `Unknown command: ${commandName}`,
    };
  }

  switch (normalizedCommand) {
    case "init":
      if (commandArgs.length > 1) {
        return {
          type: "usage-error",
          message: "init accepts at most one ID argument.",
        };
      }

      if (commandArgs[0] === undefined) {
        return {
          type: "command",
          command: {
            name: "init",
          },
        };
      }

      return {
        type: "command",
        command: {
          name: "init",
          id: commandArgs[0],
        },
      };

    case "run": {
      if (commandArgs[0] !== "--" || commandArgs.length < 2) {
        return {
          type: "usage-error",
          message: "run requires `-- <command> [args...]`.",
        };
      }

      const [command, ...args] = commandArgs.slice(1);

      if (command === undefined) {
        return {
          type: "usage-error",
          message: "run requires `-- <command> [args...]`.",
        };
      }

      return {
        type: "command",
        command: {
          name: "run",
          command,
          args,
        },
      };
    }

    case "list":
      if (commandArgs.length > 0) {
        return {
          type: "usage-error",
          message: "list does not accept positional arguments.",
        };
      }

      return {
        type: "command",
        command: {
          name: "list",
        },
      };

    case "remove":
      if (commandArgs.length !== 1) {
        return {
          type: "usage-error",
          message: "remove requires exactly one ID argument.",
        };
      }

      if (commandArgs[0] === undefined) {
        return {
          type: "usage-error",
          message: "remove requires exactly one ID argument.",
        };
      }

      return {
        type: "command",
        command: {
          name: "remove",
          id: commandArgs[0],
        },
      };

    case "set":
      if (commandArgs.length !== 2) {
        return {
          type: "usage-error",
          message: "set requires exactly `<key> <value>`.",
        };
      }

      if (commandArgs[0] === undefined || commandArgs[1] === undefined) {
        return {
          type: "usage-error",
          message: "set requires exactly `<key> <value>`.",
        };
      }

      return {
        type: "command",
        command: {
          name: "set",
          key: commandArgs[0],
          value: commandArgs[1],
        },
      };

    case "get":
      if (commandArgs.length !== 1) {
        return {
          type: "usage-error",
          message: "get requires exactly one key argument.",
        };
      }

      if (commandArgs[0] === undefined) {
        return {
          type: "usage-error",
          message: "get requires exactly one key argument.",
        };
      }

      return {
        type: "command",
        command: {
          name: "get",
          key: commandArgs[0],
        },
      };
  }
}
