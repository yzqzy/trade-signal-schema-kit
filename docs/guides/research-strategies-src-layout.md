# `research-strategies` 源码目录说明（实用口径）

[返回文档索引](../README.md)

本包 **不追求固定目录个数**，以「主链路清晰 + 支撑域可维护」为准。下列为当前 `packages/research-strategies/src/` 顶层职责边界，便于区分「主干」与「支撑」，避免误删。

## 主干（编排与用例）

| 目录 | 职责 |
|------|------|
| `app/` | 对外用例：`workflow`、`business-analysis`、市场包构建等 |
| `orchestrator/` | LangGraph 图、checkpoint、编排适配器（**不含策略实现**） |
| `stages/phase*` | Phase0~Phase3 阶段执行器 |
| `strategies/` | `StrategyPlugin` 实现、`registry.ts` 策略解析 |
| `contracts/` | 跨层类型与产物布局元数据（如 `workflow-run-types.ts`、`output-layout-v2.ts`） |
| `cli/` | Node CLI 入口（与包内 `run:*` 脚本对应） |

## 支撑域（保留理由）

| 目录 | 职责 |
|------|------|
| `pipeline/` | 跨 CLI / 编排 / 用例复用的预检、规范化、严格文案（**不是遗留堆**） |
| `quality/` | `quality:*` 门禁脚本与回归/契约检查实现 |
| `screener/` | 选股器独立域，与主 workflow 并行存在 |
| `tests/` | 链路/逻辑烟测（由 `test:*` 脚本经 `dist/...` 调用） |

## 产物目录（output v2）

默认写入仓库根下 `output/`（在包内 `pnpm` 执行时经 `resolveOutputPath` 解析到 monorepo 根）。布局见 [workflows.md](./workflows.md) 中 **「产物目录 output v2」** 小节。
