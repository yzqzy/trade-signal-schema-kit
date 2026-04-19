import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  OUTPUT_LAYOUT_VERSION,
  resolveWorkflowDefaultRunDirectory,
} from '../../contracts/output-layout-v2.js';
import { ensureAnnualPdfOnDisk } from '../../crosscut/preflight/ensure-annual-pdf.js';
import { normalizeCodeForFeed } from '../../crosscut/normalization/normalize-stock-code.js';
import {
  strictBusinessAnalysisMissingPdf,
  strictBusinessAnalysisMissingReportPack,
} from '../../crosscut/preflight/strict-mode-message.js';
import { renderPhase1BMarkdown } from '../../steps/phase1b/renderer.js';
import { resolveWorkflowThreadId } from '../../runtime/graph/langgraph/invoke-workflow-graph.js';
import {
  executeWorkflowDataPipeline,
  type RunWorkflowInput,
} from '../workflow/orchestrator.js';
import { shellQuoteArg } from '../../lib/shell-quote-arg.js';
import { renderQualitativeD1D6Scaffold } from './d1-d6-scaffold.js';
import { appendFeedGapSection, evaluateFeedDataGaps } from '../../crosscut/feed-gap/feed-gap-contract.js';
import type { DataPackMarket } from '@trade-signal/schema-core';

export type RunBusinessAnalysisInput = RunWorkflowInput & {
  /** 与 workflow turtle-strict 一致：要求可解析的年报 PDF（可经自动发现 + Phase0 下载） */
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
  /** 由 `--interim-pdf` 生成的 `data_pack_report_interim.md` */
  dataPackReportInterimPath?: string;
  manifestPath: string;
  pdfPath?: string;
}

function asYear(value?: string): string {
  if (value && /^\d{4}$/.test(value)) return value;
  return String(new Date().getFullYear() - 1);
}

function excerptDataPackReport(md: string, maxChars: number): string {
  const t = md.trim();
  if (!t) return '';
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n\n…（截断，全文见 data_pack_report.md）`;
}

async function readPhase1ADataPack(pathLike: string): Promise<DataPackMarket | undefined> {
  try {
    const text = await readFile(pathLike, 'utf-8');
    return JSON.parse(text) as DataPackMarket;
  } catch {
    return undefined;
  }
}

function buildSuggestedWorkflowFullCommand(input: {
  code: string;
  year?: string;
  strategy: string;
  pdfPath?: string;
  reportUrl?: string;
  outputDirParent: string;
  runId: string;
}): string {
  const parts = [
    'pnpm',
    'run',
    'workflow:run',
    '--',
    '--code',
    shellQuoteArg(input.code),
    '--mode',
    'turtle-strict',
    '--strategy',
    shellQuoteArg(input.strategy),
  ];
  if (input.year?.trim()) {
    parts.push('--year', shellQuoteArg(input.year.trim()));
  }
  if (input.pdfPath?.trim()) {
    parts.push('--pdf', shellQuoteArg(path.resolve(input.pdfPath.trim())));
  }
  if (input.reportUrl?.trim()) {
    parts.push('--report-url', shellQuoteArg(input.reportUrl.trim()));
  }
  parts.push('--output-dir', shellQuoteArg(path.resolve(input.outputDirParent.trim())));
  parts.push('--run-id', shellQuoteArg(input.runId.trim()));
  return parts.join(' ');
}

export async function runBusinessAnalysis(
  input: RunBusinessAnalysisInput,
): Promise<BusinessAnalysisArtifacts> {
  const { strict, ...workflowFields } = input;

  const defaultBaParent = path.join(
    'output',
    'business-analysis',
    normalizeCodeForFeed(input.code),
  );
  const parentDir = workflowFields.outputDir?.trim()
    ? workflowFields.outputDir
    : defaultBaParent;

  const threadId = await resolveWorkflowThreadId({
    ...workflowFields,
    outputDir: parentDir,
  });
  const { outputDir: runRoot } = resolveWorkflowDefaultRunDirectory({
    code: input.code,
    outputDir: parentDir,
    runId: threadId,
  });
  await mkdir(runRoot, { recursive: true });

  const normalizedCode = normalizeCodeForFeed(input.code);
  const ensuredPdf = await ensureAnnualPdfOnDisk({
    normalizedCode,
    fiscalYear: asYear(input.year),
    category: input.category ?? '年报',
    outputRunDir: runRoot,
    pdfPath: input.pdfPath,
    reportUrl: input.reportUrl,
    discoverPolicy: strict ? 'strict' : 'best_effort',
    discoveryErrorStyle: 'business-analysis',
  });

  if (strict) {
    const hasPdf = Boolean(ensuredPdf.pdfPath?.trim());
    const hasUrl = Boolean(ensuredPdf.reportUrlResolved?.trim());
    if (!hasPdf && !hasUrl) {
      throw new Error(strictBusinessAnalysisMissingPdf());
    }
  }

  const pipeline = await executeWorkflowDataPipeline({
    ...workflowFields,
    runId: threadId,
    outputDir: parentDir,
    pdfPath: ensuredPdf.pdfPath ?? input.pdfPath,
    reportUrl: ensuredPdf.reportUrlResolved ?? input.reportUrl,
    preflight: strict ? 'strict' : workflowFields.preflight,
  });

  if (strict && !pipeline.reportPackMarkdown) {
    throw new Error(strictBusinessAnalysisMissingReportPack());
  }

  const reportUrlForOutputs =
    pipeline.reportUrlResolved?.trim() ||
    ensuredPdf.reportUrlResolved?.trim() ||
    input.reportUrl?.trim();

  const qualitativeReportPath = path.join(
    pipeline.outputDir,
    'qualitative_report.md',
  );
  const qualitativeD1D6Path = path.join(
    pipeline.outputDir,
    'qualitative_d1_d6.md',
  );
  const dataPackExcerpt = pipeline.reportPackMarkdown?.trim()
    ? excerptDataPackReport(pipeline.reportPackMarkdown, 14_000)
    : undefined;

  const marketMarkdown = await readFile(pipeline.marketPackPath, 'utf-8');
  const phase1aDataPack = await readPhase1ADataPack(pipeline.phase1aJsonPath);
  const d1d6Body = renderQualitativeD1D6Scaffold({
    phase1b: pipeline.phase1b,
    marketMarkdown,
    phase1aDataPack,
    pdfPath: pipeline.pdfPath ?? ensuredPdf.pdfPath,
    reportUrl: reportUrlForOutputs,
    hasDataPackReport: Boolean(pipeline.reportPackMarkdown?.trim()),
    dataPackReportExcerpt: dataPackExcerpt,
  });
  const feedGaps = evaluateFeedDataGaps({
    marketMarkdown,
    hasDataPackReport: Boolean(pipeline.reportPackMarkdown?.trim()),
    companyName: pipeline.phase1b.companyName,
  });
  const d1d6WithGaps = appendFeedGapSection(d1d6Body, feedGaps);
  await writeFile(qualitativeD1D6Path, d1d6WithGaps, 'utf-8');

  const qualitativeBody = [
    '# 商业分析定性报告（PDF-first）',
    '',
    `- 股票代码：${pipeline.phase1b.stockCode}`,
    `- 公司：${pipeline.phase1b.companyName}`,
    `- 年份：${pipeline.phase1b.year ?? '（未指定）'}`,
    `- 渠道：${pipeline.phase1b.channel}`,
    `- 生成时间：${pipeline.phase1b.generatedAt}`,
    '',
    '本入口以 **年报 PDF / URL（可自动发现）→ Phase2A/2B 报告包 → Phase1B 外部证据** 为主链；以下为 Phase1B 检索补充（§7/§8/§10）。',
    '**Turtle 六维（D1~D6）契约稿**见同目录 `qualitative_d1_d6.md`（含 `data_pack_report` 摘录与可执行门槛）。',
    '**发布级结构化参数（output_schema 键名）**见 `qualitative_d1_d6.md` 文末「发布级结构化参数」节。',
    '',
    renderPhase1BMarkdown(pipeline.phase1b),
  ].join('\n');
  const qualitativeWithGaps = appendFeedGapSection(qualitativeBody, feedGaps);
  await writeFile(qualitativeReportPath, qualitativeWithGaps, 'utf-8');

  const manifestPath = path.resolve(
    pipeline.outputDir,
    'business_analysis_manifest.json',
  );
  const marketRel =
    path.relative(pipeline.outputDir, pipeline.marketPackPath) ||
    'data_pack_market.md';
  const reportRel = pipeline.phase2bMarkdownPath
    ? path.relative(pipeline.outputDir, pipeline.phase2bMarkdownPath)
    : undefined;
  const d1d6Rel =
    path.relative(pipeline.outputDir, qualitativeD1D6Path) ||
    'qualitative_d1_d6.md';
  const runId = path.basename(pipeline.outputDir);
  const pdfForSuggest = pipeline.pdfPath ?? ensuredPdf.pdfPath;
  const manifestInput: Record<string, unknown> = {
    code: pipeline.normalizedCode,
    year: input.year,
    strict: Boolean(strict),
    mode: input.mode,
    strategy: input.strategy ?? 'turtle',
    pdfPath: pdfForSuggest,
    reportUrl: reportUrlForOutputs,
    runId: threadId,
    outputDirParent: path.resolve(parentDir),
  };
  if (workflowFields.companyName?.trim()) {
    manifestInput.companyName = workflowFields.companyName.trim();
  }
  if (workflowFields.from?.trim()) manifestInput.from = workflowFields.from.trim();
  if (workflowFields.to?.trim()) manifestInput.to = workflowFields.to.trim();
  if (workflowFields.category?.trim()) {
    manifestInput.category = workflowFields.category.trim();
  }
  if (workflowFields.phase1bChannel) {
    manifestInput.phase1bChannel = workflowFields.phase1bChannel;
  }
  if (workflowFields.preflight) manifestInput.preflight = workflowFields.preflight;
  if (workflowFields.preflightRemedyPass !== undefined) {
    manifestInput.preflightRemedyPass = workflowFields.preflightRemedyPass;
  }
  if (workflowFields.refreshMarket) manifestInput.refreshMarket = true;
  if (workflowFields.interimReportMdPath?.trim()) {
    manifestInput.interimReportMdPath = path.resolve(workflowFields.interimReportMdPath.trim());
  }
  if (workflowFields.interimPdfPath?.trim()) {
    manifestInput.interimPdfPath = path.resolve(workflowFields.interimPdfPath.trim());
  }
  if (workflowFields.resumeFromStage) {
    manifestInput.resumeFromStage = workflowFields.resumeFromStage;
  }

  const manifest = {
    manifestVersion: '2.0',
    outputLayout: {
      version: OUTPUT_LAYOUT_VERSION,
      area: 'business-analysis',
      code: pipeline.normalizedCode,
      runId,
    } as const,
    generatedAt: new Date().toISOString(),
    kind: 'business-analysis',
    input: manifestInput,
    outputs: {
      qualitativeReportPath,
      qualitativeD1D6Path: qualitativeD1D6Path,
      qualitativeD1D6RelativePath: d1d6Rel,
      marketPackPath: pipeline.marketPackPath,
      phase1bJsonPath: pipeline.phase1bJsonPath,
      phase1bMarkdownPath: pipeline.phase1bMarkdownPath,
      dataPackReportPath: pipeline.phase2bMarkdownPath,
      dataPackReportInterimPath: pipeline.phase2bInterimMarkdownPath,
    },
    pipeline: {
      pdfBranch: {
        hasAnnualPdf: Boolean((pipeline.pdfPath ?? ensuredPdf.pdfPath)?.trim()),
        hasDataPackReport: Boolean(pipeline.reportPackMarkdown?.trim()),
      },
      valuation: {
        relativePaths: {
          marketMd: marketRel,
          ...(reportRel ? { reportMd: reportRel } : {}),
          ...(pipeline.phase2bInterimMarkdownPath
            ? {
                interimReportMd: path.relative(
                  pipeline.outputDir,
                  pipeline.phase2bInterimMarkdownPath,
                ),
              }
            : input.interimReportMdPath?.trim()
              ? {
                  interimReportMd: path.relative(
                    pipeline.outputDir,
                    path.resolve(input.interimReportMdPath.trim()),
                  ),
                }
              : {}),
        },
        suggestedNextCommand: `pnpm run valuation:run -- --from-manifest "${manifestPath}"`,
        suggestedWorkflowFullCommand: buildSuggestedWorkflowFullCommand({
          code: pipeline.normalizedCode,
          year: input.year,
          strategy: input.strategy ?? 'turtle',
          pdfPath: pdfForSuggest,
          reportUrl: reportUrlForOutputs,
          outputDirParent: parentDir,
          runId,
        }),
      },
    },
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  return {
    outputDir: pipeline.outputDir,
    qualitativeReportPath,
    qualitativeD1D6Path,
    marketPackPath: pipeline.marketPackPath,
    phase1bJsonPath: pipeline.phase1bJsonPath,
    phase1bMarkdownPath: pipeline.phase1bMarkdownPath,
    dataPackReportPath: pipeline.phase2bMarkdownPath,
    dataPackReportInterimPath: pipeline.phase2bInterimMarkdownPath,
    manifestPath,
    pdfPath: pipeline.pdfPath ?? ensuredPdf.pdfPath,
  };
}
