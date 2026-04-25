#!/usr/bin/env node
/**
 * V2 拆包与注册表烟测：确保 Policy/Topic 注册可用。
 * 运行：`pnpm run build && pnpm --filter @trade-signal/research-runtime run test:v2-layer-guard`
 */
import assert from "node:assert/strict";

import { listRegisteredPolicyIds } from "@trade-signal/research-policy";
import { listRegisteredTopicIds } from "@trade-signal/research-topic";
import { bootstrapV2PluginRegistry } from "../bootstrap/v2-plugin-registry.js";

function main(): void {
  bootstrapV2PluginRegistry();
  assert.ok(listRegisteredPolicyIds().includes("policy:turtle"));
  assert.ok(listRegisteredTopicIds().includes("topic:business-six-dimension"));
  console.log("[test:v2-layer-import-guard] ok");
}

main();
