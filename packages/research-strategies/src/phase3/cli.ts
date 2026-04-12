#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { runPhase3Analysis } from "./analyzer.js";
import { renderPhase3Html, renderPhase3Markdown } from "./report-renderer.js";
import type { Phase3MarketInput } from "./types.js";

type CliArgs = {
  code?: string;
  marketJsonPath?: string;
  reportMdPath?: string;
  outputDir: string;
};

function parseArgs(argv: string[]): CliArgs {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for argument: ${key}`);
    values[name] = value;
    i += 1;
  }

  return {
    code: values["code"],
    marketJsonPath: values["market-json"],
    reportMdPath: values["report-md"],
    outputDir: values["output-dir"] ?? "output",
  };
}

async function readOptionalText(filePath?: string): Promise<string | undefined> {
  if (!filePath) return undefined;
  return readFile(filePath, "utf-8");
}

async function loadMarketInput(args: CliArgs): Promise<Phase3MarketInput> {
  if (args.marketJsonPath) {
    const raw = await readFile(args.marketJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Phase3MarketInput>;
    return {
      code: parsed.code ?? args.code ?? "UNKNOWN",
      ...parsed,
    } as Phase3MarketInput;
  }
  if (!args.code) {
    throw new Error("Missing input: provide --market-json <path> or --code <stock-code>");
  }
  return {
    code: args.code,
  };
}

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const market = await loadMarketInput(args);
  const reportMarkdown = await readOptionalText(args.reportMdPath);

  const result = runPhase3Analysis({ market, reportMarkdown });
  const outDir = path.resolve(args.outputDir);
  const valuationPath = path.join(outDir, "valuation_computed.json");
  const reportMdPath = path.join(outDir, "analysis_report.md");
  const reportHtmlPath = path.join(outDir, "analysis_report.html");

  await writeText(valuationPath, JSON.stringify(result.valuation, null, 2));
  await writeText(reportMdPath, renderPhase3Markdown(result.report));
  await writeText(reportHtmlPath, renderPhase3Html(result.report));

  console.log(`[phase3] valuation -> ${valuationPath}`);
  console.log(`[phase3] report(md) -> ${reportMdPath}`);
  console.log(`[phase3] report(html) -> ${reportHtmlPath}`);
}

void main();
