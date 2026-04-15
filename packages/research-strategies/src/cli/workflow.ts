#!/usr/bin/env node

import { createDefaultWorkflowOrchestratorAdapter } from "../orchestrator/workflow-orchestrator-adapter.js";
import type { WorkflowMode } from "../contracts/workflow-run-types.js";

type ResumeFromStage = "B" | "D";

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
  /** Stage E 策略插件 */
  strategy?: "turtle" | "value_v1";
  preflight?: "off" | "strict";
  interimReportMdPath?: string;
  interimPdfPath?: string;
  refreshMarket?: boolean;
  preflightRemedyPass?: number;
  /** 从 checkpoint 续跑；必须与 `--output-dir` 指向 run 根目录同用 */
  resumeFromStage?: ResumeFromStage;
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

  const preflight = values.preflight as CliArgs["preflight"] | undefined;
  if (preflight && preflight !== "off" && preflight !== "strict") {
    throw new Error(`Invalid --preflight: ${preflight} (expected off|strict)`);
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

  const resumeRaw = values["resume-from-stage"];
  const resumeFromStage = resumeRaw as ResumeFromStage | undefined;
  if (resumeRaw && resumeRaw !== "B" && resumeRaw !== "D") {
    throw new Error(`Invalid --resume-from-stage: ${resumeRaw} (expected B|D)`);
  }
  if (resumeFromStage && !values["output-dir"]?.trim()) {
    throw new Error("[workflow] --resume-from-stage 必须同时提供 --output-dir，指向含 checkpoint 的 run 根目录");
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
    preflight,
    interimReportMdPath: values["interim-report-md"],
    interimPdfPath: values["interim-pdf"],
    refreshMarket: flags.has("refresh-market"),
    preflightRemedyPass,
    resumeFromStage,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.code) throw new Error("Missing required argument: --code <stock-code>");

  const orchestrator = createDefaultWorkflowOrchestratorAdapter();
  const result = await orchestrator.runStages({
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
    preflight: args.preflight,
    interimReportMdPath: args.interimReportMdPath,
    interimPdfPath: args.interimPdfPath,
    refreshMarket: args.refreshMarket,
    preflightRemedyPass: args.preflightRemedyPass,
    resumeFromStage: args.resumeFromStage,
  });

  console.log(`[workflow] outputDir -> ${result.outputDir}`);
  console.log(`[workflow] phase1a -> ${result.phase1aJsonPath}`);
  console.log(`[workflow] marketPack -> ${result.marketPackPath}`);
  if (result.phase3PreflightPath) console.log(`[workflow] phase3_preflight -> ${result.phase3PreflightPath}`);
  console.log(`[workflow] phase1b -> ${result.phase1bMarkdownPath}`);
  if (result.phase2aJsonPath) console.log(`[workflow] phase2a -> ${result.phase2aJsonPath}`);
  if (result.phase2bMarkdownPath) console.log(`[workflow] phase2b -> ${result.phase2bMarkdownPath}`);
  if (result.phase2bInterimMarkdownPath) {
    console.log(`[workflow] phase2b_interim -> ${result.phase2bInterimMarkdownPath}`);
  }
  console.log(`[workflow] phase3 valuation -> ${result.valuationPath}`);
  console.log(`[workflow] phase3 report(md) -> ${result.reportMarkdownPath}`);
  console.log(`[workflow] phase3 report(html) -> ${result.reportHtmlPath}`);
  console.log(`[workflow] manifest -> ${result.manifestPath}`);
}

void main();
