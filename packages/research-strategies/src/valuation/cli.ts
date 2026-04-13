#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveInputPath, resolveOutputPath } from "../pipeline/resolve-monorepo-path.js";
import { runPhase3Strict } from "../phase3/analyzer.js";
import type { Phase3ExecutionResult } from "../phase3/types.js";

type CliArgs = {
  marketMdPath?: string;
  reportMdPath?: string;
  interimReportMdPath?: string;
  outputDir: string;
  fromManifest?: string;
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
    fromManifest: values["from-manifest"],
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

type BusinessAnalysisManifest = {
  manifestVersion?: string;
  outputs?: {
    marketPackPath?: string;
    dataPackReportPath?: string;
  };
  pipeline?: {
    valuation?: {
      relativePaths?: {
        marketMd?: string;
        reportMd?: string;
      };
    };
  };
};

function renderValuationSummaryMarkdown(result: Phase3ExecutionResult): string {
  const { report, valuation } = result;
  const methods = valuation.methods ?? [];
  const rows = methods.map((m) => {
    const hint =
      m.value !== undefined ? String(m.value) : m.range?.central !== undefined ? String(m.range.central) : "—";
    return `| ${String(m.method ?? "—")} | ${hint} | ${m.note ?? "—"} |`;
  });
  return [
    "# 估值摘要（valuation）",
    "",
    `- 标的：${valuation.code}`,
    `- 生成时间：${valuation.generatedAt}`,
    `- 报告结论：${report.decision === "buy" ? "买入" : report.decision === "watch" ? "观察" : "排除"}（置信度 ${report.confidence ?? "medium"}）`,
    "",
    "## 估值方法结果",
    "",
    "| 方法 | 要点 | 备注 |",
    "|:-----|:-----|:-----|",
    ...(rows.length > 0 ? rows : ["| — | 无方法输出 | — |"]),
    "",
    "> 完整 Phase3 报告请使用 `phase3:run` 或 `workflow:run`；本命令仅输出估值 JSON 与摘要。",
    "",
  ].join("\n");
}

async function resolvePathsFromManifest(
  manifestPath: string,
): Promise<{ marketMdPath: string; reportMdPath?: string; outputDir: string }> {
  const absManifest = resolveInputPath(manifestPath);
  const baseDir = path.dirname(absManifest);
  const raw = await readFile(absManifest, "utf-8");
  const manifest = JSON.parse(raw) as BusinessAnalysisManifest;

  const rel = manifest.pipeline?.valuation?.relativePaths;
  if (rel?.marketMd) {
    return {
      marketMdPath: path.join(baseDir, rel.marketMd),
      reportMdPath: rel.reportMd ? path.join(baseDir, rel.reportMd) : undefined,
      outputDir: baseDir,
    };
  }

  const market = manifest.outputs?.marketPackPath;
  if (!market) {
    throw new Error(
      "[valuation --from-manifest] manifest 缺少 pipeline.valuation.relativePaths 或 outputs.marketPackPath",
    );
  }
  return {
    marketMdPath: path.isAbsolute(market) ? market : path.join(baseDir, market),
    reportMdPath: manifest.outputs?.dataPackReportPath
      ? path.isAbsolute(manifest.outputs.dataPackReportPath)
        ? manifest.outputs.dataPackReportPath
        : path.join(baseDir, manifest.outputs.dataPackReportPath)
      : undefined,
    outputDir: baseDir,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let marketMdPath = args.marketMdPath;
  let reportMdPath = args.reportMdPath;
  const interimReportMdPath = args.interimReportMdPath;
  let outDir = resolveOutputPath(args.outputDir);

  if (args.fromManifest) {
    const resolved = await resolvePathsFromManifest(args.fromManifest);
    marketMdPath = marketMdPath ?? resolved.marketMdPath;
    reportMdPath = reportMdPath ?? resolved.reportMdPath;
    outDir =
      args.outputDir === "output" ? resolved.outputDir : resolveOutputPath(args.outputDir);
  }

  if (!marketMdPath) {
    throw new Error(
      "缺少输入：请提供 --market-md <data_pack_market.md> 或 --from-manifest <business_analysis_manifest.json>",
    );
  }

  const marketAbs = resolveInputPath(marketMdPath);
  const reportAbs = reportMdPath ? resolveInputPath(reportMdPath) : undefined;

  const marketMarkdown = await readFile(marketAbs, "utf-8");
  const reportMarkdown = await readOptional(reportAbs);
  const interimReportMarkdown = await readOptional(
    interimReportMdPath ? resolveInputPath(interimReportMdPath) : undefined,
  );

  const result = runPhase3Strict({
    marketMarkdown,
    reportMarkdown,
    interimReportMarkdown,
  });

  const summaryMd = renderValuationSummaryMarkdown(result);
  const valuationPath = path.join(outDir, "valuation_computed.json");
  const summaryPath = path.join(outDir, "valuation_summary.md");

  await writeText(valuationPath, JSON.stringify(result.valuation, null, 2));
  await writeText(summaryPath, summaryMd);

  console.log(`[valuation] valuation -> ${valuationPath}`);
  console.log(`[valuation] summary(md) -> ${summaryPath}`);
}

void main();
