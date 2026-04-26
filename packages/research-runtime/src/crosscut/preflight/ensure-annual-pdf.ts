import path from "node:path";

import { discoverPhase0ReportUrlFromFeed } from "../../steps/phase0/discover-report-url.js";
import { runPhase0DownloadAndCache } from "../../steps/phase0/downloader.js";
import { Phase0NoDataError } from "../../steps/phase0/phase0-errors.js";
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
  /**
   * 未显式传 --year 时，strict/best-effort 自动发现从运行日向前探测最新完整年报。
   * 例如 2026-04-26 会先查 2025，再查 2024/2023；全部失败才回到传入 fiscalYear 规则。
   */
  allowFiscalYearFallback?: boolean;
  /** strict 发现失败时的错误文案前缀 */
  discoveryErrorStyle: "business-analysis" | "workflow-strict";
}

export interface EnsureAnnualPdfOnDiskResult {
  pdfPath?: string;
  reportUrlResolved?: string;
  fiscalYearResolved?: string;
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
 * 统一「显式 PDF / URL → Phase0 下载 →（可选）Feed 自动发现」语义，供 workflow `initPrep` 与 business-analysis 主编排复用。
 */
export async function ensureAnnualPdfOnDisk(
  params: EnsureAnnualPdfOnDiskParams,
): Promise<EnsureAnnualPdfOnDiskResult> {
  const category = params.category?.trim() || "年报";
  const saveDir = path.join(params.outputRunDir, "reports", params.normalizedCode);
  const requestedYear = params.fiscalYear.trim();

  let pdf = params.pdfPath?.trim() ? path.resolve(params.pdfPath.trim()) : undefined;
  let reportUrlResolved = params.reportUrl?.trim() || undefined;

  if (pdf) {
    return { pdfPath: pdf, reportUrlResolved, fiscalYearResolved: requestedYear };
  }

  if (reportUrlResolved) {
    const downloaded = await runPhase0DownloadAndCache({
      code: params.normalizedCode,
      reportUrl: reportUrlResolved,
      fiscalYear: requestedYear,
      category,
      saveDir,
    });
    return { pdfPath: downloaded.filePath, reportUrlResolved, fiscalYearResolved: requestedYear };
  }

  if (params.discoverPolicy === "never") {
    return {};
  }

  const candidateYears: string[] = [];
  if (params.allowFiscalYearFallback && /^\d{4}$/.test(requestedYear)) {
    const currentYear = new Date().getFullYear();
    candidateYears.push(String(currentYear - 1), String(currentYear - 2), String(currentYear - 3), requestedYear);
  } else {
    candidateYears.push(requestedYear);
  }

  let discoveredUrl: string | undefined;
  let discoveredYear = requestedYear;
  let lastNoData: string | undefined;
  for (const year of Array.from(new Set(candidateYears))) {
    try {
      discoveredUrl = await discoverPhase0ReportUrlFromFeed({
        stockCode: params.normalizedCode,
        fiscalYear: year,
        category,
      });
      discoveredYear = year;
      break;
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      if (error instanceof Phase0NoDataError && params.allowFiscalYearFallback) {
        lastNoData = detail;
        continue;
      }
      if (params.discoverPolicy === "strict") {
        throw new Error(formatDiscoveryError(params.discoveryErrorStyle, detail));
      }
      return {};
    }
  }

  if (!discoveredUrl?.trim()) {
    if (params.discoverPolicy === "strict") {
      throw new Error(
        formatDiscoveryError(params.discoveryErrorStyle, lastNoData ?? "未发现可用的年报 PDF 链接"),
      );
    }
    return {};
  }

  reportUrlResolved = discoveredUrl.trim();
  const downloaded = await runPhase0DownloadAndCache({
    code: params.normalizedCode,
    reportUrl: reportUrlResolved,
    fiscalYear: discoveredYear,
    category,
    saveDir,
  });
  return { pdfPath: downloaded.filePath, reportUrlResolved, fiscalYearResolved: discoveredYear };
}
