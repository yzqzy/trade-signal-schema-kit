import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { WorkflowRunState } from "./run-state.js";

const CHECKPOINT_FILENAME = "workflow_checkpoint.json";

export type WorkflowCheckpointFile = {
  version: "1";
  runId: string;
  threadId: string;
  completedStages: string[];
  /** 仅序列化可恢复字段，避免超大对象 */
  snapshot: Pick<
    WorkflowRunState,
    | "normalizedCode"
    | "outputDir"
    | "pdfPath"
    | "reportUrlResolved"
    | "from"
    | "to"
    | "interimReportMarkdown"
    | "phase2aInterimJsonPath"
    | "phase2bInterimMarkdownPath"
    | "phase1aJsonPath"
    | "marketPackPath"
    | "marketPackMarkdown"
    | "resolvedCompanyName"
    | "preflightEffective"
    | "phase2aJsonPath"
    | "phase2bMarkdownPath"
    | "reportPackMarkdown"
    | "phase1bJsonPath"
    | "phase1bMarkdownPath"
    | "phase3PreflightPath"
    | "valuationPath"
    | "reportMarkdownPath"
    | "reportViewModelPath"
    | "turtleOverviewMarkdownPath"
    | "businessQualityMarkdownPath"
    | "penetrationReturnMarkdownPath"
    | "valuationTopicMarkdownPath"
    | "manifestPath"
  >;
};

function checkpointFilePath(outputDir: string): string {
  return path.join(outputDir, CHECKPOINT_FILENAME);
}

/** run 根目录下 `workflow_checkpoint.json` 的绝对路径 */
export function checkpointPathFor(outputDir: string): string {
  return checkpointFilePath(outputDir);
}

export async function writeWorkflowCheckpoint(
  outputDir: string,
  payload: WorkflowCheckpointFile,
): Promise<void> {
  const filePath = checkpointFilePath(outputDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

export async function readWorkflowCheckpoint(outputDir: string): Promise<WorkflowCheckpointFile | undefined> {
  try {
    const raw = await readFile(checkpointFilePath(outputDir), "utf-8");
    return JSON.parse(raw) as WorkflowCheckpointFile;
  } catch {
    return undefined;
  }
}
