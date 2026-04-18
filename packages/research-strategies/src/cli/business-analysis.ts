#!/usr/bin/env node

import { initCliEnv } from "../lib/init-cli-env.js";
import { runBusinessAnalysis } from "../app/business-analysis/orchestrator.js";
import type { WorkflowMode, WorkflowStrategyId } from "../contracts/workflow-run-types.js";

type CliArgs = {
  code?: string;
  year?: string;
  companyName?: string;
  from?: string;
  to?: string;
  outputDir?: string;
  pdfPath?: string;
  reportUrl?: string;
  category?: string;
  phase1bChannel?: "http" | "mcp";
  mode?: WorkflowMode;
  strategy?: WorkflowStrategyId;
  strict?: boolean;
  interimReportMdPath?: string;
  interimPdfPath?: string;
  refreshMarket?: boolean;
  preflightRemedyPass?: number;
};

function parseArgs(argv: string[]): CliArgs {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (key === "--refresh-market") {
      flags.add("refresh-market");
      continue;
    }
    if (key === "--strict") {
      flags.add("strict");
      continue;
    }
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for argument: ${key}`);
    values[key.slice(2)] = value;
    i += 1;
  }

  const channel = values["phase1b-channel"];
  if (channel && channel !== "http" && channel !== "mcp") {
    throw new Error(`Invalid --phase1b-channel: ${channel}`);
  }

  const mode = values.mode as WorkflowMode | undefined;
  if (mode && mode !== "standard" && mode !== "turtle-strict") {
    throw new Error(`Invalid --mode: ${mode} (expected standard|turtle-strict)`);
  }

  const strategy = values.strategy as CliArgs["strategy"] | undefined;
  if (strategy && strategy !== "turtle" && strategy !== "value_v1") {
    throw new Error(`Invalid --strategy: ${strategy} (expected turtle|value_v1)`);
  }

  const passRaw = values["preflight-remedy-pass"];
  let preflightRemedyPass: number | undefined;
  if (passRaw !== undefined) {
    const n = Number(passRaw);
    if (!Number.isFinite(n) || (n !== 0 && n !== 1)) {
      throw new Error(`Invalid --preflight-remedy-pass: ${passRaw} (expected 0|1)`);
    }
    preflightRemedyPass = n;
  }

  return {
    code: values.code,
    year: values.year,
    companyName: values["company-name"],
    from: values.from,
    to: values.to,
    outputDir: values["output-dir"],
    pdfPath: values.pdf,
    reportUrl: values["report-url"],
    category: values.category,
    phase1bChannel: channel as "http" | "mcp" | undefined,
    mode,
    strategy,
    strict: flags.has("strict"),
    interimReportMdPath: values["interim-report-md"],
    interimPdfPath: values["interim-pdf"],
    refreshMarket: flags.has("refresh-market"),
    preflightRemedyPass,
  };
}

async function main(): Promise<void> {
  initCliEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.code) throw new Error("Missing required argument: --code <stock-code>");

  const result = await runBusinessAnalysis({
    code: args.code,
    year: args.year,
    companyName: args.companyName,
    from: args.from,
    to: args.to,
    outputDir: args.outputDir,
    pdfPath: args.pdfPath,
    reportUrl: args.reportUrl,
    category: args.category,
    phase1bChannel: args.phase1bChannel,
    mode: args.mode,
    strategy: args.strategy,
    strict: args.strict,
    interimReportMdPath: args.interimReportMdPath,
    interimPdfPath: args.interimPdfPath,
    refreshMarket: args.refreshMarket,
    preflightRemedyPass: args.preflightRemedyPass,
  });

  console.log(`[business-analysis] outputDir -> ${result.outputDir}`);
  console.log(`[business-analysis] qualitative_report -> ${result.qualitativeReportPath}`);
  console.log(`[business-analysis] qualitative_d1_d6 -> ${result.qualitativeD1D6Path}`);
  console.log(`[business-analysis] data_pack_market -> ${result.marketPackPath}`);
  if (result.dataPackReportPath) console.log(`[business-analysis] data_pack_report -> ${result.dataPackReportPath}`);
  if (result.dataPackReportInterimPath) {
    console.log(`[business-analysis] data_pack_report_interim -> ${result.dataPackReportInterimPath}`);
  }
  console.log(`[business-analysis] manifest -> ${result.manifestPath}`);
}

void main();
