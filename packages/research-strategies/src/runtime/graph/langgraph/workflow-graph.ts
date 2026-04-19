import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";

import { WorkflowGraphStateAnnotation } from "./workflow-state.js";
import {
  nodeFinalizeManifest,
  nodeInitPrep,
  nodePreflight3,
  nodeStageB,
  nodeStageC,
  nodeStageD,
  nodeStageE,
  routeAfterB,
  routeAfterInit,
} from "./workflow-nodes.js";

/**
 * Phase0–1B +（条件）2A/2B + Phase3 preflight，不含 Phase3 主评估与 manifest。
 */
export function buildWorkflowPipelineGraph() {
  return new StateGraph(WorkflowGraphStateAnnotation)
    .addNode("initPrep", nodeInitPrep)
    .addNode("stageB", nodeStageB)
    .addNode("stageD", nodeStageD)
    .addNode("stageC", nodeStageC)
    .addNode("preflight3", nodePreflight3)
    .addEdge(START, "initPrep")
    .addConditionalEdges("initPrep", routeAfterInit, {
      stageB: "stageB",
      stageD: "stageD",
    })
    .addConditionalEdges("stageB", routeAfterB, {
      stageD: "stageD",
      stageC: "stageC",
    })
    .addEdge("stageD", "stageC")
    .addEdge("stageC", "preflight3")
    .addEdge("preflight3", END);
}

/** 完整 workflow：在 pipeline 图基础上追加 Stage E 与 manifest。 */
export function buildWorkflowFullGraph() {
  return new StateGraph(WorkflowGraphStateAnnotation)
    .addNode("initPrep", nodeInitPrep)
    .addNode("stageB", nodeStageB)
    .addNode("stageD", nodeStageD)
    .addNode("stageC", nodeStageC)
    .addNode("preflight3", nodePreflight3)
    .addNode("stageE", nodeStageE)
    .addNode("finalizeManifest", nodeFinalizeManifest)
    .addEdge(START, "initPrep")
    .addConditionalEdges("initPrep", routeAfterInit, {
      stageB: "stageB",
      stageD: "stageD",
    })
    .addConditionalEdges("stageB", routeAfterB, {
      stageD: "stageD",
      stageC: "stageC",
    })
    .addEdge("stageD", "stageC")
    .addEdge("stageC", "preflight3")
    .addEdge("preflight3", "stageE")
    .addEdge("stageE", "finalizeManifest")
    .addEdge("finalizeManifest", END);
}

export function createDefaultWorkflowCheckpointer(): MemorySaver {
  return new MemorySaver();
}
