#!/usr/bin/env node

import { initCliEnv } from "../lib/init-cli-env.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveScreenerRunDirectory } from "../contracts/output-layout-v2.js";
import { ScreenerDiskCache } from "./cache.js";
import { resolveScreenerConfig, validateScreenerConfig } from "./config.js";
import { exportScreenerResultsCsv, exportScreenerUniverseCsv } from "./export-results.js";
import { runScreenerPipeline } from "./pipeline.js";
import { renderScreenerHtml, renderScreenerMarkdown } from "./renderer.js";
import { buildSelectionManifestV1 } from "./selection-manifest-v2.js";
import type { ScreenerConfigOverrides, ScreenerRunInput, ScreenerUniverseRow } from "./types.js";
import { loadOrFetchUniverseSnapshot } from "./universe-snapshot.js";

type CliArgs = {
  market: "CN_A" | "HK";
  mode: "standalone" | "composed";
  inputJsonPath?: string;
  feedBaseUrl?: string;
  feedApiBasePath?: string;
  feedApiKey?: string;
  universePageSize?: number;
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
  refreshUniverse: boolean;
  csvPath?: string;
  htmlPath?: string;
  skipDefaultCsv: boolean;
  rankingsTopN?: number;
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
      name === "refresh_universe" ||
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
    inputJsonPath: values.input_json,
    feedBaseUrl: values.feed_base_url,
    feedApiBasePath: values.feed_api_base_path,
    feedApiKey: values.feed_api_key,
    universePageSize: values.universe_page_size !== undefined ? Number(values.universe_page_size) : undefined,
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
    refreshUniverse: flags.has("refresh_universe"),
    csvPath: values.csv,
    htmlPath: values.html,
    skipDefaultCsv: flags.has("skip_default_csv"),
    rankingsTopN:
      values.rankings_top_n !== undefined ? Number(values.rankings_top_n) : undefined,
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
  initCliEnv();
  const args = parseArgs(process.argv.slice(2));

  const universe = args.inputJsonPath
    ? await loadJson<ScreenerUniverseRow[]>(args.inputJsonPath)
    : (
        await loadOrFetchUniverseSnapshot({
          market: args.market,
          outputRoot: args.outputDir,
          feedBaseUrl: args.feedBaseUrl,
          feedApiBasePath: args.feedApiBasePath,
          feedApiKey: args.feedApiKey,
          pageSize: args.universePageSize ?? 500,
          refresh: args.refreshUniverse,
        })
      ).rows;
  if (!Array.isArray(universe)) throw new Error("[screener] universe 须为数组");
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
  const runId = path.basename(outDir);

  const topNRaw = args.rankingsTopN;
  const rankingsTopN =
    typeof topNRaw === "number" && Number.isFinite(topNRaw) && topNRaw > 0
      ? Math.floor(topNRaw)
      : 200;
  await writeText(
    path.join(outDir, "selection_manifest.json"),
    JSON.stringify(buildSelectionManifestV1(result, runId, { rankingsTopN }), null, 2),
  );

  const passedRanking = result.results.filter((r) => r.passed && r.decision !== "avoid").length;
  console.log(
    `[screener] summary: market=${result.market} mode=${result.mode} ` +
      `universe=${result.totalUniverse} tier1=${result.tier1Count} ` +
      `passed=${passedRanking}/${result.passedCount} results=${result.results.length} ` +
      `rankingsTopN=${rankingsTopN} capability=${result.capability?.status ?? "n/a"}`,
  );
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
