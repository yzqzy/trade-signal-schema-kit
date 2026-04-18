import { runPhase3Strict } from "../../stages/phase3/analyzer.js";
import { strictWorkflowTurtleMissingReportPack } from "../../pipeline/strict-messages.js";
import type {
  StrategyEvaluationContext,
  StrategyPlugin,
  StrategyStageEPrerequisitesContext,
} from "../contracts.js";

const TURTLE_STRATEGY_ID = "turtle";
const TURTLE_STRATEGY_VERSION = "0.1.0";

/**
 * 当前默认策略：Turtle 严格 Phase3（`runPhase3Strict`）。
 * M1 仅做封装，不改变计算与报告语义。
 */
export function createTurtleStrategyPlugin(): StrategyPlugin {
  return {
    id: TURTLE_STRATEGY_ID,
    version: TURTLE_STRATEGY_VERSION,
    supports(): boolean {
      return true;
    },
    evaluate(context: StrategyEvaluationContext) {
      return runPhase3Strict({
        marketMarkdown: context.marketMarkdown,
        reportMarkdown: context.reportMarkdown,
        interimReportMarkdown: context.interimReportMarkdown,
      });
    },
    validateStageEPrerequisites(context: StrategyStageEPrerequisitesContext) {
      if (context.workflowMode === "turtle-strict" && !context.reportMarkdown?.trim()) {
        throw new Error(strictWorkflowTurtleMissingReportPack());
      }
    },
  };
}
