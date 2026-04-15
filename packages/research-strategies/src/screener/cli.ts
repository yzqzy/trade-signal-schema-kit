#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveScreenerRunDirectory } from "../contracts/output-layout-v2.js";
import { ScreenerDiskCache } from "./cache.js";
import { resolveScreenerConfig, validateScreenerConfig } from "./config.js";
import { exportScreenerResultsCsv, exportScreenerUniverseCsv } from "./export-results.js";
import { runScreenerPipeline } from "./pipeline.js";
import { renderScreenerHtml, renderScreenerMarkdown } from "./renderer.js";
import type { ScreenerConfigOverrides, ScreenerRunInput, ScreenerUniverseRow } from "./types.js";

type CliArgs = {
  market: "CN_A" | "HK";
  mode: "standalone" | "composed";
  inputJsonPath: string;
  configJsonPath?: string;
  outputDir: string;
  tier1Only: boolean;
  tier2Limit?: number;
  minRoe?: number;
  maxPe?: number;
  minGrossMargin?: number;
  cacheDir?: string;
  cacheRefresh: boolean;
  cacheTier2Refresh: boolean;
  csvPath?: string;
  htmlPath?: string;
  skipDefaultCsv: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const flags = new Set<string>();
  const values: Record<string, string> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key?.startsWith("--")) continue;
    const name = key.slice(2).replaceAll("-", "_");

    const next = argv[i + 1];
    if (
      name === "tier1_only" ||
      name === "cache_refresh" ||
      name === "cache_tier2_refresh" ||
      name === "skip_default_csv"
    ) {
      flags.add(name);
      continue;
    }

    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for argument: ${key}`);
    }
    values[name] = next;
    i += 1;
  }

  return {
    market: (values.market ?? "CN_A") as "CN_A" | "HK",
    mode: (values.mode ?? "standalone") as "standalone" | "composed",
    inputJsonPath: values.input_json ?? "",
    configJsonPath: values.config_json,
    outputDir: values.output_dir ?? values.output ?? "output",
    tier1Only: flags.has("tier1_only"),
    tier2Limit: values.tier2_limit !== undefined ? Number(values.tier2_limit) : undefined,
    minRoe: values.min_roe !== undefined ? Number(values.min_roe) : undefined,
    maxPe: values.max_pe !== undefined ? Number(values.max_pe) : undefined,
    minGrossMargin: values.min_gross_margin !== undefined ? Number(values.min_gross_margin) : undefined,
    cacheDir: values.cache_dir,
    cacheRefresh: flags.has("cache_refresh"),
    cacheTier2Refresh: flags.has("cache_tier2_refresh"),
    csvPath: values.csv,
    htmlPath: values.html,
    skipDefaultCsv: flags.has("skip_default_csv"),
  };
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
  const fileCfg = args.configJsonPath ? await loadJson<ScreenerConfigOverrides>(args.configJsonPath) : {};

  const cliOverrides: ScreenerConfigOverrides = { ...fileCfg };
  if (args.minRoe !== undefined) cliOverrides.minRoe = args.minRoe;
  if (args.maxPe !== undefined) cliOverrides.maxPe = args.maxPe;
  if (args.minGrossMargin !== undefined) cliOverrides.minGrossMargin = args.minGrossMargin;
  if (args.cacheDir !== undefined) cliOverrides.cacheDir = args.cacheDir;

  const cfg = resolveScreenerConfig(args.market, cliOverrides);
  const verr = validateScreenerConfig(cfg);
  if (verr.length) throw new Error(`ScreenerConfig invalid: ${verr.join("; ")}`);

  const cacheRoot = path.resolve(cfg.cacheDir);
  const disk = new ScreenerDiskCache(cacheRoot);
  if (args.cacheRefresh) {
    await disk.clear();
    console.log(`[screener] cache cleared -> ${cacheRoot}`);
  } else if (args.cacheTier2Refresh) {
    await disk.invalidatePrefix("tier2_");
    await disk.invalidatePrefix("global_");
    console.log(`[screener] tier2/global cache invalidated -> ${cacheRoot}`);
  }

  const input: ScreenerRunInput = {
    market: args.market,
    mode: args.mode,
    universe,
    config: cliOverrides,
    tier1Only: args.tier1Only,
    tier2Limit: args.tier2Limit,
  };

  const result = await runScreenerPipeline(input);
  const cap = result.capability;

  if (cap?.status === "hk_not_ready") {
    const msg = cap.messages.join(" ");
    console.error(`[screener] HK_UNIVERSE_NOT_READY: ${msg}`);
    console.error(
      JSON.stringify({
        screenerExit: { status: cap.status, reasonCodes: cap.reasonCodes },
      }),
    );
    process.exitCode = 2;
  } else if (cap?.status === "blocked_missing_required_fields") {
    const msg = cap.messages.join(" ");
    console.error(`[screener] BLOCKED: ${msg}`);
    console.error(
      JSON.stringify({
        screenerExit: { status: cap.status, reasonCodes: cap.reasonCodes },
      }),
    );
    process.exitCode = 1;
  } else if (cap?.status === "degraded_tier2_fields") {
    console.warn(`[screener] DEGRADED_TIER2: ${cap.messages.join(" ")}`);
    console.warn(
      JSON.stringify({
        screenerWarning: { status: cap.status, reasonCodes: cap.reasonCodes },
      }),
    );
  }

  const { outputDir: outDir } = resolveScreenerRunDirectory({
    outputRootArg: args.outputDir,
    market: args.market,
    mode: args.mode,
  });
  await mkdir(outDir, { recursive: true });
  await writeText(path.join(outDir, "screener_results.json"), JSON.stringify(result, null, 2));
  await writeText(path.join(outDir, "screener_input.csv"), exportScreenerUniverseCsv(universe));
  await writeText(path.join(outDir, "screener_report.md"), renderScreenerMarkdown(result));
  await writeText(path.join(outDir, "screener_report.html"), renderScreenerHtml(result));

  if (args.csvPath) {
    await writeText(path.resolve(args.csvPath), exportScreenerResultsCsv(result));
    console.log(`[screener] csv -> ${path.resolve(args.csvPath)}`);
  }
  if (!args.tier1Only && !args.skipDefaultCsv && !args.csvPath) {
    const defaultCsv = path.join(outDir, "screener_results.csv");
    await writeText(defaultCsv, exportScreenerResultsCsv(result));
    console.log(`[screener] csv -> ${defaultCsv}`);
  }
  if (args.htmlPath) {
    await writeText(path.resolve(args.htmlPath), renderScreenerHtml(result));
    console.log(`[screener] html(extra) -> ${path.resolve(args.htmlPath)}`);
  }

  console.log(`[screener] json -> ${path.join(outDir, "screener_results.json")}`);
  console.log(`[screener] md -> ${path.join(outDir, "screener_report.md")}`);
  console.log(`[screener] html -> ${path.join(outDir, "screener_report.html")}`);
}

void main();
