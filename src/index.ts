#!/usr/bin/env node

import { dispatch } from "./cli/dispatcher.js";

async function main(): Promise<void> {
  try {
    process.exitCode = await dispatch(process.argv.slice(2));
  } catch {
    console.error("Unexpected failure.");
    process.exitCode = 4;
  }
}

void main();
