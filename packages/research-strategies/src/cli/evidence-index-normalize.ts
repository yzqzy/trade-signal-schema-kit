#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

import { initCliEnv } from "../lib/init-cli-env.js";
import { resolveInputPath, resolveOutputPath } from "../crosscut/normalization/resolve-monorepo-path.js";
import { normalizeEvidenceIndexTable } from "../crosscut/normalization/evidence-index-table-normalizer.js";

type CliArgs = {
  inputMdPath?: string;
  outputMdPath?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for argument: --${name}`);
    values[name] = next;
    i += 1;
  }
  return {
    inputMdPath: values["input-md"] ?? values["input"],
    outputMdPath: values["output-md"] ?? values["output"],
  };
}

async function main(): Promise<void> {
  initCliEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.inputMdPath) {
    throw new Error(
      "Missing required argument: --input-md <path-to-qualitative_report.md> [--output-md <path>]",
    );
  }

  const inputAbs = resolveInputPath(args.inputMdPath);
  const outputAbs = args.outputMdPath ? resolveOutputPath(args.outputMdPath) : inputAbs;

  const source = await readFile(inputAbs, "utf-8");
  const normalized = normalizeEvidenceIndexTable(source);
  await writeFile(outputAbs, normalized, "utf-8");

  console.log(`[evidence-index-normalize] wrote -> ${outputAbs}`);
}

void main();
