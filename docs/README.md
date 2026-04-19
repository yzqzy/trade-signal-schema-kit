# 文档索引

[返回项目首页](../README.md)

本目录按 **architecture / guides / strategy** 分层。根目录 [README.md](../README.md) 以 **Claude Code** 为优先入口；流程参数与产物细节以 guides 为准。

## 文档维护原则（建议）

- **入口只放一处**：快速上手与命令入口以根目录 `README.md` 为准
- **参数只放一处**：CLI 参数、产物路径、续跑规则以 `guides/workflows.md` 为准
- **架构只放一处**：策略边界与 Stage 语义以 `architecture/strategy-orchestration-architecture.md` 为准

## architecture（结构与编排边界）

| 文档 | 说明 |
|------|------|
| [strategy-orchestration-architecture.md](./architecture/strategy-orchestration-architecture.md) | Stage A~E、策略插件、`StrategyPlugin` / `OrchestratorAdapter`、C1/C2 |

## guides（操作与契约）

| 文档 | 说明 |
|------|------|
| [workflows.md](./guides/workflows.md) | **流程真源（Stage 主叙事）**、Slash 与 CLI 参数、产物、PDF 分支与实现顺序 |
| [entrypoint-narrative-contract.md](./guides/entrypoint-narrative-contract.md) | **证据包 vs 终稿叙事**、入口矩阵、CLI/Claude 失败语义、000021 验收示例（终稿证据索引：本地路径优先） |
| [phase0-download.md](./guides/phase0-download.md) | Phase 0 年报下载、校验、CLI 与退出码 |
| [data-source.md](./guides/data-source.md) | Feed 接入原则、字段范围、质量门禁 |
| [stock-analysis-e2e-checklist.md](./guides/stock-analysis-e2e-checklist.md) | 个股分析全链路跑通清单（A 股） |
| [turtle-framework-alignment-gap-matrix.md](./guides/turtle-framework-alignment-gap-matrix.md) | Turtle 参考工程 ↔ 本仓能力差距矩阵（验收基线） |
| [feed-gap-contract.md](./guides/feed-gap-contract.md) | Feed-first 缺口分级与 `## 数据缺口与补齐建议` 契约 |

## strategy（选型与版本节奏）

| 文档 | 说明 |
|------|------|
| [agent-framework-comparison.md](./strategy/agent-framework-comparison.md) | LangGraph 选型、PoC 范围、**Claude Code 与 LangGraph 分层** |
| [strategy-roadmap.md](./strategy/strategy-roadmap.md) | v0.1~v0.3 节奏与策略插件化跨版本说明 |

## 阅读建议

1. 先读根目录 `README.md`（Claude Code 优先路径与 Slash→CLI 映射）  
2. 叙事职责：读 [entrypoint-narrative-contract.md](./guides/entrypoint-narrative-contract.md)（**主要在 Claude 使用**、TS 为证据管线）  
3. 参数与产物：以 [guides/workflows.md](./guides/workflows.md) **与源码**为准（示意图与「当前实现」不一致时，以文档内「当前实现」为准）  
4. 策略与阶段语义：[strategy-orchestration-architecture.md](./architecture/strategy-orchestration-architecture.md)
