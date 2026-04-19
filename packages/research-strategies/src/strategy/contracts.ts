import type { WorkflowMode } from "../contracts/workflow-run-types.js";
import type { Phase3ExecutionResult } from "../steps/phase3/types.js";

/** Stage E 策略评估输入（仅标准契约侧 Markdown）。 */
export interface StrategyEvaluationContext {
  marketMarkdown: string;
  reportMarkdown?: string;
  interimReportMarkdown?: string;
}

/**
 * 策略插件：负责 Stage E（Phase3）语义。
 * 编排层只负责阶段顺序与落盘；不实现具体 Turtle/其他策略规则。
 */
/** Stage E 前置门控：由策略声明「在当前 workflow 模式下」是否必须具备报告包等。 */
export interface StrategyStageEPrerequisitesContext {
  workflowMode?: WorkflowMode;
  reportMarkdown?: string;
}

export interface StrategyPlugin {
  readonly id: string;
  readonly version: string;
  supports(context: StrategyEvaluationContext): boolean;
  evaluate(context: StrategyEvaluationContext): Phase3ExecutionResult;
  /** 可选：在 Stage E 计算前抛出，避免编排层硬编码某一策略规则。 */
  validateStageEPrerequisites?(context: StrategyStageEPrerequisitesContext): void;
}
