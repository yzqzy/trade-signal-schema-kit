import type { RunWorkflowInput, WorkflowArtifacts } from "../workflow/orchestrator.js";
import { runResearchWorkflow } from "../workflow/orchestrator.js";

/**
 * 编排适配器：对外暴露「跑完整 workflow」的统一入口，便于将来替换为 LangGraph 等实现。
 * M1：委托现有 `runResearchWorkflow`，行为与契约基线一致。
 */
export interface OrchestratorAdapter {
  runStages(input: RunWorkflowInput): Promise<WorkflowArtifacts>;
}

export function createDefaultWorkflowOrchestratorAdapter(): OrchestratorAdapter {
  return {
    runStages(input) {
      return runResearchWorkflow(input);
    },
  };
}
