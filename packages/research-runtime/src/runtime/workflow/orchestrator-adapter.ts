import type { RunWorkflowInput, WorkflowArtifacts } from "./orchestrator.js";
import { runResearchWorkflow } from "./orchestrator.js";

/**
 * 编排适配器：对外暴露「跑完整 workflow」的统一入口，便于套一层测试桩或换实现。
 * 默认委托 `runResearchWorkflow`（`runtime/workflow/pipeline` 线性执行），行为与契约基线一致。
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
