import { runPhase3Strict } from "../../steps/phase3/analyzer.js";
import { strictWorkflowStrictMissingReportPack } from "../../crosscut/preflight/strict-mode-message.js";
import type {
  StrategyEvaluationContext,
  StrategyPlugin,
  StrategyStageEPrerequisitesContext,
} from "../contracts.js";

const VALUE_V1_STRATEGY_ID = "value_v1";
const VALUE_V1_STRATEGY_VERSION = "0.1.0";

/**
 * 第二策略样板：与 Turtle 共用同一套 Phase3 严格计算，仅在报告呈现层打标，用于验证「同编排骨架 + 不同策略插件」。
 * 后续可在此分叉估值权重、门控或叙事模板，而不改 LangGraph 节点编排。
 */
export function createValueV1StrategyPlugin(): StrategyPlugin {
  return {
    id: VALUE_V1_STRATEGY_ID,
    version: VALUE_V1_STRATEGY_VERSION,
    supports(): boolean {
      return true;
    },
    evaluate(context: StrategyEvaluationContext) {
      const base = runPhase3Strict({
        marketMarkdown: context.marketMarkdown,
        reportMarkdown: context.reportMarkdown,
        interimReportMarkdown: context.interimReportMarkdown,
      });
      return {
        ...base,
        report: {
          ...base.report,
          title: `${base.report.title}（${VALUE_V1_STRATEGY_ID}）`,
        },
      };
    },
    validateStageEPrerequisites(context: StrategyStageEPrerequisitesContext) {
      if (context.workflowMode === "turtle-strict" && !context.reportMarkdown?.trim()) {
        throw new Error(strictWorkflowStrictMissingReportPack());
      }
    },
  };
}
