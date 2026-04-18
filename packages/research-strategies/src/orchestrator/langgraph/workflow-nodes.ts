import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { createFeedHttpProviderFromEnv } from "@trade-signal/provider-http";

import { runPhase0DownloadAndCache } from "../../stages/phase0/downloader.js";
import { discoverPhase0ReportUrlFromFeed } from "../../stages/phase0/discover-report-url.js";
import { collectPhase1ADataPack } from "../../stages/phase1a/collector.js";
import { runStageCExternalEvidence } from "../../stages/phase1b/collector.js";
import { computePhase1bEvidenceQualityMetrics } from "../../stages/phase1b/evidence-quality.js";
import { renderPhase1BMarkdown } from "../../stages/phase1b/renderer.js";
import { runPhase2AExtractPdfSections } from "../../stages/phase2a/extractor.js";
import { tryApplyPdfSectionVerifier } from "./pdf-section-verifier.js";
import { renderPhase2BDataPackReport } from "../../stages/phase2b/renderer.js";
import { renderPhase3Html, renderPhase3Markdown } from "../../stages/phase3/report-renderer.js";
import { resolveWorkflowStrategyPlugin } from "../../strategies/registry.js";
import { evaluatePhase3Preflight } from "../../pipeline/phase3-preflight.js";
import { runPreflightAfterPhase1A, type PreflightLevel } from "../../pipeline/preflight.js";
import { OUTPUT_LAYOUT_VERSION, resolveWorkflowDefaultRunDirectory } from "../../contracts/output-layout-v2.js";
import { normalizeCodeForFeed } from "../../pipeline/normalize-stock-code.js";
import { resolveOutputPath } from "../../pipeline/resolve-monorepo-path.js";
import {
  strictPreflightPhase3Abort,
  strictPreflightPhase3SupplementNeeded,
  strictWorkflowTurtleDiscoveryFailed,
  strictWorkflowTurtleMissingReportPack,
} from "../../pipeline/strict-messages.js";
import { buildMarketPackMarkdown } from "../../app/workflow/build-market-pack.js";
import { refreshMarketPackMarkdown } from "../../app/workflow/refresh-market-pack.js";
import { readWorkflowCheckpoint, writeWorkflowCheckpoint, type WorkflowCheckpointFile } from "./checkpoint-io.js";
import { tryRunStageCAgentSidecar } from "./stage-c-agent.js";
import type { WorkflowGraphState } from "./workflow-state.js";

function asYear(value?: string): string {
  if (value && /^\d{4}$/.test(value)) return value;
  return String(new Date().getFullYear() - 1);
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

function mergeCompletedStages(state: WorkflowGraphState, stage: string): string[] {
  return Array.from(new Set([...(state.completedStages ?? []), stage]));
}

async function persistCheckpoint(
  outputDir: string,
  runId: string,
  threadId: string,
  completedStages: string[],
  state: WorkflowGraphState,
): Promise<void> {
  const payload: WorkflowCheckpointFile = {
    version: "1",
    runId,
    threadId,
    completedStages,
    snapshot: {
      normalizedCode: state.normalizedCode,
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
      reportHtmlPath: state.reportHtmlPath,
      manifestPath: state.manifestPath,
      agentSidecarNote: state.agentSidecarNote,
    },
  };
  await writeWorkflowCheckpoint(outputDir, payload);
}

export async function nodeInitPrep(state: WorkflowGraphState): Promise<Partial<WorkflowGraphState>> {
  const input = state.input;
  const runId = input.runId ?? randomUUID();
  const threadId = runId;

  if (input.resumeFromStage) {
    if (!input.outputDir?.trim()) {
      throw new Error(
        "[workflow:langgraph] output v2 续跑必须提供 --output-dir，指向含 workflow_graph_checkpoint.json 的 run 根目录（例如 output/workflow/600887/<runId>/）",
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
  const from = input.from ?? `${asYear(input.year)}-01-01`;

  let pdfPath = state.pdfPath ?? input.pdfPath;
  let reportUrlResolved = state.reportUrlResolved ?? input.reportUrl;

  if (input.resumeFromStage) {
    const cp = await readWorkflowCheckpoint(outputDir);
    if (!cp) {
      throw new Error(
        `[workflow:langgraph] resumeFromStage=${input.resumeFromStage} 但缺少 ${path.join(outputDir, "workflow_graph_checkpoint.json")}`,
      );
    }
    const inputPdf = input.pdfPath?.trim() ? path.resolve(input.pdfPath.trim()) : undefined;
    pdfPath = inputPdf ?? cp.snapshot.pdfPath ?? pdfPath;
    reportUrlResolved = input.reportUrl?.trim() || cp.snapshot.reportUrlResolved || reportUrlResolved;

    if (input.resumeFromStage === "D" && !pdfPath?.trim()) {
      throw new Error("[workflow:langgraph] resumeFromStage=D 需要 checkpoint.snapshot.pdfPath");
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
    const merged: Partial<WorkflowGraphState> = {
      runId: cp.runId,
      threadId: cp.threadId,
      normalizedCode: cp.snapshot.normalizedCode ?? normalizedCode,
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
      reportHtmlPath: cp.snapshot.reportHtmlPath,
      manifestPath: cp.snapshot.manifestPath,
      agentSidecarNote: cp.snapshot.agentSidecarNote,
      completedStages: resumedStages,
      resumeLoaded: true,
    };
    const mergedFull = { ...state, ...merged, input } as WorkflowGraphState;
    await persistCheckpoint(outputDir, cp.runId, cp.threadId, resumedStages, mergedFull);
    return merged;
  }

  if (!pdfPath && !reportUrlResolved && input.mode === "turtle-strict") {
    try {
      reportUrlResolved = await discoverPhase0ReportUrlFromFeed({
        stockCode: normalizedCode,
        fiscalYear: asYear(input.year),
        category: input.category ?? "年报",
      });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : "Feed discovery failed";
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

  const next: Partial<WorkflowGraphState> = {
    runId,
    threadId,
    normalizedCode,
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
    input,
    completedStages: mergedStages,
  } as WorkflowGraphState);
  return next;
}

export async function nodeStageB(state: WorkflowGraphState): Promise<Partial<WorkflowGraphState>> {
  const input = state.input;
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
    year: asYear(input.year),
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

  const next: Partial<WorkflowGraphState> = {
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
  } as WorkflowGraphState);
  return next;
}

export async function nodeStageD(state: WorkflowGraphState): Promise<Partial<WorkflowGraphState>> {
  const pdfPath = state.pdfPath;
  const outputDir = state.outputDir!;
  if (!pdfPath) {
    const mergedStages = mergeCompletedStages(state, "stageD_skipped");
    const patch: Partial<WorkflowGraphState> = { completedStages: ["stageD_skipped"] };
    await persistCheckpoint(outputDir, state.runId!, state.threadId!, mergedStages, {
      ...state,
      ...patch,
      completedStages: mergedStages,
    } as WorkflowGraphState);
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

  const next: Partial<WorkflowGraphState> = {
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
  } as WorkflowGraphState);
  return next;
}

export async function nodeStageC(state: WorkflowGraphState): Promise<Partial<WorkflowGraphState>> {
  const input = state.input;
  const normalizedCode = state.normalizedCode!;
  const outputDir = state.outputDir!;

  let phase1b = await runStageCExternalEvidence(
    {
      stockCode: normalizedCode,
      companyName: state.resolvedCompanyName!,
      year: asYear(input.year),
      channel: input.phase1bChannel ?? "http",
    },
    {},
  );

  let agentSidecarNote: string | undefined;
  try {
    agentSidecarNote = await tryRunStageCAgentSidecar(phase1b);
  } catch {
    agentSidecarNote = undefined;
  }

  const phase1bJsonPath = path.join(outputDir, "phase1b_qualitative.json");
  const phase1bMarkdownPath = path.join(outputDir, "phase1b_qualitative.md");
  const phase1bEvidenceQualityPath = path.join(outputDir, "phase1b_evidence_quality.json");
  await writeText(phase1bJsonPath, JSON.stringify(phase1b, null, 2));
  await writeText(phase1bMarkdownPath, renderPhase1BMarkdown(phase1b));
  await writeText(
    phase1bEvidenceQualityPath,
    JSON.stringify(computePhase1bEvidenceQualityMetrics(phase1b), null, 2),
  );

  const next: Partial<WorkflowGraphState> = {
    phase1b,
    phase1bJsonPath,
    phase1bMarkdownPath,
    agentSidecarNote,
    completedStages: ["stageC"],
  };
  const mergedStages = mergeCompletedStages(state, "stageC");
  await persistCheckpoint(outputDir, state.runId!, state.threadId!, mergedStages, {
    ...state,
    ...next,
    completedStages: mergedStages,
  } as WorkflowGraphState);
  return next;
}

export async function nodePreflight3(state: WorkflowGraphState): Promise<Partial<WorkflowGraphState>> {
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

  const next: Partial<WorkflowGraphState> = {
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
  } as WorkflowGraphState);
  return next;
}

export async function nodeStageE(state: WorkflowGraphState): Promise<Partial<WorkflowGraphState>> {
  const input = state.input;
  const outputDir = state.outputDir!;
  const marketPackMarkdown = state.marketPackMarkdown!;
  const reportPackMarkdown = state.reportPackMarkdown;
  const interimReportMarkdown = state.interimReportMarkdown;

  if (input.mode === "turtle-strict" && !reportPackMarkdown) {
    throw new Error(strictWorkflowTurtleMissingReportPack());
  }

  const strategyPlugin = resolveWorkflowStrategyPlugin(state.input.strategy);
  const phase3Execution = strategyPlugin.evaluate({
    marketMarkdown: marketPackMarkdown,
    reportMarkdown: reportPackMarkdown,
    interimReportMarkdown,
  });

  const valuationPath = path.join(outputDir, "valuation_computed.json");
  const reportMarkdownPath = path.join(outputDir, "analysis_report.md");
  const reportHtmlPath = path.join(outputDir, "analysis_report.html");
  await writeText(valuationPath, JSON.stringify(phase3Execution.valuation, null, 2));
  const reportMarkdown = renderPhase3Markdown(phase3Execution);
  await writeText(reportMarkdownPath, reportMarkdown);
  await writeText(reportHtmlPath, renderPhase3Html(reportMarkdown));

  const next: Partial<WorkflowGraphState> = {
    phase3Execution,
    valuationPath,
    reportMarkdownPath,
    reportHtmlPath,
    completedStages: ["stageE"],
  };
  const mergedStages = mergeCompletedStages(state, "stageE");
  await persistCheckpoint(outputDir, state.runId!, state.threadId!, mergedStages, {
    ...state,
    ...next,
    completedStages: mergedStages,
  } as WorkflowGraphState);
  return next;
}

export async function nodeFinalizeManifest(state: WorkflowGraphState): Promise<Partial<WorkflowGraphState>> {
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
  const reportHtmlPath = state.reportHtmlPath!;
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
      reportHtmlPath,
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
    },
    orchestration: {
      engine: "langgraph",
      strategyId: state.input.strategy ?? "turtle",
      runId: state.runId,
      threadId: state.threadId,
      completedStages: manifestStages,
      agentSidecarNote: state.agentSidecarNote,
    },
  };
  await writeText(manifestPath, JSON.stringify(manifest, null, 2));

  const next: Partial<WorkflowGraphState> = {
    manifestPath,
    completedStages: ["finalizeManifest"],
  };
  const mergedStages = manifestStages;
  await persistCheckpoint(outputDir, state.runId!, state.threadId!, mergedStages, {
    ...state,
    ...next,
    completedStages: mergedStages,
  } as WorkflowGraphState);
  return next;
}

export function routeAfterB(state: WorkflowGraphState): "stageD" | "stageC" {
  return state.pdfPath ? "stageD" : "stageC";
}

/** 续跑 D：跳过 Stage B；否则自 B 进入主链。 */
export function routeAfterInit(state: WorkflowGraphState): "stageB" | "stageD" {
  if (state.input.resumeFromStage === "D") return "stageD";
  return "stageB";
}
