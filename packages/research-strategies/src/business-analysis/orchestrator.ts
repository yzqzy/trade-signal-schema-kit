import { writeFile } from "node:fs/promises";
import path from "node:path";

import { renderPhase1BMarkdown } from "../phase1b/renderer.js";
import { executeWorkflowDataPipeline, type RunWorkflowInput } from "../workflow/orchestrator.js";

export type RunBusinessAnalysisInput = RunWorkflowInput & {
  /** 与 workflow turtle-strict 一致：要求 PDF 或年报 URL */
  strict?: boolean;
};

export interface BusinessAnalysisArtifacts {
  outputDir: string;
  qualitativeReportPath: string;
  marketPackPath: string;
  phase1bJsonPath: string;
  phase1bMarkdownPath: string;
  dataPackReportPath?: string;
  manifestPath: string;
  pdfPath?: string;
}

function validateStrictPdfInput(input: RunBusinessAnalysisInput): void {
  const hasPdf = Boolean(input.pdfPath?.trim());
  const hasUrl = Boolean(input.reportUrl?.trim());
  if (!hasPdf && !hasUrl) {
    throw new Error(
      "[business-analysis --strict] 缺少 PDF 输入：请提供 --pdf <path> 或 --report-url <url>（用于生成 data_pack_report.md）。",
    );
  }
}

export async function runBusinessAnalysis(
  input: RunBusinessAnalysisInput,
): Promise<BusinessAnalysisArtifacts> {
  if (input.strict) {
    validateStrictPdfInput(input);
  }

  const { strict: _strict, ...workflowInput } = input;
  void _strict;
  const pipeline = await executeWorkflowDataPipeline(workflowInput);

  if (input.strict && !pipeline.reportPackMarkdown) {
    throw new Error(
      "[business-analysis --strict] 未生成 data_pack_report.md：请确认 PDF 路径有效且 Phase2A/2B 成功。",
    );
  }

  const qualitativeReportPath = path.join(pipeline.outputDir, "qualitative_report.md");
  const qualitativeBody = [
    "# 定性研究补充报告（Phase 1B）",
    "",
    `- 股票代码：${pipeline.phase1b.stockCode}`,
    `- 公司：${pipeline.phase1b.companyName}`,
    `- 年份：${pipeline.phase1b.year ?? "（未指定）"}`,
    `- 渠道：${pipeline.phase1b.channel}`,
    `- 生成时间：${pipeline.phase1b.generatedAt}`,
    "",
    "> 以下为 HTTP/MCP 检索补充（§7/§8/§10）。完整六维叙事型商业分析可在后续版本中扩展。",
    "",
    renderPhase1BMarkdown(pipeline.phase1b),
  ].join("\n");
  await writeFile(qualitativeReportPath, qualitativeBody, "utf-8");

  const manifestPath = path.join(pipeline.outputDir, "business_analysis_manifest.json");
  const manifest = {
    generatedAt: new Date().toISOString(),
    kind: "business-analysis",
    input: {
      code: pipeline.normalizedCode,
      year: input.year,
      strict: Boolean(input.strict),
      pdfPath: pipeline.pdfPath,
      reportUrl: input.reportUrl,
    },
    outputs: {
      qualitativeReportPath,
      marketPackPath: pipeline.marketPackPath,
      phase1bJsonPath: pipeline.phase1bJsonPath,
      phase1bMarkdownPath: pipeline.phase1bMarkdownPath,
      dataPackReportPath: pipeline.phase2bMarkdownPath,
    },
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  return {
    outputDir: pipeline.outputDir,
    qualitativeReportPath,
    marketPackPath: pipeline.marketPackPath,
    phase1bJsonPath: pipeline.phase1bJsonPath,
    phase1bMarkdownPath: pipeline.phase1bMarkdownPath,
    dataPackReportPath: pipeline.phase2bMarkdownPath,
    manifestPath,
    pdfPath: pipeline.pdfPath,
  };
}
