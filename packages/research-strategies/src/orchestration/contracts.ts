import type { Phase3ExecutionResult } from "../phase3/types.js";

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
export interface StrategyPlugin {
  readonly id: string;
  readonly version: string;
  supports(context: StrategyEvaluationContext): boolean;
  evaluate(context: StrategyEvaluationContext): Phase3ExecutionResult;
}
