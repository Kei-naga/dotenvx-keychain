#!/usr/bin/env node

import { dispatch } from "./cli/dispatcher.js";
import { CLI_EXIT_CODE } from "./cli/exitCodes.js";

async function main(): Promise<void> {
  try {
    process.exitCode = await dispatch(process.argv.slice(2));
  } catch {
    console.error("Unexpected failure.");
    process.exitCode = CLI_EXIT_CODE.infrastructure;
  }
}

void main();
