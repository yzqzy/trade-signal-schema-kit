#!/usr/bin/env node
/**
 * 策略插件注册烟测：同一 golden 输入下 turtle 与 value_v1 均可 evaluate，
 * value_v1 在报告标题打标且估值 JSON 与 turtle 一致（验证「同编排骨架 + 不同插件」）。
 */
import { initCliEnv } from "../lib/init-cli-env.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { strict as assert } from "node:assert";

import type { ValuationComputed } from "@trade-signal/schema-core";

import { resolveWorkflowStrategyPlugin } from "../strategies/registry.js";

function valuationWithoutTimestamp(v: ValuationComputed): Omit<ValuationComputed, "generatedAt"> {
  const { generatedAt: _g, ...rest } = v;
  return rest;
}

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  const base = path.basename(cwd);
  if (base === "research-strategies") {
    return path.resolve(cwd, "../..");
  }
  return cwd;
}

async function main(): Promise<void> {
  initCliEnv();
  const root = resolveRepoRoot();
  const base = path.join(root, "output/phase3_golden/cn_a");
  const marketPath = path.join(base, "data_pack_market.md");
  const reportPath = path.join(base, "data_pack_report.md");
  const [marketMarkdown, reportMarkdown] = await Promise.all([
    readFile(marketPath, "utf-8"),
    readFile(reportPath, "utf-8"),
  ]);

  const ctx = { marketMarkdown, reportMarkdown };
  const turtlePlugin = resolveWorkflowStrategyPlugin("turtle");
  const valueV1Plugin = resolveWorkflowStrategyPlugin("value_v1");
  assert.equal(turtlePlugin.id, "turtle");
  assert.equal(valueV1Plugin.id, "value_v1");

  const turtle = turtlePlugin.evaluate(ctx);
  const valueV1 = valueV1Plugin.evaluate(ctx);

  assert.equal(valueV1.report.title.includes("value_v1"), true);
  assert.notEqual(valueV1.report.title, turtle.report.title);
  assert.deepEqual(valuationWithoutTimestamp(valueV1.valuation), valuationWithoutTimestamp(turtle.valuation));
  assert.equal(valueV1.decision, turtle.decision);
  assert.equal(valueV1.confidence, turtle.confidence);

  turtlePlugin.validateStageEPrerequisites?.({ workflowMode: "turtle-strict", reportMarkdown });
  valueV1Plugin.validateStageEPrerequisites?.({ workflowMode: "turtle-strict", reportMarkdown });
  assert.throws(
    () =>
      turtlePlugin.validateStageEPrerequisites?.({
        workflowMode: "turtle-strict",
        reportMarkdown: undefined,
      }),
    /\[strict:workflow:turtle-strict\]/,
  );

  console.log("[quality] strategy plugin smoke passed (turtle + value_v1)");
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
