# 文档索引

[返回项目首页](../README.md)

本目录按 **architecture / guides / strategy** 分层。根目录 [README.md](../README.md) 以 **Claude Code** 为优先入口；流程参数与产物细节以 guides 为准。

## architecture（结构与编排边界）

| 文档 | 说明 |
|------|------|
| [system-architecture.md](./architecture/system-architecture.md) | 三层结构、数据流、设计边界 |
| [strategy-orchestration-architecture.md](./architecture/strategy-orchestration-architecture.md) | Stage A~E、策略插件、`StrategyPlugin` / `OrchestratorAdapter`、C1/C2 |
| [contract-baseline.md](./architecture/contract-baseline.md) | **M0 原语义契约基线**（CLI、顺序、产物、错误前缀、门禁） |

## guides（操作与契约）

| 文档 | 说明 |
|------|------|
| [workflows.md](./guides/workflows.md) | **流程真源（Stage 主叙事）**、Slash 与 CLI 参数、产物、PDF 分支与实现顺序 |
| [research-strategies-src-layout.md](./guides/research-strategies-src-layout.md) | `research-strategies` 源码顶层目录职责（主干 vs 支撑） |
| [strategy-registration.md](./guides/strategy-registration.md) | 新增 Stage E 策略插件：注册步骤与回归命令 |
| [phase0-download.md](./guides/phase0-download.md) | Phase 0 年报下载、校验、CLI 与退出码 |
| [data-source.md](./guides/data-source.md) | Feed 接入原则、字段范围、质量门禁 |
| [stock-analysis-e2e-checklist.md](./guides/stock-analysis-e2e-checklist.md) | 个股分析全链路跑通清单（A 股） |
| [agent-llm-and-env.md](./guides/agent-llm-and-env.md) | **Feed 最小变量、Claude 优先三步法、续跑与常见故障** |

## strategy（选型与版本节奏）

| 文档 | 说明 |
|------|------|
| [agent-framework-comparison.md](./strategy/agent-framework-comparison.md) | LangGraph 选型、PoC 范围、**Claude Code 与 LangGraph 分层** |
| [strategy-roadmap.md](./strategy/strategy-roadmap.md) | v0.1~v0.3 节奏与策略插件化跨版本说明 |

## 阅读建议

1. 先读根目录 `README.md`（Claude Code 优先路径与 Slash→CLI 映射）  
2. 参数与产物：以 [guides/workflows.md](./guides/workflows.md) **与源码**为准（示意图与「当前实现」不一致时，以文档内「当前实现」为准）  
3. 策略与阶段语义：[strategy-orchestration-architecture.md](./architecture/strategy-orchestration-architecture.md)
