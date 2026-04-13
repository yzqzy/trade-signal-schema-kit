import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DataPackMarket } from "@trade-signal/schema-core";
import { createFeedHttpProviderFromEnv } from "@trade-signal/provider-http";

import { runPhase0DownloadAndCache } from "../phase0/downloader.js";
import { discoverPhase0ReportUrlFromFeed } from "../phase0/discover-report-url.js";
import { collectPhase1ADataPack } from "../phase1a/collector.js";
import { collectPhase1BQualitative } from "../phase1b/collector.js";
import type { Phase1BQualitativeSupplement } from "../phase1b/types.js";
import { renderPhase1BMarkdown } from "../phase1b/renderer.js";
import { runPhase2AExtractPdfSections } from "../phase2a/extractor.js";
import { renderPhase2BDataPackReport } from "../phase2b/renderer.js";
import { runPhase3Strict } from "../phase3/analyzer.js";
import { renderPhase3Html, renderPhase3Markdown } from "../phase3/report-renderer.js";
import {
  strictWorkflowTurtleDiscoveryFailed,
  strictWorkflowTurtleMissingReportPack,
} from "../pipeline/strict-messages.js";

export type WorkflowMode = "standard" | "turtle-strict";

export interface RunWorkflowInput {
  code: string;
  year?: string;
  companyName?: string;
  from?: string;
  to?: string;
  outputDir?: string;
  pdfPath?: string;
  reportUrl?: string;
  category?: string;
  phase1bChannel?: "http" | "mcp";
  /** standard：兼容旧行为；turtle-strict：关键输入缺失时 fail-fast */
  mode?: WorkflowMode;
}

export interface WorkflowArtifacts {
  outputDir: string;
  phase1aJsonPath: string;
  marketPackPath: string;
  phase1bJsonPath: string;
  phase1bMarkdownPath: string;
  pdfPath?: string;
  phase2aJsonPath?: string;
  phase2bMarkdownPath?: string;
  valuationPath: string;
  reportMarkdownPath: string;
  reportHtmlPath: string;
  manifestPath: string;
}

/** Phase 0~2B 数据管线产物（不含 Phase3），供 business-analysis 与 workflow 复用 */
export interface WorkflowDataPipelineResult {
  outputDir: string;
  normalizedCode: string;
  phase1aJsonPath: string;
  marketPackPath: string;
  marketPackMarkdown: string;
  phase1bJsonPath: string;
  phase1bMarkdownPath: string;
  phase1b: Phase1BQualitativeSupplement;
  pdfPath?: string;
  phase2aJsonPath?: string;
  phase2bMarkdownPath?: string;
  reportPackMarkdown?: string;
  reportUrlResolved?: string;
}

function asYear(value?: string): string {
  if (value && /^\d{4}$/.test(value)) return value;
  return String(new Date().getFullYear() - 1);
}

function normalizeCodeForFeed(code: string): string {
  const trimmed = code.trim().toUpperCase();
  const sixDigits = trimmed.match(/\d{6}/)?.[0];
  return sixDigits ?? trimmed;
}

function safeNum(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function yearFromPeriod(period?: string): string {
  const matched = period?.match(/20\d{2}/)?.[0];
  return matched ?? String(new Date().getFullYear() - 1);
}

function buildMarketPackMarkdown(code: string, dataPack: DataPackMarket): string {
  const instrument = dataPack.instrument;
  const quote = dataPack.quote;
  const fin = dataPack.financialSnapshot;
  const reportYear = yearFromPeriod(fin?.period);
  const marketCap = quote.price > 0 && quote.price < Number.POSITIVE_INFINITY && fin
    ? undefined
    : undefined;
  const derivedMarketCap = safeNum((quote.price ?? 0) * (safeNum(fin?.totalAssets, 0) > 0 ? 100 : 0), 0);
  const finalMarketCap = safeNum(marketCap, derivedMarketCap);
  const revenue = safeNum(fin?.revenue, 0);
  const netProfit = safeNum(fin?.netProfit, 0);
  const ocf = safeNum(fin?.operatingCashFlow, netProfit);
  const capex = Math.max(0, Math.round(Math.abs(ocf) * 0.2));
  const totalAssets = safeNum(fin?.totalAssets, 0);
  const totalLiabilities = safeNum(fin?.totalLiabilities, 0);
  const hasFullBalanceSheet = totalAssets > 0 && totalLiabilities >= 0;
  const interestBearingDebt = hasFullBalanceSheet ? totalLiabilities * 0.4 : 0;
  const cash = hasFullBalanceSheet ? totalAssets * 0.1 : 0;
  const totalShares = quote.price > 0 ? finalMarketCap / quote.price : undefined;
  const basicEps = totalShares && totalShares > 0 ? netProfit / totalShares : undefined;
  const div0 = dataPack.corporateActions?.find((a) => a.cashDividendPerShare != null);
  const dps = safeNum(div0?.cashDividendPerShare, 0);
  const rfEnv = process.env.PHASE1A_RF_RATE?.trim() || process.env.MARKET_PACK_RF_RATE?.trim();
  const rfParsed = rfEnv ? Number(rfEnv) : Number.NaN;
  const rf = Number.isFinite(rfParsed) ? rfParsed : 2.5;

  const riskLines: string[] = [];
  if (!fin?.totalAssets || fin.totalAssets <= 0) {
    riskLines.push(
      `- [数据完整性|中] Phase1A 财务快照缺少有效总资产，市值/资产负债表多项为编排层占位推算，仅用于联调。`,
    );
  }
  if (!dataPack.corporateActions?.length) {
    riskLines.push(`- [数据完整性|低] 未返回企业行动记录，每股分红 DPS 记为 0。`);
  }
  riskLines.push(
    `- [数据完整性|中] Phase1A 未提供 Capex，按 OCF*20% 做保守估算（${capex.toFixed(2)}）。`,
  );

  return [
    `# ${instrument.name}（${normalizeCodeForFeed(code)}）`,
    "",
    "## §1 基础信息",
    `- 股票代码：${normalizeCodeForFeed(code)}`,
    `- 市场：${instrument.market}`,
    `- 币种：${instrument.currency ?? "CNY"}`,
    `- 行业：未知`,
    `- 最新股价：${safeNum(quote.price, 0).toFixed(4)}`,
    `- 最新市值：${finalMarketCap.toFixed(2)}`,
    `- 总股本：${safeNum(totalShares, 0).toFixed(2)}`,
    `- 无风险利率：${rf.toFixed(2)}${rfEnv ? "（来自环境变量）" : "（默认占位）"}`,
    "",
    "## §2 风险提示",
    ...riskLines,
    "",
    "## §3 利润表（百万元）",
    `| 指标 | ${reportYear} |`,
    "|---|---:|",
    `| 营业收入 | ${revenue.toFixed(2)} |`,
    `| 归母净利润 | ${netProfit.toFixed(2)} |`,
    `| 每股收益EPS | ${safeNum(basicEps, 0).toFixed(4)} |`,
    "",
    "## §4 现金流量表（百万元）",
    `| 指标 | ${reportYear} |`,
    "|---|---:|",
    `| 经营活动现金流OCF | ${ocf.toFixed(2)} |`,
    `| 资本开支Capex | ${capex.toFixed(2)} |`,
    "",
    "## §5 资产负债表（百万元）",
    `| 指标 | ${reportYear} |`,
    "|---|---:|",
    `| 总资产 | ${totalAssets.toFixed(2)} |`,
    `| 总负债 | ${totalLiabilities.toFixed(2)} |`,
    `| 有息负债 | ${interestBearingDebt.toFixed(2)} |`,
    `| 货币资金 | ${cash.toFixed(2)} |`,
    "",
    "## §6 每股与分红（百万元）",
    `| 指标 | ${reportYear} |`,
    "|---|---:|",
    `| 每股分红DPS | ${dps.toFixed(4)} |`,
    "",
  ].join("\n");
}

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

export async function executeWorkflowDataPipeline(
  input: RunWorkflowInput,
): Promise<WorkflowDataPipelineResult> {
  const normalizedCode = normalizeCodeForFeed(input.code);
  const outputDir = path.resolve(
    input.outputDir ?? path.join("output", "workflow", normalizedCode),
  );
  await mkdir(outputDir, { recursive: true });

  const to = input.to ?? new Date().toISOString().slice(0, 10);
  const from = input.from ?? `${asYear(input.year)}-01-01`;

  let pdfPath = input.pdfPath;
  let reportUrlResolved = input.reportUrl;
  if (!pdfPath && !reportUrlResolved && input.mode === "turtle-strict") {
    try {
      reportUrlResolved = await discoverPhase0ReportUrlFromFeed({
        stockCode: normalizedCode,
        fiscalYear: asYear(input.year),
        category: input.category ?? "年报",
      });
    } catch (error: any) {
      const detail = error?.message ?? "Feed discovery failed";
      throw new Error(strictWorkflowTurtleDiscoveryFailed(detail));
    }
  }

  if (!pdfPath && reportUrlResolved) {
    const downloaded = await runPhase0DownloadAndCache({
      code: normalizedCode,
      reportUrl: reportUrlResolved,
      fiscalYear: asYear(input.year),
      category: input.category ?? "年报",
      saveDir: path.join(outputDir, "reports", normalizedCode),
    });
    pdfPath = downloaded.filePath;
  }

  const provider = createFeedHttpProviderFromEnv();

  const phase1a = await collectPhase1ADataPack(provider, {
    code: input.code,
    from,
    to,
    period: "day",
  });
  const phase1aJsonPath = path.join(outputDir, "phase1a_data_pack.json");
  await writeText(phase1aJsonPath, JSON.stringify(phase1a, null, 2));

  const marketPackMarkdown = buildMarketPackMarkdown(input.code, phase1a);
  const marketPackPath = path.join(outputDir, "data_pack_market.md");
  await writeText(marketPackPath, marketPackMarkdown);

  const phase1b = await collectPhase1BQualitative(
    {
      stockCode: normalizedCode,
      companyName: input.companyName ?? phase1a.instrument.name ?? normalizedCode,
      year: asYear(input.year),
      channel: input.phase1bChannel ?? "http",
    },
    {},
  );
  const phase1bJsonPath = path.join(outputDir, "phase1b_qualitative.json");
  const phase1bMarkdownPath = path.join(outputDir, "phase1b_qualitative.md");
  await writeText(phase1bJsonPath, JSON.stringify(phase1b, null, 2));
  await writeText(phase1bMarkdownPath, renderPhase1BMarkdown(phase1b));

  let phase2aJsonPath: string | undefined;
  let phase2bMarkdownPath: string | undefined;
  let reportPackMarkdown: string | undefined;

  if (pdfPath) {
    phase2aJsonPath = path.join(outputDir, "pdf_sections.json");
    const sections = await runPhase2AExtractPdfSections({
      pdfPath,
      outputPath: phase2aJsonPath,
    });
    reportPackMarkdown = renderPhase2BDataPackReport({ sections });
    phase2bMarkdownPath = path.join(outputDir, "data_pack_report.md");
    await writeText(phase2bMarkdownPath, reportPackMarkdown);
  }

  return {
    outputDir,
    normalizedCode,
    phase1aJsonPath,
    marketPackPath,
    marketPackMarkdown,
    phase1bJsonPath,
    phase1bMarkdownPath,
    phase1b,
    pdfPath,
    phase2aJsonPath,
    phase2bMarkdownPath,
    reportPackMarkdown,
    reportUrlResolved,
  };
}

export async function runResearchWorkflow(input: RunWorkflowInput): Promise<WorkflowArtifacts> {
  const pipeline = await executeWorkflowDataPipeline(input);

  if (input.mode === "turtle-strict" && !pipeline.reportPackMarkdown) {
    throw new Error(strictWorkflowTurtleMissingReportPack());
  }

  const {
    outputDir,
    normalizedCode,
    phase1aJsonPath,
    marketPackPath,
    marketPackMarkdown,
    phase1bJsonPath,
    phase1bMarkdownPath,
    pdfPath,
    phase2aJsonPath,
    phase2bMarkdownPath,
    reportPackMarkdown,
    reportUrlResolved,
  } = pipeline;

  const phase3 = runPhase3Strict({
    marketMarkdown: marketPackMarkdown,
    reportMarkdown: reportPackMarkdown,
  });

  const valuationPath = path.join(outputDir, "valuation_computed.json");
  const reportMarkdownPath = path.join(outputDir, "analysis_report.md");
  const reportHtmlPath = path.join(outputDir, "analysis_report.html");
  await writeText(valuationPath, JSON.stringify(phase3.valuation, null, 2));
  const reportMarkdown = renderPhase3Markdown(phase3);
  await writeText(reportMarkdownPath, reportMarkdown);
  await writeText(reportHtmlPath, renderPhase3Html(reportMarkdown));

  const manifestPath = path.resolve(outputDir, "workflow_manifest.json");
  const marketRelW = path.relative(outputDir, marketPackPath) || "data_pack_market.md";
  const reportRelW = phase2bMarkdownPath
    ? path.relative(outputDir, phase2bMarkdownPath)
    : undefined;
  const manifest = {
    manifestVersion: "1.0",
    generatedAt: new Date().toISOString(),
    input: {
      ...input,
      code: normalizedCode,
      reportUrl: reportUrlResolved ?? input.reportUrl,
    },
    outputs: {
      phase1aJsonPath,
      marketPackPath,
      phase1bJsonPath,
      phase1bMarkdownPath,
      pdfPath,
      phase2aJsonPath,
      phase2bMarkdownPath,
      valuationPath,
      reportMarkdownPath,
      reportHtmlPath,
    },
    pipeline: {
      valuation: {
        relativePaths: {
          marketMd: marketRelW,
          ...(reportRelW ? { reportMd: reportRelW } : {}),
        },
        note: "workflow 已输出完整 Phase3 报告；如需单独刷新估值摘要可运行 valuation:run 并传入相同 market/report 路径。",
      },
    },
  };
  await writeText(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    outputDir,
    phase1aJsonPath,
    marketPackPath,
    phase1bJsonPath,
    phase1bMarkdownPath,
    pdfPath,
    phase2aJsonPath,
    phase2bMarkdownPath,
    valuationPath,
    reportMarkdownPath,
    reportHtmlPath,
    manifestPath,
  };
}
