import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
import { evaluatePhase3Preflight } from "../pipeline/phase3-preflight.js";
import { runPreflightAfterPhase1A, type PreflightLevel } from "../pipeline/preflight.js";
import { normalizeCodeForFeed } from "../pipeline/normalize-stock-code.js";
import {
  strictPreflightPhase3Abort,
  strictPreflightPhase3SupplementNeeded,
  strictWorkflowTurtleDiscoveryFailed,
  strictWorkflowTurtleMissingReportPack,
} from "../pipeline/strict-messages.js";
import { buildMarketPackMarkdown } from "./build-market-pack.js";
import { refreshMarketPackMarkdown } from "./refresh-market-pack.js";

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
  /**
   * Phase1A 后 Pre-flight：`strict` 时校验行情/财报/市场包结构。
   * 默认：`turtle-strict` 自动启用；也可由 business-analysis `--strict` 显式打开。
   */
  preflight?: "off" | "strict";
  /** 可选：中期报告 Markdown（`data_pack_report_interim.md` 内容），供 Phase3 Step1.5 / preflight 使用 */
  interimReportMdPath?: string;
  /** 可选：中报/季报 PDF，经 Phase2A/2B 生成 `data_pack_report_interim.md`（优先于仅传 md 时的解析） */
  interimPdfPath?: string;
  /** 若输出目录已有 `data_pack_market.md`，仅刷新 §1/§6/§16 行情敏感段 */
  refreshMarket?: boolean;
  /**
   * Phase3 preflight 在 `SUPPLEMENT_NEEDED` 时默认 fail-fast；设为 1 表示已完成一轮补救，允许继续（最多一次）。
   */
  preflightRemedyPass?: number;
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
  phase2aInterimJsonPath?: string;
  phase2bInterimMarkdownPath?: string;
  valuationPath: string;
  reportMarkdownPath: string;
  reportHtmlPath: string;
  manifestPath: string;
  phase3PreflightPath?: string;
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
  phase2aInterimJsonPath?: string;
  phase2bInterimMarkdownPath?: string;
  reportPackMarkdown?: string;
  /** 与 `interimReportMdPath` 对应的已读入正文 */
  interimReportMarkdown?: string;
  reportUrlResolved?: string;
  phase3PreflightPath?: string;
}

function asYear(value?: string): string {
  if (value && /^\d{4}$/.test(value)) return value;
  return String(new Date().getFullYear() - 1);
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

  let interimReportMarkdown: string | undefined;
  let phase2aInterimJsonPath: string | undefined;
  let phase2bInterimMarkdownPath: string | undefined;
  if (input.interimPdfPath?.trim()) {
    const interimPdfAbs = path.resolve(input.interimPdfPath.trim());
    phase2aInterimJsonPath = path.join(outputDir, "pdf_sections_interim.json");
    const interimSections = await runPhase2AExtractPdfSections({
      pdfPath: interimPdfAbs,
      outputPath: phase2aInterimJsonPath,
    });
    const interimMd = renderPhase2BDataPackReport({ sections: interimSections, reportKind: "interim" });
    phase2bInterimMarkdownPath = path.join(outputDir, "data_pack_report_interim.md");
    await writeText(phase2bInterimMarkdownPath, interimMd);
    interimReportMarkdown = interimMd;
  } else if (input.interimReportMdPath?.trim()) {
    interimReportMarkdown = await readFile(path.resolve(input.interimReportMdPath.trim()), "utf-8");
  }

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

  const marketPackPath = path.join(outputDir, "data_pack_market.md");
  let marketPackMarkdown: string;
  if (input.refreshMarket && existsSync(marketPackPath)) {
    const previous = await readFile(marketPackPath, "utf-8");
    marketPackMarkdown = refreshMarketPackMarkdown(input.code, previous, phase1a);
  } else {
    marketPackMarkdown = buildMarketPackMarkdown(input.code, phase1a);
  }
  await writeText(marketPackPath, marketPackMarkdown);

  const preflightEffective: PreflightLevel =
    input.preflight ?? (input.mode === "turtle-strict" ? "strict" : "off");
  runPreflightAfterPhase1A({
    dataPack: phase1a,
    marketPackMarkdown,
    level: preflightEffective,
  });

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
    reportPackMarkdown = renderPhase2BDataPackReport({ sections, reportKind: "annual" });
    phase2bMarkdownPath = path.join(outputDir, "data_pack_report.md");
    await writeText(phase2bMarkdownPath, reportPackMarkdown);
  }

  const phase3PreflightPath = path.join(outputDir, "phase3_preflight.md");
  const phase3Preflight = evaluatePhase3Preflight({
    companyName: input.companyName ?? phase1a.instrument.name ?? normalizedCode,
    marketMarkdown: marketPackMarkdown,
    reportMarkdown: reportPackMarkdown,
    interimReportMarkdown,
  });
  await writeText(phase3PreflightPath, phase3Preflight.markdown);

  const strictLike =
    (input.preflight ?? (input.mode === "turtle-strict" ? "strict" : "off")) === "strict" ||
    input.mode === "turtle-strict";
  if (strictLike) {
    if (phase3Preflight.verdict === "ABORT") {
      throw new Error(strictPreflightPhase3Abort(phase3Preflight.abortReasons.join("；")));
    }
    if (
      phase3Preflight.verdict === "SUPPLEMENT_NEEDED" &&
      (input.preflightRemedyPass ?? 0) < 1
    ) {
      throw new Error(strictPreflightPhase3SupplementNeeded());
    }
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
    interimReportMarkdown,
    reportUrlResolved,
    phase3PreflightPath,
    phase2aInterimJsonPath,
    phase2bInterimMarkdownPath,
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
    interimReportMarkdown,
    reportUrlResolved,
    phase3PreflightPath,
    phase2aInterimJsonPath,
    phase2bInterimMarkdownPath,
  } = pipeline;

  const phase3 = runPhase3Strict({
    marketMarkdown: marketPackMarkdown,
    reportMarkdown: reportPackMarkdown,
    interimReportMarkdown,
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
      phase2aInterimJsonPath,
      phase2bInterimMarkdownPath,
      phase3PreflightPath,
      valuationPath,
      reportMarkdownPath,
      reportHtmlPath,
    },
    pipeline: {
      valuation: {
        relativePaths: {
          marketMd: marketRelW,
          ...(reportRelW ? { reportMd: reportRelW } : {}),
          ...(phase2bInterimMarkdownPath
            ? { interimReportMd: path.relative(outputDir, phase2bInterimMarkdownPath) }
            : pipeline.interimReportMarkdown && input.interimReportMdPath?.trim()
              ? {
                  interimReportMd: path.relative(
                    outputDir,
                    path.resolve(input.interimReportMdPath.trim()),
                  ),
                }
              : {}),
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
    phase2aInterimJsonPath,
    phase2bInterimMarkdownPath,
    valuationPath,
    reportMarkdownPath,
    reportHtmlPath,
    manifestPath,
    phase3PreflightPath,
  };
}
