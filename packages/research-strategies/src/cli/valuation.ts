#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveValuationOrPhase3DefaultRunDirectory } from "../contracts/output-layout-v2.js";
import { resolveInputPath, resolveOutputPath } from "../pipeline/resolve-monorepo-path.js";
import { runPhase3Strict } from "../stages/phase3/analyzer.js";
import { renderPhase3Html, renderPhase3Markdown } from "../stages/phase3/report-renderer.js";
import type { Phase3ExecutionResult } from "../stages/phase3/types.js";

type CliArgs = {
  marketMdPath?: string;
  reportMdPath?: string;
  interimReportMdPath?: string;
  outputDir: string;
  /** 默认输出 v2 目录名用（`--output-dir output` 时）；可从 manifest 推断时可不传 */
  code?: string;
  fromManifest?: string;
  fullReport?: boolean;
};

const VALUATION_BOOLEAN_FLAGS = new Set(["full-report"]);

function parseArgs(argv: string[]): CliArgs {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    if (VALUATION_BOOLEAN_FLAGS.has(name)) {
      flags.add(name);
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for argument: --${name}`);
    values[name] = next;
    i += 1;
  }
  return {
    marketMdPath: values["market-md"],
    reportMdPath: values["report-md"],
    interimReportMdPath: values["interim-report-md"],
    outputDir: values["output-dir"] ?? "output",
    code: values.code,
    fromManifest: values["from-manifest"],
    fullReport: flags.has("full-report"),
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
        interimReportMd?: string;
      };
    };
  };
};

function renderValuationSummaryMarkdown(result: Phase3ExecutionResult, fullReport?: boolean): string {
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
    fullReport
      ? "> 已通过 `--full-report` 输出同目录 `analysis_report.md` / `analysis_report.html`。"
      : "> 完整 Phase3 报告可使用包内 `run:phase3`、根目录 `pnpm run workflow:run`，或 `valuation:run --full-report`。",
    "",
  ].join("\n");
}

async function resolvePathsFromManifest(
  manifestPath: string,
): Promise<{ marketMdPath: string; reportMdPath?: string; interimReportMdPath?: string; outputDir: string }> {
  const absManifest = resolveInputPath(manifestPath);
  const baseDir = path.dirname(absManifest);
  const raw = await readFile(absManifest, "utf-8");
  const manifest = JSON.parse(raw) as BusinessAnalysisManifest;

  const rel = manifest.pipeline?.valuation?.relativePaths;
  if (rel?.marketMd) {
    return {
      marketMdPath: path.join(baseDir, rel.marketMd),
      reportMdPath: rel.reportMd ? path.join(baseDir, rel.reportMd) : undefined,
      interimReportMdPath: rel.interimReportMd ? path.join(baseDir, rel.interimReportMd) : undefined,
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
    interimReportMdPath: undefined,
    outputDir: baseDir,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let marketMdPath = args.marketMdPath;
  let reportMdPath = args.reportMdPath;
  let interimReportMdPath = args.interimReportMdPath;
  let outDir = resolveValuationOrPhase3DefaultRunDirectory({
    outputDirArg: args.outputDir,
    stockCode: args.code,
  }).outputDir;

  if (args.fromManifest) {
    const resolved = await resolvePathsFromManifest(args.fromManifest);
    marketMdPath = marketMdPath ?? resolved.marketMdPath;
    reportMdPath = reportMdPath ?? resolved.reportMdPath;
    interimReportMdPath = interimReportMdPath ?? resolved.interimReportMdPath;
    if (args.outputDir === "output") {
      outDir = resolved.outputDir;
    } else {
      outDir = resolveOutputPath(args.outputDir);
    }
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

  const summaryMd = renderValuationSummaryMarkdown(result, args.fullReport);
  const valuationPath = path.join(outDir, "valuation_computed.json");
  const summaryPath = path.join(outDir, "valuation_summary.md");

  await writeText(valuationPath, JSON.stringify(result.valuation, null, 2));
  await writeText(summaryPath, summaryMd);

  console.log(`[valuation] valuation -> ${valuationPath}`);
  console.log(`[valuation] summary(md) -> ${summaryPath}`);

  if (args.fullReport) {
    const fullMd = renderPhase3Markdown(result);
    const reportMdPath = path.join(outDir, "analysis_report.md");
    const reportHtmlPath = path.join(outDir, "analysis_report.html");
    await writeText(reportMdPath, fullMd);
    await writeText(reportHtmlPath, renderPhase3Html(fullMd));
    console.log(`[valuation] report(md) -> ${reportMdPath}`);
    console.log(`[valuation] report(html) -> ${reportHtmlPath}`);
  }
}

void main();
