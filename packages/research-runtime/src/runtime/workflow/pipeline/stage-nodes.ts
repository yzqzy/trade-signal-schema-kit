import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { createFeedHttpProviderFromEnv } from "@trade-signal/provider-http";

import { ensureAnnualPdfOnDisk } from "../../../crosscut/preflight/ensure-annual-pdf.js";
import { collectPhase1ADataPack } from "../../../steps/phase1a/collector.js";
import { runStageCExternalEvidence } from "../../../steps/phase1b/collector.js";
import { computePhase1bEvidenceQualityMetrics } from "../../../steps/phase1b/evidence-quality.js";
import { renderPhase1BMarkdown } from "../../../steps/phase1b/renderer.js";
import { runPhase2AExtractPdfSections } from "../../../steps/phase2a/extractor.js";
import { tryApplyPdfSectionVerifier } from "./pdf-section-verifier.js";
import { renderPhase2BDataPackReport } from "../../../steps/phase2b/renderer.js";
import { renderPhase3Markdown } from "../../../steps/phase3/report-renderer.js";
import { composeReportViewModel } from "../../../steps/phase3/report-polish/compose-report-view-model.js";
import { renderAllReportPolishMarkdowns } from "../../../steps/phase3/report-polish/render-report-polish-markdown.js";
import type { ReportPolishComposeBuffers, ReportViewModelV1 } from "../../../steps/phase3/report-polish/report-view-model.js";
import { appendFeedGapSection, evaluateFeedDataGaps } from "../../../crosscut/feed-gap/feed-gap-contract.js";
import { resolveWorkflowStrategyPlugin } from "../../../strategy/registry.js";
import { evaluatePhase3Preflight } from "../../../crosscut/preflight/phase3-preflight.js";
import { runPreflightAfterPhase1A, type PreflightLevel } from "../../../crosscut/preflight/preflight.js";
import { OUTPUT_LAYOUT_VERSION, resolveWorkflowDefaultRunDirectory } from "../../../contracts/output-layout-v2.js";
import { normalizeCodeForFeed } from "../../../crosscut/normalization/normalize-stock-code.js";
import { resolveOutputPath } from "../../../crosscut/normalization/resolve-monorepo-path.js";
import { resolveAnnualFiscalYear } from "../../../crosscut/fiscal-year.js";
import {
  strictPreflightPhase3Abort,
  strictPreflightPhase3SupplementNeeded,
} from "../../../crosscut/preflight/strict-mode-message.js";
import { buildMarketPackMarkdown } from "../../workflow/build-market-pack.js";
import { refreshMarketPackMarkdown } from "../../workflow/refresh-market-pack.js";
import { readWorkflowCheckpoint, writeWorkflowCheckpoint, type WorkflowCheckpointFile } from "./checkpoint-io.js";
import type { WorkflowRunState } from "./run-state.js";

function asYear(value?: string): string {
  return resolveAnnualFiscalYear(value);
}

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

async function readUtf8Optional(filePath?: string): Promise<string | undefined> {
  if (!filePath?.trim()) return undefined;
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

function shellQuote(value: string): string {
  return JSON.stringify(value);
}

function buildSuggestedBusinessAnalysisCommand(state: WorkflowRunState, outputDir: string): string {
  const parts = [
    "pnpm",
    "run",
    "business-analysis:run",
    "--",
    "--code",
    state.normalizedCode ?? state.input.code,
    "--strict",
  ];
  const year = state.effectiveYear ?? state.input.year;
  if (year) parts.push("--year", year);
  const reportUrl = state.reportUrlResolved ?? state.input.reportUrl;
  if (reportUrl) parts.push("--report-url", reportUrl);
  if (state.runId) parts.push("--run-id", state.runId);
  parts.push("--output-dir", path.resolve(outputDir, "..", "..", "..", "business-analysis", state.normalizedCode ?? state.input.code));
  return parts.map((p) => (/[^\w@%+=:,./-]/.test(p) ? shellQuote(p) : p)).join(" ");
}

function collectKeywordHits(text: string, keywords: string[], limit = 10): string[] {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && keywords.some((kw) => line.includes(kw)));
  return Array.from(new Set(lines)).slice(0, limit).map((line) => (line.length > 180 ? `${line.slice(0, 180)}...` : line));
}

function buildCompanySpecificInsights(vm: ReportViewModelV1, buffers: ReportPolishComposeBuffers): Record<string, unknown> {
  const annualHits = collectKeywordHits(buffers.dataPackReportMarkdown, [
    "主营",
    "移动",
    "宽带",
    "DICT",
    "算力",
    "ARPU",
    "5G",
    "资本开支",
    "分红",
    "派息",
  ]);
  const marketHits = collectKeywordHits(buffers.marketPackMarkdown, ["DPS", "分红", "派息", "Capex", "资本开支", "PE", "同业"]);
  return {
    sourcePriority: ["data_pack_report.md", "data_pack_market.md", "自动同业池 TopN", "phase1b_qualitative.md"],
    operatingSignalHits: annualHits,
    marketSignalHits: marketHits,
    peerComparablePool: vm.phase1a.peerComparablePool ?? {
      peers: [],
      note: "自动同业池未形成结构化结果；不固定或伪造同行。",
    },
    gaps:
      annualHits.length === 0
        ? ["年报包未抽取到主营/ARPU/5G/宽带/资本开支等公司专属片段，需要补 F10 或年报章节索引。"]
        : [],
  };
}

function renderBusinessFinalizeHandoffMarkdown(input: {
  vm: ReportViewModelV1;
  workflowRunDir: string;
  suggestedCommand: string;
  handoffJsonPath: string;
}): string {
  const { vm, workflowRunDir, suggestedCommand, handoffJsonPath } = input;
  return [
    `# ${vm.displayCompanyName ?? vm.market.name ?? vm.normalizedCode}（${vm.normalizedCode}）商业质量成稿 Handoff`,
    "",
    "> workflow 已生成商业质量结构化预览；完整六维研报需由 Claude Code / Codex 等 AI 会话按 business-analysis-finalize 规范写回。",
    "",
    "## 建议命令",
    "",
    "```bash",
    suggestedCommand,
    "```",
    "",
    "## 写回要求",
    "",
    "- 生成 `qualitative_report.md` 与 `qualitative_d1_d6.md`。",
    "- D1-D6 每章必须有公司专属叙事、关键表格、证据引用和证据质量边界。",
    "- 发布层规则：business-analysis complete 覆盖 workflow degraded，workflow 商业预览不得冒充完整六维研报。",
    "",
    "## 输入材料",
    "",
    `- workflow run：\`${workflowRunDir}\``,
    `- handoff JSON：\`${path.relative(workflowRunDir, handoffJsonPath)}\``,
    `- report view model：\`${vm.evidence.phase1aJsonRelative ? "report_view_model.json" : "report_view_model.json"}\``,
    `- 市场包：\`${vm.evidence.dataPackMarketMdRelative}\``,
    `- 年报包：\`${vm.evidence.dataPackReportMdRelative ?? "未生成"}\``,
    `- Phase1B：\`${vm.evidence.phase1bQualitativeMdRelative}\``,
    `- 估值 JSON：\`${vm.evidence.valuationComputedJsonRelative}\``,
    "",
    "## 同业对标来源",
    "",
    vm.phase1a.peerComparablePool?.peers.length
      ? `自动同业池 TopN，行业=${vm.phase1a.peerComparablePool.industryName ?? "—"}，排序=${vm.phase1a.peerComparablePool.sortColumn ?? "—"}。`
      : "自动同业池未形成结构化结果；成稿不得固定写入预设同行，应在缺口清单披露。",
    "",
  ].join("\n");
}

function mergeCompletedStages(state: WorkflowRunState, stage: string): string[] {
  return Array.from(new Set([...(state.completedStages ?? []), stage]));
}

async function persistCheckpoint(
  outputDir: string,
  runId: string,
  threadId: string,
  completedStages: string[],
  state: WorkflowRunState,
): Promise<void> {
  const payload: WorkflowCheckpointFile = {
    version: "1",
    runId,
    threadId,
    completedStages,
    snapshot: {
      normalizedCode: state.normalizedCode,
      effectiveYear: state.effectiveYear,
      outputDir: state.outputDir,
      pdfPath: state.pdfPath,
      reportUrlResolved: state.reportUrlResolved,
      from: state.from,
      to: state.to,
      interimReportMarkdown: state.interimReportMarkdown,
      phase2aInterimJsonPath: state.phase2aInterimJsonPath,
      phase2bInterimMarkdownPath: state.phase2bInterimMarkdownPath,
      phase1aJsonPath: state.phase1aJsonPath,
      marketPackPath: state.marketPackPath,
      marketPackMarkdown: state.marketPackMarkdown,
      resolvedCompanyName: state.resolvedCompanyName,
      preflightEffective: state.preflightEffective,
      phase2aJsonPath: state.phase2aJsonPath,
      phase2bMarkdownPath: state.phase2bMarkdownPath,
      reportPackMarkdown: state.reportPackMarkdown,
      phase1bJsonPath: state.phase1bJsonPath,
      phase1bMarkdownPath: state.phase1bMarkdownPath,
      phase3PreflightPath: state.phase3PreflightPath,
      valuationPath: state.valuationPath,
      reportMarkdownPath: state.reportMarkdownPath,
      reportViewModelPath: state.reportViewModelPath,
      turtleOverviewMarkdownPath: state.turtleOverviewMarkdownPath,
      businessQualityMarkdownPath: state.businessQualityMarkdownPath,
      penetrationReturnMarkdownPath: state.penetrationReturnMarkdownPath,
      valuationTopicMarkdownPath: state.valuationTopicMarkdownPath,
      businessFinalizeHandoffJsonPath: state.businessFinalizeHandoffJsonPath,
      businessFinalizeHandoffMarkdownPath: state.businessFinalizeHandoffMarkdownPath,
      suggestedBusinessAnalysisCommand: state.suggestedBusinessAnalysisCommand,
      businessNarrativeStatus: state.businessNarrativeStatus,
      manifestPath: state.manifestPath,
    },
  };
  await writeWorkflowCheckpoint(outputDir, payload);
}

export async function nodeInitPrep(state: WorkflowRunState): Promise<Partial<WorkflowRunState>> {
  const input = state.input;
  const runId = input.runId ?? randomUUID();
  const threadId = runId;

  if (input.resumeFromStage) {
    if (!input.outputDir?.trim()) {
      throw new Error(
        "[workflow] output v2 续跑必须提供 --output-dir，指向含 workflow_checkpoint.json 的 run 根目录（例如 output/workflow/600887/<runId>/）",
      );
    }
  }

  const normalizedCode = normalizeCodeForFeed(input.code);
  const outputDir = input.resumeFromStage
    ? resolveOutputPath(input.outputDir!.trim())
    : resolveWorkflowDefaultRunDirectory({
        code: input.code,
        outputDir: input.outputDir,
        runId,
      }).outputDir;
  await mkdir(outputDir, { recursive: true });

  let interimReportMarkdown = state.interimReportMarkdown;
  let phase2aInterimJsonPath = state.phase2aInterimJsonPath;
  let phase2bInterimMarkdownPath = state.phase2bInterimMarkdownPath;

  if (input.interimPdfPath?.trim()) {
    const interimPdfAbs = path.resolve(input.interimPdfPath.trim());
    phase2aInterimJsonPath = path.join(outputDir, "pdf_sections_interim.json");
    const interimSections = await runPhase2AExtractPdfSections({
      pdfPath: interimPdfAbs,
      outputPath: phase2aInterimJsonPath,
    });
    await tryApplyPdfSectionVerifier(interimSections);
    await writeText(phase2aInterimJsonPath, JSON.stringify(interimSections, null, 2));
    const interimMd = renderPhase2BDataPackReport({ sections: interimSections, reportKind: "interim" });
    phase2bInterimMarkdownPath = path.join(outputDir, "data_pack_report_interim.md");
    await writeText(phase2bInterimMarkdownPath, interimMd);
    interimReportMarkdown = interimMd;
  } else if (input.interimReportMdPath?.trim()) {
    interimReportMarkdown = await readFile(path.resolve(input.interimReportMdPath.trim()), "utf-8");
  }

  const to = input.to ?? new Date().toISOString().slice(0, 10);
  let from = input.from ?? `${asYear(input.year)}-01-01`;

  let pdfPath = state.pdfPath ?? input.pdfPath;
  let reportUrlResolved = state.reportUrlResolved ?? input.reportUrl;

  if (input.resumeFromStage) {
    const cp = await readWorkflowCheckpoint(outputDir);
    if (!cp) {
      throw new Error(
        `[workflow] resumeFromStage=${input.resumeFromStage} 但缺少 ${path.join(outputDir, "workflow_checkpoint.json")}`,
      );
    }
    const inputPdf = input.pdfPath?.trim() ? path.resolve(input.pdfPath.trim()) : undefined;
    pdfPath = inputPdf ?? cp.snapshot.pdfPath ?? pdfPath;
    reportUrlResolved = input.reportUrl?.trim() || cp.snapshot.reportUrlResolved || reportUrlResolved;

    if (input.resumeFromStage === "D" && !pdfPath?.trim()) {
      throw new Error("[workflow] resumeFromStage=D 需要 checkpoint.snapshot.pdfPath");
    }

    let marketPackMarkdown = cp.snapshot.marketPackMarkdown;
    if (!marketPackMarkdown && cp.snapshot.marketPackPath) {
      marketPackMarkdown = await readUtf8Optional(cp.snapshot.marketPackPath);
    }
    let reportPackMarkdown = cp.snapshot.reportPackMarkdown;
    if (!reportPackMarkdown && cp.snapshot.phase2bMarkdownPath) {
      reportPackMarkdown = await readUtf8Optional(cp.snapshot.phase2bMarkdownPath);
    }

    const resumedStages = Array.from(new Set([...(cp.completedStages ?? []), "initPrep"]));
    const merged: Partial<WorkflowRunState> = {
      runId: cp.runId,
      threadId: cp.threadId,
      normalizedCode: cp.snapshot.normalizedCode ?? normalizedCode,
      effectiveYear: cp.snapshot.effectiveYear ?? asYear(input.year),
      outputDir: cp.snapshot.outputDir ?? outputDir,
      interimReportMarkdown: cp.snapshot.interimReportMarkdown ?? interimReportMarkdown,
      phase2aInterimJsonPath: cp.snapshot.phase2aInterimJsonPath ?? phase2aInterimJsonPath,
      phase2bInterimMarkdownPath: cp.snapshot.phase2bInterimMarkdownPath ?? phase2bInterimMarkdownPath,
      from: cp.snapshot.from ?? from,
      to: cp.snapshot.to ?? to,
      pdfPath,
      reportUrlResolved,
      phase1aJsonPath: cp.snapshot.phase1aJsonPath,
      marketPackPath: cp.snapshot.marketPackPath,
      marketPackMarkdown,
      resolvedCompanyName: cp.snapshot.resolvedCompanyName,
      preflightEffective: cp.snapshot.preflightEffective,
      phase2aJsonPath: cp.snapshot.phase2aJsonPath,
      phase2bMarkdownPath: cp.snapshot.phase2bMarkdownPath,
      reportPackMarkdown,
      phase1bJsonPath: cp.snapshot.phase1bJsonPath,
      phase1bMarkdownPath: cp.snapshot.phase1bMarkdownPath,
      phase3PreflightPath: cp.snapshot.phase3PreflightPath,
      valuationPath: cp.snapshot.valuationPath,
      reportMarkdownPath: cp.snapshot.reportMarkdownPath,
      reportViewModelPath: cp.snapshot.reportViewModelPath,
      turtleOverviewMarkdownPath: cp.snapshot.turtleOverviewMarkdownPath,
      businessQualityMarkdownPath: cp.snapshot.businessQualityMarkdownPath,
      penetrationReturnMarkdownPath: cp.snapshot.penetrationReturnMarkdownPath,
      valuationTopicMarkdownPath: cp.snapshot.valuationTopicMarkdownPath,
      businessFinalizeHandoffJsonPath: cp.snapshot.businessFinalizeHandoffJsonPath,
      businessFinalizeHandoffMarkdownPath: cp.snapshot.businessFinalizeHandoffMarkdownPath,
      suggestedBusinessAnalysisCommand: cp.snapshot.suggestedBusinessAnalysisCommand,
      businessNarrativeStatus: cp.snapshot.businessNarrativeStatus,
      manifestPath: cp.snapshot.manifestPath,
      completedStages: resumedStages,
      resumeLoaded: true,
    };
    const mergedFull = { ...state, ...merged, input } as WorkflowRunState;
    await persistCheckpoint(outputDir, cp.runId, cp.threadId, resumedStages, mergedFull);
    return merged;
  }

  const requestedYear = asYear(input.year);
  const ensuredPdf = await ensureAnnualPdfOnDisk({
    normalizedCode,
    fiscalYear: requestedYear,
    category: input.category ?? "年报",
    outputRunDir: outputDir,
    pdfPath,
    reportUrl: reportUrlResolved,
    discoverPolicy:
      !pdfPath?.trim() && !reportUrlResolved?.trim() && input.mode === "turtle-strict"
        ? "strict"
        : "never",
    allowFiscalYearFallback: !input.year?.trim(),
    discoveryErrorStyle: "workflow-strict",
  });
  pdfPath = ensuredPdf.pdfPath ?? pdfPath;
  reportUrlResolved = ensuredPdf.reportUrlResolved ?? reportUrlResolved;
  const effectiveYear = ensuredPdf.fiscalYearResolved ?? requestedYear;
  const effectiveInput = input.year?.trim() ? input : { ...input, year: effectiveYear };
  from = input.from ?? `${effectiveYear}-01-01`;

  const next: Partial<WorkflowRunState> = {
    input: effectiveInput,
    runId,
    threadId,
    normalizedCode,
    effectiveYear,
    outputDir,
    interimReportMarkdown,
    phase2aInterimJsonPath,
    phase2bInterimMarkdownPath,
    from,
    to,
    pdfPath,
    reportUrlResolved,
    completedStages: ["initPrep"],
  };
  const mergedStages = mergeCompletedStages(state, "initPrep");
  await persistCheckpoint(outputDir, runId, threadId, mergedStages, {
    ...state,
    ...next,
    input: effectiveInput,
    completedStages: mergedStages,
  } as WorkflowRunState);
  return next;
}

export async function nodeStageB(state: WorkflowRunState): Promise<Partial<WorkflowRunState>> {
  const input = state.input;
  const effectiveYear = state.effectiveYear ?? asYear(input.year);
  const normalizedCode = state.normalizedCode!;
  const outputDir = state.outputDir!;
  const from = state.from!;
  const to = state.to!;

  const provider = createFeedHttpProviderFromEnv();
  const phase1a = await collectPhase1ADataPack(provider, {
    code: input.code,
    from,
    to,
    period: "day",
    year: effectiveYear,
    industryProfileId: input.industryProfileId,
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

  const resolvedCompanyName = input.companyName ?? phase1a.instrument.name ?? normalizedCode;

  const next: Partial<WorkflowRunState> = {
    phase1aJsonPath,
    marketPackPath,
    marketPackMarkdown,
    resolvedCompanyName,
    preflightEffective,
    completedStages: ["stageB"],
  };
  const mergedStages = mergeCompletedStages(state, "stageB");
  await persistCheckpoint(outputDir, state.runId!, state.threadId!, mergedStages, {
    ...state,
    ...next,
    completedStages: mergedStages,
  } as WorkflowRunState);
  return next;
}

export async function nodeStageD(state: WorkflowRunState): Promise<Partial<WorkflowRunState>> {
  const pdfPath = state.pdfPath;
  const outputDir = state.outputDir!;
  if (!pdfPath) {
    const mergedStages = mergeCompletedStages(state, "stageD_skipped");
    const patch: Partial<WorkflowRunState> = { completedStages: ["stageD_skipped"] };
    await persistCheckpoint(outputDir, state.runId!, state.threadId!, mergedStages, {
      ...state,
      ...patch,
      completedStages: mergedStages,
    } as WorkflowRunState);
    return patch;
  }
  const phase2aJsonPath = path.join(outputDir, "pdf_sections.json");
  const sections = await runPhase2AExtractPdfSections({
    pdfPath,
    outputPath: phase2aJsonPath,
  });
  await tryApplyPdfSectionVerifier(sections);
  await writeText(phase2aJsonPath, JSON.stringify(sections, null, 2));
  const reportPackMarkdown = renderPhase2BDataPackReport({ sections, reportKind: "annual" });
  const phase2bMarkdownPath = path.join(outputDir, "data_pack_report.md");
  await writeText(phase2bMarkdownPath, reportPackMarkdown);

  const next: Partial<WorkflowRunState> = {
    phase2aJsonPath,
    phase2bMarkdownPath,
    reportPackMarkdown,
    completedStages: ["stageD"],
  };
  const mergedStages = mergeCompletedStages(state, "stageD");
  await persistCheckpoint(outputDir, state.runId!, state.threadId!, mergedStages, {
    ...state,
    ...next,
    completedStages: mergedStages,
  } as WorkflowRunState);
  return next;
}

export async function nodeStageC(state: WorkflowRunState): Promise<Partial<WorkflowRunState>> {
  const input = state.input;
  const effectiveYear = state.effectiveYear ?? asYear(input.year);
  const normalizedCode = state.normalizedCode!;
  const outputDir = state.outputDir!;

  let phase1b = await runStageCExternalEvidence(
    {
      stockCode: normalizedCode,
      companyName: state.resolvedCompanyName!,
      year: effectiveYear,
      channel: input.phase1bChannel ?? "http",
    },
    {},
  );

  const phase1bJsonPath = path.join(outputDir, "phase1b_qualitative.json");
  const phase1bMarkdownPath = path.join(outputDir, "phase1b_qualitative.md");
  const phase1bEvidenceQualityPath = path.join(outputDir, "phase1b_evidence_quality.json");
  await writeText(phase1bJsonPath, JSON.stringify(phase1b, null, 2));
  await writeText(phase1bMarkdownPath, renderPhase1BMarkdown(phase1b));
  await writeText(
    phase1bEvidenceQualityPath,
    JSON.stringify(computePhase1bEvidenceQualityMetrics(phase1b), null, 2),
  );

  const next: Partial<WorkflowRunState> = {
    phase1b,
    phase1bJsonPath,
    phase1bMarkdownPath,
    completedStages: ["stageC"],
  };
  const mergedStages = mergeCompletedStages(state, "stageC");
  await persistCheckpoint(outputDir, state.runId!, state.threadId!, mergedStages, {
    ...state,
    ...next,
    completedStages: mergedStages,
  } as WorkflowRunState);
  return next;
}

export async function nodePreflight3(state: WorkflowRunState): Promise<Partial<WorkflowRunState>> {
  const input = state.input;
  const outputDir = state.outputDir!;
  const marketPackMarkdown = state.marketPackMarkdown!;
  const reportPackMarkdown = state.reportPackMarkdown;
  const interimReportMarkdown = state.interimReportMarkdown;

  const phase3PreflightPath = path.join(outputDir, "phase3_preflight.md");
  const phase3Preflight = evaluatePhase3Preflight({
    companyName: state.resolvedCompanyName!,
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
    if (phase3Preflight.verdict === "SUPPLEMENT_NEEDED" && (input.preflightRemedyPass ?? 0) < 1) {
      throw new Error(strictPreflightPhase3SupplementNeeded());
    }
  }

  const next: Partial<WorkflowRunState> = {
    phase3PreflightPath,
    phase3PreflightVerdict: phase3Preflight.verdict,
    phase3PreflightMarkdown: phase3Preflight.markdown,
    phase3PreflightAbortReasons: phase3Preflight.abortReasons,
    completedStages: ["preflight3"],
  };
  const mergedStages = mergeCompletedStages(state, "preflight3");
  await persistCheckpoint(outputDir, state.runId!, state.threadId!, mergedStages, {
    ...state,
    ...next,
    completedStages: mergedStages,
  } as WorkflowRunState);
  return next;
}

export async function nodeStageE(state: WorkflowRunState): Promise<Partial<WorkflowRunState>> {
  const input = state.input;
  const outputDir = state.outputDir!;
  const marketPackMarkdown = state.marketPackMarkdown!;
  const reportPackMarkdown = state.reportPackMarkdown;
  const interimReportMarkdown = state.interimReportMarkdown;

  const strategyPlugin = resolveWorkflowStrategyPlugin(state.input.strategy);
  strategyPlugin.validateStageEPrerequisites?.({
    workflowMode: input.mode,
    reportMarkdown: reportPackMarkdown,
  });
  const phase3Execution = strategyPlugin.evaluate({
    marketMarkdown: marketPackMarkdown,
    reportMarkdown: reportPackMarkdown,
    interimReportMarkdown,
  });

  const valuationPath = path.join(outputDir, "valuation_computed.json");
  const reportMarkdownPath = path.join(outputDir, "analysis_report.md");
  await writeText(valuationPath, JSON.stringify(phase3Execution.valuation, null, 2));
  const feedGaps = evaluateFeedDataGaps({
    marketMarkdown: marketPackMarkdown,
    hasDataPackReport: Boolean(reportPackMarkdown?.trim()),
    companyName: state.resolvedCompanyName ?? input.code,
  });
  const reportMarkdown = appendFeedGapSection(
    renderPhase3Markdown(phase3Execution),
    feedGaps,
  );
  await writeText(reportMarkdownPath, reportMarkdown);

  const next: Partial<WorkflowRunState> = {
    phase3Execution,
    valuationPath,
    reportMarkdownPath,
    completedStages: ["stageE"],
  };
  const mergedStages = mergeCompletedStages(state, "stageE");
  await persistCheckpoint(outputDir, state.runId!, state.threadId!, mergedStages, {
    ...state,
    ...next,
    completedStages: mergedStages,
  } as WorkflowRunState);
  return next;
}

export async function nodeReportPolish(state: WorkflowRunState): Promise<Partial<WorkflowRunState>> {
  const outputDir = state.outputDir!;
  const phase3Execution = state.phase3Execution;
  if (!phase3Execution) {
    throw new Error("[workflow] reportPolish 需要 phase3Execution");
  }

  const { viewModel, buffers } = await composeReportViewModel({
    outputDir,
    runId: state.runId,
    normalizedCode: state.normalizedCode!,
    displayCompanyName: state.resolvedCompanyName,
    phase1aJsonPath: state.phase1aJsonPath!,
    marketPackPath: state.marketPackPath!,
    marketPackMarkdown: state.marketPackMarkdown!,
    phase1bMarkdownPath: state.phase1bMarkdownPath!,
    phase2bMarkdownPath: state.phase2bMarkdownPath,
    phase2bInterimMarkdownPath: state.phase2bInterimMarkdownPath,
    valuationPath: state.valuationPath!,
    reportMarkdownPath: state.reportMarkdownPath!,
    phase3PreflightPath: state.phase3PreflightPath,
    phase3Execution,
  });

  const rendered = renderAllReportPolishMarkdowns(viewModel, buffers);

  const reportViewModelPath = path.join(outputDir, "report_view_model.json");
  const turtleOverviewMarkdownPath = path.join(outputDir, "turtle_overview.md");
  const businessQualityMarkdownPath = path.join(outputDir, "business_quality.md");
  const penetrationReturnMarkdownPath = path.join(outputDir, "penetration_return.md");
  const valuationTopicMarkdownPath = path.join(outputDir, "valuation.md");
  const businessFinalizeHandoffJsonPath = path.join(outputDir, "business_finalize_handoff.json");
  const businessFinalizeHandoffMarkdownPath = path.join(outputDir, "business_finalize_handoff.md");
  const businessTopic = viewModel.topicReports.find((t) => t.topicId === "topic:business-six-dimension");
  const businessNarrativeStatus =
    businessTopic?.qualityStatus === "complete"
      ? "complete_available"
      : businessTopic?.qualityStatus === "blocked"
        ? "blocked"
        : "needs_final_narrative";
  const suggestedBusinessAnalysisCommand = buildSuggestedBusinessAnalysisCommand(state, outputDir);
  const companySpecificInsights = buildCompanySpecificInsights(viewModel, buffers);
  const handoffPayload = {
    schema: "business_finalize_handoff",
    version: "1.0",
    generatedAt: new Date().toISOString(),
    code: state.normalizedCode,
    runId: state.runId,
    workflowRunDir: outputDir,
    status: businessNarrativeStatus,
    aiSessionInstruction:
      "由 Claude Code / Codex 等 AI 会话执行 business-analysis-finalize，生成 qualitative_report.md 与 qualitative_d1_d6.md。",
    suggestedBusinessAnalysisCommand,
    publishRule: "business-analysis complete overrides workflow degraded",
    inputs: {
      reportUrl: state.reportUrlResolved ?? state.input.reportUrl,
      pdfPath: state.pdfPath,
      phase1aJsonPath: state.phase1aJsonPath,
      marketPackPath: state.marketPackPath,
      phase1bMarkdownPath: state.phase1bMarkdownPath,
      dataPackReportPath: state.phase2bMarkdownPath,
      valuationPath: state.valuationPath,
      reportViewModelPath,
      turtleOverviewMarkdownPath,
      valuationMarkdownPath: valuationTopicMarkdownPath,
    },
    peerComparablePool: viewModel.phase1a.peerComparablePool,
    companySpecificInsights,
  };

  await writeText(reportViewModelPath, JSON.stringify(viewModel, null, 2));
  await writeText(turtleOverviewMarkdownPath, rendered.turtleOverviewMarkdown);
  await writeText(businessQualityMarkdownPath, rendered.businessQualityMarkdown);
  await writeText(penetrationReturnMarkdownPath, rendered.penetrationReturnMarkdown);
  await writeText(valuationTopicMarkdownPath, rendered.valuationMarkdown);
  await writeText(businessFinalizeHandoffJsonPath, JSON.stringify(handoffPayload, null, 2));
  await writeText(
    businessFinalizeHandoffMarkdownPath,
    renderBusinessFinalizeHandoffMarkdown({
      vm: viewModel,
      workflowRunDir: outputDir,
      suggestedCommand: suggestedBusinessAnalysisCommand,
      handoffJsonPath: businessFinalizeHandoffJsonPath,
    }),
  );

  const next: Partial<WorkflowRunState> = {
    reportViewModelPath,
    turtleOverviewMarkdownPath,
    businessQualityMarkdownPath,
    penetrationReturnMarkdownPath,
    valuationTopicMarkdownPath,
    businessFinalizeHandoffJsonPath,
    businessFinalizeHandoffMarkdownPath,
    suggestedBusinessAnalysisCommand,
    businessNarrativeStatus,
    completedStages: ["reportPolish"],
  };
  const mergedStages = mergeCompletedStages(state, "reportPolish");
  await persistCheckpoint(outputDir, state.runId!, state.threadId!, mergedStages, {
    ...state,
    ...next,
    completedStages: mergedStages,
  } as WorkflowRunState);
  return next;
}

export async function nodeFinalizeManifest(state: WorkflowRunState): Promise<Partial<WorkflowRunState>> {
  const input = state.input;
  const outputDir = state.outputDir!;
  const normalizedCode = state.normalizedCode!;
  const manifestPath = path.resolve(outputDir, "workflow_manifest.json");
  const manifestStages = mergeCompletedStages(state, "finalizeManifest");
  const marketPackPath = state.marketPackPath!;
  const phase1aJsonPath = state.phase1aJsonPath!;
  const phase1bJsonPath = state.phase1bJsonPath!;
  const phase1bMarkdownPath = state.phase1bMarkdownPath!;
  const pdfPath = state.pdfPath;
  const phase2aJsonPath = state.phase2aJsonPath;
  const phase2bMarkdownPath = state.phase2bMarkdownPath;
  const phase2aInterimJsonPath = state.phase2aInterimJsonPath;
  const phase2bInterimMarkdownPath = state.phase2bInterimMarkdownPath;
  const phase3PreflightPath = state.phase3PreflightPath;
  const valuationPath = state.valuationPath!;
  const reportMarkdownPath = state.reportMarkdownPath!;
  const reportViewModelPath = state.reportViewModelPath;
  const turtleOverviewMarkdownPath = state.turtleOverviewMarkdownPath;
  const businessQualityMarkdownPath = state.businessQualityMarkdownPath;
  const penetrationReturnMarkdownPath = state.penetrationReturnMarkdownPath;
  const valuationTopicMarkdownPath = state.valuationTopicMarkdownPath;
  const businessFinalizeHandoffJsonPath = state.businessFinalizeHandoffJsonPath;
  const businessFinalizeHandoffMarkdownPath = state.businessFinalizeHandoffMarkdownPath;
  const businessNarrativeStatus = state.businessNarrativeStatus ?? "needs_final_narrative";
  const suggestedBusinessAnalysisCommand =
    state.suggestedBusinessAnalysisCommand ?? buildSuggestedBusinessAnalysisCommand(state, outputDir);
  const reportUrlResolved = state.reportUrlResolved;

  const marketRelW = path.relative(outputDir, marketPackPath) || "data_pack_market.md";
  const reportRelW = phase2bMarkdownPath ? path.relative(outputDir, phase2bMarkdownPath) : undefined;

  const manifest = {
    manifestVersion: "2.0",
    outputLayout: {
      version: OUTPUT_LAYOUT_VERSION,
      area: "workflow",
      code: normalizedCode,
      runId: state.runId,
    },
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
      reportViewModelPath,
      turtleOverviewMarkdownPath,
      businessQualityMarkdownPath,
      penetrationReturnMarkdownPath,
      valuationMarkdownPath: valuationTopicMarkdownPath,
      businessFinalizeHandoffJsonPath,
      businessFinalizeHandoffMarkdownPath,
    },
    pipeline: {
      valuation: {
        relativePaths: {
          marketMd: marketRelW,
          ...(reportRelW ? { reportMd: reportRelW } : {}),
          ...(phase2bInterimMarkdownPath
            ? { interimReportMd: path.relative(outputDir, phase2bInterimMarkdownPath) }
            : state.interimReportMarkdown && input.interimReportMdPath?.trim()
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
      businessNarrative: {
        status: businessNarrativeStatus,
        handoffPath: businessFinalizeHandoffMarkdownPath
          ? path.relative(outputDir, businessFinalizeHandoffMarkdownPath) || "business_finalize_handoff.md"
          : undefined,
        suggestedBusinessAnalysisCommand,
        publishRule: "business-analysis complete overrides workflow degraded",
      },
    },
    orchestration: {
      engine: "linear",
      strategyId: state.input.strategy ?? "turtle",
      runId: state.runId,
      threadId: state.threadId,
      completedStages: manifestStages,
    },
  };
  await writeText(manifestPath, JSON.stringify(manifest, null, 2));

  const next: Partial<WorkflowRunState> = {
    manifestPath,
    completedStages: ["finalizeManifest"],
  };
  const mergedStages = manifestStages;
  await persistCheckpoint(outputDir, state.runId!, state.threadId!, mergedStages, {
    ...state,
    ...next,
    completedStages: mergedStages,
  } as WorkflowRunState);
  return next;
}

export function routeAfterB(state: WorkflowRunState): "stageD" | "stageC" {
  return state.pdfPath ? "stageD" : "stageC";
}

/** 续跑 D：跳过 Stage B；否则自 B 进入主链。 */
export function routeAfterInit(state: WorkflowRunState): "stageB" | "stageD" {
  if (state.input.resumeFromStage === "D") return "stageD";
  return "stageB";
}
