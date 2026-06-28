import { describe, expect, it } from "vitest";

import { parseCliArgs } from "../../src/cli/parseArgs.js";

describe("parseCliArgs", () => {
  it("treats empty argv as help", () => {
    expect(parseCliArgs([])).toEqual({ type: "help" });
  });

  it("parses init with and without an explicit ID", () => {
    expect(parseCliArgs(["init"])).toEqual({
      type: "command",
      command: {
        name: "init",
      },
    });

    expect(parseCliArgs(["init", "my-app"])).toEqual({
      type: "command",
      command: {
        name: "init",
        id: "my-app",
      },
    });
  });

  it("normalizes list and remove aliases", () => {
    expect(parseCliArgs(["ls"])).toEqual({
      type: "command",
      command: {
        name: "list",
      },
    });

    expect(parseCliArgs(["rm", "my-app"])).toEqual({
      type: "command",
      command: {
        name: "remove",
        id: "my-app",
      },
    });
  });

  it("requires the explicit run separator and child command", () => {
    expect(parseCliArgs(["run"])).toEqual({
      type: "usage-error",
      message: "run requires `-- <command> [args...]`.",
    });

    expect(parseCliArgs(["run", "node", "app.js"])).toEqual({
      type: "usage-error",
      message: "run requires `-- <command> [args...]`.",
    });

    expect(parseCliArgs(["run", "--", "node", "app.js"])).toEqual({
      type: "command",
      command: {
        name: "run",
        command: "node",
        args: ["app.js"],
      },
    });
  });

  it("parses set and get commands with their minimal positional arguments", () => {
    expect(parseCliArgs(["set", "HELLO", "world"])).toEqual({
      type: "command",
      command: {
        name: "set",
        key: "HELLO",
        value: "world",
      },
    });

    expect(parseCliArgs(["get", "HELLO"])).toEqual({
      type: "command",
      command: {
        name: "get",
        key: "HELLO",
      },
    });
  });

  it("rejects invalid argument counts for init, list, and remove", () => {
    expect(parseCliArgs(["init", "one", "two"])).toEqual({
      type: "usage-error",
      message: "init accepts at most one ID argument.",
    });

    expect(parseCliArgs(["list", "extra"])).toEqual({
      type: "usage-error",
      message: "list does not accept positional arguments.",
    });

    expect(parseCliArgs(["remove"])).toEqual({
      type: "usage-error",
      message: "remove requires exactly one ID argument.",
    });

    expect(parseCliArgs(["set", "HELLO"])).toEqual({
      type: "usage-error",
      message: "set requires exactly `<key> <value>`.",
    });

    expect(parseCliArgs(["get", "HELLO", "extra"])).toEqual({
      type: "usage-error",
      message: "get requires exactly one key argument.",
    });
  });

  it("reports unknown commands as usage errors", () => {
    expect(parseCliArgs(["deploy"])).toEqual({
      type: "usage-error",
      message: "Unknown command: deploy",
    });
  });
});
