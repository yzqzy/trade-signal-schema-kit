import { Annotation } from "@langchain/langgraph";

import type { RunWorkflowInput } from "../../contracts/workflow-run-types.js";
import type { Phase1BQualitativeSupplement } from "../../stages/phase1b/types.js";
import type { Phase3ExecutionResult } from "../../stages/phase3/types.js";
import type { PreflightLevel } from "../../pipeline/preflight.js";

/**
 * LangGraph 共享状态：各节点返回 Partial，由 LastValue 通道合并。
 * 续跑时由 `workflow_graph_checkpoint.json` 与磁盘产物恢复。
 */
export const WorkflowGraphStateAnnotation = Annotation.Root({
  input: Annotation<RunWorkflowInput>,

  runId: Annotation<string | undefined>(),
  /** LangGraph MemorySaver thread_id，与 runId 对齐 */
  threadId: Annotation<string | undefined>(),
  completedStages: Annotation<string[]>({
    reducer: (left, right) => [...new Set([...left, ...right])],
    default: () => [],
  }),

  normalizedCode: Annotation<string | undefined>(),
  outputDir: Annotation<string | undefined>(),

  interimReportMarkdown: Annotation<string | undefined>(),
  phase2aInterimJsonPath: Annotation<string | undefined>(),
  phase2bInterimMarkdownPath: Annotation<string | undefined>(),

  from: Annotation<string | undefined>(),
  to: Annotation<string | undefined>(),
  pdfPath: Annotation<string | undefined>(),
  reportUrlResolved: Annotation<string | undefined>(),

  phase1aJsonPath: Annotation<string | undefined>(),
  marketPackPath: Annotation<string | undefined>(),
  marketPackMarkdown: Annotation<string | undefined>(),
  /** Phase1A 后用于 Phase1B 的公司名解析 */
  resolvedCompanyName: Annotation<string | undefined>(),

  phase2aJsonPath: Annotation<string | undefined>(),
  phase2bMarkdownPath: Annotation<string | undefined>(),
  reportPackMarkdown: Annotation<string | undefined>(),

  phase1b: Annotation<Phase1BQualitativeSupplement | undefined>(),
  phase1bJsonPath: Annotation<string | undefined>(),
  phase1bMarkdownPath: Annotation<string | undefined>(),

  phase3PreflightPath: Annotation<string | undefined>(),
  phase3PreflightVerdict: Annotation<string | undefined>(),
  phase3PreflightMarkdown: Annotation<string | undefined>(),
  phase3PreflightAbortReasons: Annotation<string[] | undefined>(),

  phase3Execution: Annotation<Phase3ExecutionResult | undefined>(),
  valuationPath: Annotation<string | undefined>(),
  reportMarkdownPath: Annotation<string | undefined>(),
  reportHtmlPath: Annotation<string | undefined>(),
  manifestPath: Annotation<string | undefined>(),

  preflightEffective: Annotation<PreflightLevel | undefined>(),

  /** 续跑：从 checkpoint 恢复时注入 */
  resumeLoaded: Annotation<boolean | undefined>(),
});

export type WorkflowGraphState = typeof WorkflowGraphStateAnnotation.State;
