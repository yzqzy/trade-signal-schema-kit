import path from "node:path";

import { discoverPhase0ReportUrlFromFeed } from "../../steps/phase0/discover-report-url.js";
import { runPhase0DownloadAndCache } from "../../steps/phase0/downloader.js";
import {
  strictBusinessAnalysisDiscoveryFailed,
  strictWorkflowStrictDiscoveryFailed,
} from "./strict-mode-message.js";

/** 与 `workflow-nodes` initPrep、`runBusinessAnalysis` 前置解析对齐的 PDF 解析策略 */
export type AnnualPdfDiscoverPolicy = "never" | "strict" | "best_effort";

export interface EnsureAnnualPdfOnDiskParams {
  normalizedCode: string;
  fiscalYear: string;
  category: string;
  /** run 根目录；缓存 PDF 写入 `reports/<code>/` */
  outputRunDir: string;
  pdfPath?: string;
  reportUrl?: string;
  discoverPolicy: AnnualPdfDiscoverPolicy;
  /** strict 发现失败时的错误文案前缀 */
  discoveryErrorStyle: "business-analysis" | "workflow-strict";
}

export interface EnsureAnnualPdfOnDiskResult {
  pdfPath?: string;
  reportUrlResolved?: string;
}

function formatDiscoveryError(
  style: EnsureAnnualPdfOnDiskParams["discoveryErrorStyle"],
  detail: string,
): string {
  return style === "business-analysis"
    ? strictBusinessAnalysisDiscoveryFailed(detail)
    : strictWorkflowStrictDiscoveryFailed(detail);
}

/**
 * 统一「显式 PDF / URL → Phase0 下载 →（可选）Feed 自动发现」语义，供 LangGraph initPrep 与 business-analysis 主编排复用。
 */
export async function ensureAnnualPdfOnDisk(
  params: EnsureAnnualPdfOnDiskParams,
): Promise<EnsureAnnualPdfOnDiskResult> {
  const category = params.category?.trim() || "年报";
  const saveDir = path.join(params.outputRunDir, "reports", params.normalizedCode);

  let pdf = params.pdfPath?.trim() ? path.resolve(params.pdfPath.trim()) : undefined;
  let reportUrlResolved = params.reportUrl?.trim() || undefined;

  if (pdf) {
    return { pdfPath: pdf, reportUrlResolved };
  }

  if (reportUrlResolved) {
    const downloaded = await runPhase0DownloadAndCache({
      code: params.normalizedCode,
      reportUrl: reportUrlResolved,
      fiscalYear: params.fiscalYear,
      category,
      saveDir,
    });
    return { pdfPath: downloaded.filePath, reportUrlResolved };
  }

  if (params.discoverPolicy === "never") {
    return {};
  }

  let discoveredUrl: string | undefined;
  try {
    discoveredUrl = await discoverPhase0ReportUrlFromFeed({
      stockCode: params.normalizedCode,
      fiscalYear: params.fiscalYear,
      category,
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    if (params.discoverPolicy === "strict") {
      throw new Error(formatDiscoveryError(params.discoveryErrorStyle, detail));
    }
    return {};
  }

  if (!discoveredUrl?.trim()) {
    if (params.discoverPolicy === "strict") {
      throw new Error(
        formatDiscoveryError(params.discoveryErrorStyle, "未发现可用的年报 PDF 链接"),
      );
    }
    return {};
  }

  reportUrlResolved = discoveredUrl.trim();
  const downloaded = await runPhase0DownloadAndCache({
    code: params.normalizedCode,
    reportUrl: reportUrlResolved,
    fiscalYear: params.fiscalYear,
    category,
    saveDir,
  });
  return { pdfPath: downloaded.filePath, reportUrlResolved };
}
