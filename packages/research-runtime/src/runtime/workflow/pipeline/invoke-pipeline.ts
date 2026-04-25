import { randomUUID } from "node:crypto";

import { resolveOutputPath } from "../../../crosscut/normalization/resolve-monorepo-path.js";
import type {
  RunWorkflowInput,
  WorkflowArtifacts,
  WorkflowDataPipelineResult,
} from "../../../contracts/workflow-run-types.js";
import { readWorkflowCheckpoint } from "./checkpoint-io.js";
import { runWorkflowFull, runWorkflowPipeline } from "./pipeline-run.js";
import type { WorkflowRunState } from "./run-state.js";

function assertState<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}

export async function resolveWorkflowThreadId(input: RunWorkflowInput): Promise<string> {
  if (input.resumeFromStage) {
    if (!input.outputDir?.trim()) {
      throw new Error(
        "[workflow] output v2 续跑必须提供 --output-dir=含 checkpoint 的 run 根目录（例如 output/workflow/600887/<runId>/）",
      );
    }
    const outputDir = resolveOutputPath(input.outputDir.trim());
    const cp = await readWorkflowCheckpoint(outputDir);
    if (cp?.threadId) return cp.threadId;
    throw new Error(
      `[workflow] resumeFromStage=${input.resumeFromStage} 但缺少有效 workflow_checkpoint.json 中的 threadId`,
    );
  }
  if (input.runId?.trim()) return input.runId.trim();
  return randomUUID();
}

export function mapStateToWorkflowDataPipelineResult(state: WorkflowRunState): WorkflowDataPipelineResult {
  return {
    outputDir: assertState(state.outputDir, "[workflow] 缺少 outputDir"),
    normalizedCode: assertState(state.normalizedCode, "[workflow] 缺少 normalizedCode"),
    phase1aJsonPath: assertState(state.phase1aJsonPath, "[workflow] 缺少 phase1aJsonPath"),
    marketPackPath: assertState(state.marketPackPath, "[workflow] 缺少 marketPackPath"),
    marketPackMarkdown: assertState(state.marketPackMarkdown, "[workflow] 缺少 marketPackMarkdown"),
    phase1bJsonPath: assertState(state.phase1bJsonPath, "[workflow] 缺少 phase1bJsonPath"),
    phase1bMarkdownPath: assertState(state.phase1bMarkdownPath, "[workflow] 缺少 phase1bMarkdownPath"),
    phase1b: assertState(state.phase1b, "[workflow] 缺少 phase1b"),
    pdfPath: state.pdfPath,
    phase2aJsonPath: state.phase2aJsonPath,
    phase2bMarkdownPath: state.phase2bMarkdownPath,
    phase2aInterimJsonPath: state.phase2aInterimJsonPath,
    phase2bInterimMarkdownPath: state.phase2bInterimMarkdownPath,
    reportPackMarkdown: state.reportPackMarkdown,
    interimReportMarkdown: state.interimReportMarkdown,
    reportUrlResolved: state.reportUrlResolved,
    phase3PreflightPath: state.phase3PreflightPath,
  };
}

export function mapStateToWorkflowArtifacts(state: WorkflowRunState): WorkflowArtifacts {
  return {
    outputDir: assertState(state.outputDir, "[workflow] 缺少 outputDir"),
    phase1aJsonPath: assertState(state.phase1aJsonPath, "[workflow] 缺少 phase1aJsonPath"),
    marketPackPath: assertState(state.marketPackPath, "[workflow] 缺少 marketPackPath"),
    phase1bJsonPath: assertState(state.phase1bJsonPath, "[workflow] 缺少 phase1bJsonPath"),
    phase1bMarkdownPath: assertState(state.phase1bMarkdownPath, "[workflow] 缺少 phase1bMarkdownPath"),
    pdfPath: state.pdfPath,
    phase2aJsonPath: state.phase2aJsonPath,
    phase2bMarkdownPath: state.phase2bMarkdownPath,
    phase2aInterimJsonPath: state.phase2aInterimJsonPath,
    phase2bInterimMarkdownPath: state.phase2bInterimMarkdownPath,
    valuationPath: assertState(state.valuationPath, "[workflow] 缺少 valuationPath"),
    reportMarkdownPath: assertState(state.reportMarkdownPath, "[workflow] 缺少 reportMarkdownPath"),
    manifestPath: assertState(state.manifestPath, "[workflow] 缺少 manifestPath"),
    phase3PreflightPath: state.phase3PreflightPath,
    reportViewModelPath: state.reportViewModelPath,
    turtleOverviewMarkdownPath: state.turtleOverviewMarkdownPath,
    businessQualityMarkdownPath: state.businessQualityMarkdownPath,
    penetrationReturnMarkdownPath: state.penetrationReturnMarkdownPath,
    valuationTopicMarkdownPath: state.valuationTopicMarkdownPath,
  };
}

export async function invokeWorkflowDataPipeline(input: RunWorkflowInput): Promise<WorkflowDataPipelineResult> {
  const threadId = await resolveWorkflowThreadId(input);
  const initial: WorkflowRunState = { input: { ...input, runId: threadId } };
  const finalState = await runWorkflowPipeline(initial);
  return mapStateToWorkflowDataPipelineResult(finalState);
}

export async function invokeWorkflowFull(input: RunWorkflowInput): Promise<WorkflowArtifacts> {
  const threadId = await resolveWorkflowThreadId(input);
  const initial: WorkflowRunState = { input: { ...input, runId: threadId } };
  const finalState = await runWorkflowFull(initial);
  return mapStateToWorkflowArtifacts(finalState);
}
