# 新增 Workflow 策略（Stage E）注册指南

[返回文档索引](../README.md) · [策略与编排边界](../architecture/strategy-orchestration-architecture.md) · [流程与 CLI](./workflows.md)

Stage E（Phase3）通过 **`StrategyPlugin`** 接入；编排层（LangGraph）只负责阶段顺序与落盘，不实现具体策略规则。

## 1. 固定改动清单（按顺序）

1. **实现插件**  
   新建 `packages/research-strategies/src/strategies/<your-id>/plugin.ts`，导出 `createXxxStrategyPlugin(): StrategyPlugin`，实现 `supports` / `evaluate`（签名见 `strategies/contracts.ts`）。

2. **扩展策略 ID 类型**  
   编辑 [`packages/research-strategies/src/contracts/workflow-run-types.ts`](../../packages/research-strategies/src/contracts/workflow-run-types.ts) 中 `WorkflowStrategyId` 联合类型，加入你的 `id` 字符串（与插件 `id` 字段一致）。

3. **注册表解析**  
   编辑 [`packages/research-strategies/src/strategies/registry.ts`](../../packages/research-strategies/src/strategies/registry.ts) 的 `resolveWorkflowStrategyPlugin`：为新区间增加分支（可做简单缓存，参考 `turtle` / `value_v1`）。

4. **CLI 白名单**  
   编辑 [`packages/research-strategies/src/cli/workflow.ts`](../../packages/research-strategies/src/cli/workflow.ts)：扩展 `--strategy` 解析与校验，避免静默拼写错误。

5. **烟测**  
   编辑 [`packages/research-strategies/src/quality/strategy-plugin-smoke.ts`](../../packages/research-strategies/src/quality/strategy-plugin-smoke.ts)：对新区间调用 `resolveWorkflowStrategyPlugin` 并做一次最小 `evaluate`（可用 fixture Markdown，与现有 `turtle` / `value_v1` 并列）。

6. **文档**  
   在本文件或 [workflows.md](./workflows.md) 补充 `--strategy` 说明；若策略有特殊 C2 需求，在 [strategy-orchestration-architecture.md](../architecture/strategy-orchestration-architecture.md) 注明。

## 2. 契约约束（必读）

- 插件 **只消费** `data_pack_*` 等标准契约 Markdown / JSON，不直接读 feed 原始字段。  
- 需要新字段时走 **`@trade-signal/schema-core`** 变更，而不是在插件里硬编码上游键名。  
- C1（通用证据）与 C2（策略投影）分层：策略语义应落在 C2 与 Stage E，不回写污染 C1 原始证据（见架构文档）。

## 3. 回归命令

```bash
pnpm run typecheck
pnpm run build
pnpm run test:linkage
pnpm --filter @trade-signal/research-strategies run quality:strategy-registry
pnpm run quality:all
```

## 4. 常见错误

| 现象 | 处理 |
|------|------|
| `--strategy` 报 invalid | 未在 `cli/workflow.ts` 白名单或拼写与 `WorkflowStrategyId` 不一致 |
| `resolveWorkflowStrategyPlugin` 落到默认 `turtle` | `registry.ts` 未覆盖新 id 或 `id` 与 CLI 字符串不一致 |
| 类型报错 | 未扩展 `WorkflowStrategyId` 或插件返回类型与 `Phase3ExecutionResult` 不一致 |
