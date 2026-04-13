#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { runScreenerPipeline } from "./pipeline.js";
import { renderScreenerHtml, renderScreenerMarkdown } from "./renderer.js";
import type { ScreenerConfig, ScreenerRunInput, ScreenerUniverseRow } from "./types.js";

type CliArgs = {
  market: "CN_A" | "HK";
  mode: "standalone" | "composed";
  inputJsonPath: string;
  configJsonPath?: string;
  outputDir: string;
};

function parseArgs(argv: string[]): CliArgs {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key || !key.startsWith("--")) continue;
    const name = key.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for argument: ${key}`);
    values[name] = value;
    i += 1;
  }
  return {
    market: (values.market ?? "CN_A") as "CN_A" | "HK",
    mode: (values.mode ?? "standalone") as "standalone" | "composed",
    inputJsonPath: values["input-json"] ?? "",
    configJsonPath: values["config-json"],
    outputDir: values["output-dir"] ?? "output",
  };
}

function toCsv(rows: ScreenerUniverseRow[]): string {
  const headers = [
    "code",
    "name",
    "market",
    "industry",
    "close",
    "pe",
    "pb",
    "dv",
    "marketCap",
    "turnover",
    "debtRatio",
    "grossMargin",
    "roe",
    "fcfYield",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    const rowMap = row as unknown as Record<string, unknown>;
    lines.push(headers.map((h) => JSON.stringify(rowMap[h] ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function loadJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.inputJsonPath) throw new Error("Missing --input-json <path>");

  const universe = await loadJson<ScreenerUniverseRow[]>(args.inputJsonPath);
  const cfg = args.configJsonPath ? await loadJson<Partial<ScreenerConfig>>(args.configJsonPath) : undefined;

  const input: ScreenerRunInput = {
    market: args.market,
    mode: args.mode,
    universe,
    config: cfg,
  };

  const result = await runScreenerPipeline(input);
  const outDir = path.resolve(args.outputDir);
  await writeText(path.join(outDir, "screener_results.json"), JSON.stringify(result, null, 2));
  await writeText(path.join(outDir, "screener_input.csv"), toCsv(universe));
  await writeText(path.join(outDir, "screener_report.md"), renderScreenerMarkdown(result));
  await writeText(path.join(outDir, "screener_report.html"), renderScreenerHtml(result));

  console.log(`[screener] json -> ${path.join(outDir, "screener_results.json")}`);
  console.log(`[screener] md -> ${path.join(outDir, "screener_report.md")}`);
  console.log(`[screener] html -> ${path.join(outDir, "screener_report.html")}`);
}

void main();
