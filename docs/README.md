# 文档索引

[返回项目首页](../README.md)

本目录按 **architecture / guides / strategy** 分层。根目录 [README.md](../README.md) 以 **Claude Code** 为优先入口；流程参数与产物细节以 guides 为准。

## 文档维护原则（建议）

- **入口只放一处**：快速上手与命令入口以根目录 `README.md` 为准；**Claude Code** 仓库内指引见根目录 [`CLAUDE.md`](../CLAUDE.md)（与 guides 契约链接一致）
- **参数只放一处**：CLI 参数、产物路径、续跑规则以 `guides/workflows.md` 为准
- **架构只放一处**：V2 对象与依赖以 `architecture/v2-domain-contract.md` 为准；Stage/策略插件历史叙事仍以 `strategy-orchestration-architecture.md` 为补充

## architecture（结构与编排边界）

| 文档 | 说明 |
|------|------|
| [v2-domain-contract.md](./architecture/v2-domain-contract.md) | **V2 真源**：RawDataPack / FeatureSet / PolicyResult / TopicReport / SelectionResult、强依赖约束、run state、profile、证据追踪字段 |
| [v2-flow-topology.md](./architecture/v2-flow-topology.md) | **V2** 唯一主流程图（四层 + Publisher）；六维=Topic、选股=Selection |
| [v2-plugin-model.md](./architecture/v2-plugin-model.md) | **V2** Feature/Policy/Topic/Selection 插件契约与命名空间 |
| [strategy-orchestration-architecture.md](./architecture/strategy-orchestration-architecture.md) | Stage A~E、策略插件、`StrategyPlugin` / `OrchestratorAdapter`、C1/C2 |

## guides（操作与契约）

| 文档 | 说明 |
|------|------|
| [workflows.md](./guides/workflows.md) | **流程真源（Stage 主叙事）**、Slash 与 CLI 参数、产物、PDF 分支与实现顺序 |
| [reports-site-publish.md](./guides/reports-site-publish.md) | **研报中心**：`site/reports` 协议、`sync:reports-to-app`、与 `apps/research-hub` 的衔接 |
| [entrypoint-narrative-contract.md](./guides/entrypoint-narrative-contract.md) | **证据包 vs 终稿叙事**、入口矩阵、CLI/Claude 失败语义、000021 验收示例（终稿证据索引：本地路径优先） |
| [report-polish-narrative-contract.md](./guides/report-polish-narrative-contract.md) | **report-polish**：workflow 多页 Markdown 发布稿与证据边界（与六维终稿分流） |
| [skill-shared-skill-template.md](./guides/skill-shared-skill-template.md) | **Claude Skill** 统一五段结构与共享规范索引 |
| [skill-shared-final-narrative-criteria.md](./guides/skill-shared-final-narrative-criteria.md) | 六维终稿 **final-narrative** 硬约束、阻断模板、输出标准（skill 引用真源） |
| [skill-shared-pdf-gate-semantics.md](./guides/skill-shared-pdf-gate-semantics.md) | `data_pack_report` / `gateVerdict` 与终稿完成态（skill 引用真源） |
| [phase0-download.md](./guides/phase0-download.md) | Phase 0 年报下载、校验、CLI 与退出码 |
| [data-source.md](./guides/data-source.md) | Feed 接入原则、字段范围、质量门禁 |
| [stock-analysis-e2e-checklist.md](./guides/stock-analysis-e2e-checklist.md) | 个股分析全链路跑通清单（A 股） |
| [turtle-framework-alignment-gap-matrix.md](./guides/turtle-framework-alignment-gap-matrix.md) | Turtle 参考工程 ↔ 本仓能力差距矩阵（验收基线） |
| [feed-gap-contract.md](./guides/feed-gap-contract.md) | Feed-first 缺口分级与 `## 数据缺口与补齐建议` 契约 |

## strategy（选型与版本节奏）

| 文档 | 说明 |
|------|------|
| [agent-framework-comparison.md](./strategy/agent-framework-comparison.md) | **Claude Code 与 TS 主链分层**、职责边界与验收关注点（线性 pipeline） |
| [strategy-roadmap.md](./strategy/strategy-roadmap.md) | v0.1~v0.3 节奏与策略插件化跨版本说明 |

## 阅读建议

1. 先读根目录 `README.md`（Claude Code 优先路径与 Slash→CLI 映射）  
2. 叙事职责：读 [entrypoint-narrative-contract.md](./guides/entrypoint-narrative-contract.md)（**主要在 Claude 使用**、TS 为证据管线）  
3. 参数与产物：以 [guides/workflows.md](./guides/workflows.md) **与源码**为准（示意图与「当前实现」不一致时，以文档内「当前实现」为准）  
4. V2 对象与拓扑：[v2-domain-contract.md](./architecture/v2-domain-contract.md) → [v2-flow-topology.md](./architecture/v2-flow-topology.md)  
5. 策略与阶段语义（与 Stage 对照）：[strategy-orchestration-architecture.md](./architecture/strategy-orchestration-architecture.md)
