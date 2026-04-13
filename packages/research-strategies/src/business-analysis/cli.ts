#!/usr/bin/env node

import { runBusinessAnalysis } from "./orchestrator.js";

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
  strict?: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
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
    strict: flags.has("strict"),
  };
}

async function main(): Promise<void> {
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
    strict: args.strict,
  });

  console.log(`[business-analysis] outputDir -> ${result.outputDir}`);
  console.log(`[business-analysis] qualitative_report -> ${result.qualitativeReportPath}`);
  console.log(`[business-analysis] qualitative_d1_d6 -> ${result.qualitativeD1D6Path}`);
  console.log(`[business-analysis] data_pack_market -> ${result.marketPackPath}`);
  if (result.dataPackReportPath) console.log(`[business-analysis] data_pack_report -> ${result.dataPackReportPath}`);
  console.log(`[business-analysis] manifest -> ${result.manifestPath}`);
}

void main();
