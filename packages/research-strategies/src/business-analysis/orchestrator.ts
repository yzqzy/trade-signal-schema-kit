import { writeFile } from "node:fs/promises";
import path from "node:path";

import { renderPhase1BMarkdown } from "../phase1b/renderer.js";
import {
  strictBusinessAnalysisMissingPdf,
  strictBusinessAnalysisMissingReportPack,
} from "../pipeline/strict-messages.js";
import { executeWorkflowDataPipeline, type RunWorkflowInput } from "../workflow/orchestrator.js";
import { renderQualitativeD1D6Scaffold } from "./d1-d6-scaffold.js";

export type RunBusinessAnalysisInput = RunWorkflowInput & {
  /** 与 workflow turtle-strict 一致：要求 PDF 或年报 URL */
  strict?: boolean;
};

export interface BusinessAnalysisArtifacts {
  outputDir: string;
  qualitativeReportPath: string;
  /** Turtle D1~D6 契约稿（工程化骨架） */
  qualitativeD1D6Path: string;
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
    throw new Error(strictBusinessAnalysisMissingPdf());
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
  const pipeline = await executeWorkflowDataPipeline({
    ...workflowInput,
    preflight: input.strict ? "strict" : workflowInput.preflight,
  });

  if (input.strict && !pipeline.reportPackMarkdown) {
    throw new Error(strictBusinessAnalysisMissingReportPack());
  }

  const qualitativeReportPath = path.join(pipeline.outputDir, "qualitative_report.md");
  const qualitativeD1D6Path = path.join(pipeline.outputDir, "qualitative_d1_d6.md");
  const d1d6Body = renderQualitativeD1D6Scaffold({
    phase1b: pipeline.phase1b,
    pdfPath: pipeline.pdfPath,
    reportUrl: input.reportUrl,
  });
  await writeFile(qualitativeD1D6Path, d1d6Body, "utf-8");

  const qualitativeBody = [
    "# 定性研究补充报告（Phase 1B）",
    "",
    `- 股票代码：${pipeline.phase1b.stockCode}`,
    `- 公司：${pipeline.phase1b.companyName}`,
    `- 年份：${pipeline.phase1b.year ?? "（未指定）"}`,
    `- 渠道：${pipeline.phase1b.channel}`,
    `- 生成时间：${pipeline.phase1b.generatedAt}`,
    "",
    "> 以下为 HTTP/MCP 检索补充（§7/§8/§10）。**Turtle 六维（D1~D6）契约稿**见同目录 `qualitative_d1_d6.md`，供 PDF-first 单 Agent 提示词对齐。",
    "",
    renderPhase1BMarkdown(pipeline.phase1b),
  ].join("\n");
  await writeFile(qualitativeReportPath, qualitativeBody, "utf-8");

  const manifestPath = path.resolve(pipeline.outputDir, "business_analysis_manifest.json");
  const marketRel = path.relative(pipeline.outputDir, pipeline.marketPackPath) || "data_pack_market.md";
  const reportRel = pipeline.phase2bMarkdownPath
    ? path.relative(pipeline.outputDir, pipeline.phase2bMarkdownPath)
    : undefined;
  const d1d6Rel = path.relative(pipeline.outputDir, qualitativeD1D6Path) || "qualitative_d1_d6.md";
  const manifest = {
    manifestVersion: "1.0",
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
      qualitativeD1D6Path: qualitativeD1D6Path,
      qualitativeD1D6RelativePath: d1d6Rel,
      marketPackPath: pipeline.marketPackPath,
      phase1bJsonPath: pipeline.phase1bJsonPath,
      phase1bMarkdownPath: pipeline.phase1bMarkdownPath,
      dataPackReportPath: pipeline.phase2bMarkdownPath,
    },
    pipeline: {
      valuation: {
        relativePaths: {
          marketMd: marketRel,
          ...(reportRel ? { reportMd: reportRel } : {}),
        },
        suggestedNextCommand: `pnpm run valuation:run -- --from-manifest "${manifestPath}"`,
      },
    },
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  return {
    outputDir: pipeline.outputDir,
    qualitativeReportPath,
    qualitativeD1D6Path,
    marketPackPath: pipeline.marketPackPath,
    phase1bJsonPath: pipeline.phase1bJsonPath,
    phase1bMarkdownPath: pipeline.phase1bMarkdownPath,
    dataPackReportPath: pipeline.phase2bMarkdownPath,
    manifestPath,
    pdfPath: pipeline.pdfPath,
  };
}
