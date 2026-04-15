import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { WorkflowGraphState } from "./workflow-state.js";

const CHECKPOINT_FILENAME = "workflow_graph_checkpoint.json";

export type WorkflowCheckpointFile = {
  version: "1";
  runId: string;
  threadId: string;
  completedStages: string[];
  /** 仅序列化可恢复字段，避免超大对象 */
  snapshot: Pick<
    WorkflowGraphState,
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
    | "reportHtmlPath"
    | "manifestPath"
    | "agentSidecarNote"
  >;
};

export function checkpointPathFor(outputDir: string): string {
  return path.join(outputDir, CHECKPOINT_FILENAME);
}

export async function writeWorkflowCheckpoint(
  outputDir: string,
  payload: WorkflowCheckpointFile,
): Promise<void> {
  const filePath = checkpointPathFor(outputDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

export async function readWorkflowCheckpoint(outputDir: string): Promise<WorkflowCheckpointFile | undefined> {
  try {
    const raw = await readFile(checkpointPathFor(outputDir), "utf-8");
    return JSON.parse(raw) as WorkflowCheckpointFile;
  } catch {
    return undefined;
  }
}
