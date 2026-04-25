import type { RunWorkflowInput } from "../../../contracts/workflow-run-types.js";
import type { Phase1BQualitativeSupplement } from "../../../steps/phase1b/types.js";
import type { Phase3ExecutionResult } from "../../../steps/phase3/types.js";
import type { PreflightLevel } from "../../../crosscut/preflight/preflight.js";

/**
 * workflow 各阶段共享状态；由线性 runner 逐步合并，续跑时由
 * `workflow_checkpoint.json` 与磁盘产物恢复。
 */
export interface WorkflowRunState {
  input: RunWorkflowInput;
  runId?: string;
  threadId?: string;
  completedStages?: string[];
  normalizedCode?: string;
  outputDir?: string;
  interimReportMarkdown?: string;
  phase2aInterimJsonPath?: string;
  phase2bInterimMarkdownPath?: string;
  from?: string;
  to?: string;
  pdfPath?: string;
  reportUrlResolved?: string;
  phase1aJsonPath?: string;
  marketPackPath?: string;
  marketPackMarkdown?: string;
  resolvedCompanyName?: string;
  phase2aJsonPath?: string;
  phase2bMarkdownPath?: string;
  reportPackMarkdown?: string;
  phase1b?: Phase1BQualitativeSupplement;
  phase1bJsonPath?: string;
  phase1bMarkdownPath?: string;
  phase3PreflightPath?: string;
  phase3PreflightVerdict?: string;
  phase3PreflightMarkdown?: string;
  phase3PreflightAbortReasons?: string[];
  phase3Execution?: Phase3ExecutionResult;
  valuationPath?: string;
  reportMarkdownPath?: string;
  reportViewModelPath?: string;
  turtleOverviewMarkdownPath?: string;
  businessQualityMarkdownPath?: string;
  penetrationReturnMarkdownPath?: string;
  valuationTopicMarkdownPath?: string;
  manifestPath?: string;
  preflightEffective?: PreflightLevel;
  resumeLoaded?: boolean;
}
