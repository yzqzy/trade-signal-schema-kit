#!/usr/bin/env node

import { initCliEnv } from "../lib/init-cli-env.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolvePhase3DefaultRunDirectory } from "../contracts/output-layout-v2.js";
import { appendFeedGapSection, evaluateFeedDataGaps } from "../crosscut/feed-gap/feed-gap-contract.js";
import { runPhase3Strict } from "../steps/phase3/analyzer.js";
import { parseDataPackMarket } from "../steps/phase3/market-pack-parser.js";
import { renderPhase3Html, renderPhase3Markdown } from "../steps/phase3/report-renderer.js";

type CliArgs = {
  marketMdPath?: string;
  reportMdPath?: string;
  interimReportMdPath?: string;
  outputDir: string;
  code?: string;
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
    marketMdPath: values["market-md"],
    reportMdPath: values["report-md"],
    interimReportMdPath: values["interim-report-md"],
    outputDir: values["output-dir"] ?? "output",
    code: values.code,
  };
}

async function readOptional(filePath?: string): Promise<string | undefined> {
  if (!filePath) return undefined;
  return readFile(filePath, "utf-8");
}

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

async function main(): Promise<void> {
  initCliEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.marketMdPath) {
    throw new Error("Missing required argument --market-md <data_pack_market.md>");
  }

  const marketMarkdown = await readFile(args.marketMdPath, "utf-8");
  const reportMarkdown = await readOptional(args.reportMdPath);
  const interimReportMarkdown = await readOptional(args.interimReportMdPath);

  const result = runPhase3Strict({
    marketMarkdown,
    reportMarkdown,
    interimReportMarkdown,
  });

  const parsedMarket = parseDataPackMarket(marketMarkdown);
  const feedGaps = evaluateFeedDataGaps({
    marketMarkdown,
    hasDataPackReport: Boolean(reportMarkdown?.trim()),
    companyName: parsedMarket.name,
  });
  const markdown = appendFeedGapSection(renderPhase3Markdown(result), feedGaps);
  const html = renderPhase3Html(markdown);

  const outDir = resolvePhase3DefaultRunDirectory({
    outputDirArg: args.outputDir,
    stockCode: args.code,
  }).outputDir;
  const valuationPath = path.join(outDir, "valuation_computed.json");
  const reportMdPath = path.join(outDir, "analysis_report.md");
  const reportHtmlPath = path.join(outDir, "analysis_report.html");

  await writeText(valuationPath, JSON.stringify(result.valuation, null, 2));
  await writeText(reportMdPath, markdown);
  await writeText(reportHtmlPath, html);

  console.log(`[phase3] valuation -> ${valuationPath}`);
  console.log(`[phase3] report(md) -> ${reportMdPath}`);
  console.log(`[phase3] report(html) -> ${reportHtmlPath}`);
}

void main();
