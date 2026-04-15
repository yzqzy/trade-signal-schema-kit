import type { StrategyPlugin } from "./contracts.js";
import { createTurtleStrategyPlugin } from "./turtle-strategy-plugin.js";
import { createValueV1StrategyPlugin } from "./value-v1-strategy-plugin.js";
import type { WorkflowStrategyId } from "../workflow/run-types.js";

let cachedTurtle: StrategyPlugin | undefined;
let cachedValueV1: StrategyPlugin | undefined;

/**
 * 解析 workflow 在 Stage E 使用的策略插件。
 * 默认 `turtle`；`value_v1` 为样板策略，用于验证插件注册与编排隔离。
 */
export function resolveWorkflowStrategyPlugin(strategyId?: WorkflowStrategyId): StrategyPlugin {
  const id = strategyId ?? "turtle";
  if (id === "value_v1") {
    cachedValueV1 ??= createValueV1StrategyPlugin();
    return cachedValueV1;
  }
  cachedTurtle ??= createTurtleStrategyPlugin();
  return cachedTurtle;
}

/** @deprecated 使用 {@link resolveWorkflowStrategyPlugin}；保留兼容旧调用方。 */
export function getDefaultWorkflowStrategyPlugin(): StrategyPlugin {
  return resolveWorkflowStrategyPlugin("turtle");
}
