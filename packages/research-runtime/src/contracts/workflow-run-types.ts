import type { Phase1BQualitativeSupplement } from "../steps/phase1b/types.js";

export type WorkflowMode = "standard" | "turtle-strict";

/** Stage E（Phase3）策略插件标识；默认 `turtle`。 */
export type WorkflowStrategyId = "turtle" | "value_v1";

export interface RunWorkflowInput {
  code: string;
  year?: string;
  companyName?: string;
  from?: string;
  to?: string;
  outputDir?: string;
  pdfPath?: string;
  reportUrl?: string;
  category?: string;
  phase1bChannel?: "http";
  mode?: WorkflowMode;
  /** Stage E 策略；与 `--mode` 并行，不改变 CLI 既有默认行为（未传即 turtle）。 */
  strategy?: WorkflowStrategyId;
  preflight?: "off" | "strict";
  interimReportMdPath?: string;
  interimPdfPath?: string;
  refreshMarket?: boolean;
  preflightRemedyPass?: number;
  /**
   * 从 `workflow_checkpoint.json` 续跑：仅重跑自 Stage B 或 D 起的子链（需相同 `--output-dir`）。
   */
  resumeFromStage?: "B" | "D";
  /** 显式 run id；默认由编排生成 UUID */
  runId?: string;
}

export interface WorkflowArtifacts {
  outputDir: string;
  phase1aJsonPath: string;
  marketPackPath: string;
  phase1bJsonPath: string;
  phase1bMarkdownPath: string;
  pdfPath?: string;
  phase2aJsonPath?: string;
  phase2bMarkdownPath?: string;
  phase2aInterimJsonPath?: string;
  phase2bInterimMarkdownPath?: string;
  valuationPath: string;
  reportMarkdownPath: string;
  manifestPath: string;
  phase3PreflightPath?: string;
  /** Markdown-first 研报整形（`report-polish` 阶段） */
  reportViewModelPath?: string;
  turtleOverviewMarkdownPath?: string;
  businessQualityMarkdownPath?: string;
  penetrationReturnMarkdownPath?: string;
  valuationTopicMarkdownPath?: string;
}

export interface WorkflowDataPipelineResult {
  outputDir: string;
  normalizedCode: string;
  phase1aJsonPath: string;
  marketPackPath: string;
  marketPackMarkdown: string;
  phase1bJsonPath: string;
  phase1bMarkdownPath: string;
  phase1b: Phase1BQualitativeSupplement;
  pdfPath?: string;
  phase2aJsonPath?: string;
  phase2bMarkdownPath?: string;
  phase2aInterimJsonPath?: string;
  phase2bInterimMarkdownPath?: string;
  reportPackMarkdown?: string;
  interimReportMarkdown?: string;
  reportUrlResolved?: string;
  phase3PreflightPath?: string;
}
