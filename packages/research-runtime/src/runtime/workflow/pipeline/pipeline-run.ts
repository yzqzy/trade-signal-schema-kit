import type { WorkflowRunState } from "./run-state.js";
import {
  nodeFinalizeManifest,
  nodeInitPrep,
  nodePreflight3,
  nodeReportPolish,
  nodeStageB,
  nodeStageC,
  nodeStageD,
  nodeStageE,
  routeAfterB,
  routeAfterInit,
} from "./stage-nodes.js";

function mergeRunState(
  base: WorkflowRunState,
  patch: Partial<WorkflowRunState>,
): WorkflowRunState {
  const left = base.completedStages ?? [];
  const right = patch.completedStages ?? [];
  const completedStages = [...new Set([...left, ...right])];
  return { ...base, ...patch, completedStages };
}

/**
 * Phase0–1B +（条件）2A/2B + Phase3 preflight；分支与顺序与 `stage-nodes` 中路由一致。
 */
export async function runWorkflowPipeline(initial: WorkflowRunState): Promise<WorkflowRunState> {
  let state = mergeRunState(initial, await nodeInitPrep(initial));
  const afterInit = routeAfterInit(state);
  if (afterInit === "stageB") {
    state = mergeRunState(state, await nodeStageB(state));
    const afterB = routeAfterB(state);
    if (afterB === "stageD") {
      state = mergeRunState(state, await nodeStageD(state));
    }
  } else {
    state = mergeRunState(state, await nodeStageD(state));
  }
  state = mergeRunState(state, await nodeStageC(state));
  state = mergeRunState(state, await nodePreflight3(state));
  return state;
}

/** 完整 workflow：pipeline + Stage E + ReportPolish + manifest。 */
export async function runWorkflowFull(initial: WorkflowRunState): Promise<WorkflowRunState> {
  let state = await runWorkflowPipeline(initial);
  state = mergeRunState(state, await nodeStageE(state));
  state = mergeRunState(state, await nodeReportPolish(state));
  state = mergeRunState(state, await nodeFinalizeManifest(state));
  return state;
}
