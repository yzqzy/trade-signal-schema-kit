# Agent 编排框架选型（定稿）

[返回项目首页](../../README.md) · [文档索引](../README.md)

## 结论（先看这个）

- **选型结论**：当前项目优先采用 **LangGraph.js** 作为**唯一**外层流程编排框架。
- **本阶段不做**：不并行落地 Mastra / pi-mono；多框架实现会放大维护成本。
- **执行原则**：业务编排与框架隔离（`OrchestratorAdapter`），保留后续替换空间。

## 为什么要编排层

主链路已有可运行 CLI（`workflow` / `business-analysis` / `valuation` / `screener`）。若要在「国产模型 + Claude」混跑下稳定交付，仅靠 skills 难以系统保证：

- 步骤级可恢复（失败后从中间步骤继续）
- 结构化输出稳定（JSON schema 一次通过率）
- 可观测与可审计（每步输入/输出/重试可追踪）

建议：**skills 作规则层**；**独立执行编排层**管状态与恢复。

## 项目约束（选型边界）

- 技术栈：TypeScript + pnpm monorepo
- 主链路：日常 **Claude Code Slash** 优先；CLI 用于脚本化与 CI；演进避免大爆炸式重构
- 运行：多模型路由、结构化输出、回退策略
- 交付：中间产物落盘，便于复跑与审计

## 框架对比（决策用，不多实现）

| 框架 | 适配度 | 优势 | 风险/代价 | 结论 |
|---|---|---|---|---|
| LangGraph.js | 高 | 图/状态机编排成熟；checkpoint/恢复；与工具调用、结构化输出集成好 | 学习曲线；若不抽象接口易框架耦合 | **采用** |
| Mastra | 中高 | TS 工程体验、Agent 组织清晰 | 切换收益相对不足；多框架并行成本高 | 暂不采用 |
| pi-mono | 待验证 | 可深度定制 | 生态不确定；不宜再加维护线 | 暂不采用 |
| Vercel AI SDK + 自建状态机 | 中 | 轻量 | 恢复/观测/审计需自建，长期成本高 | 暂不采用 |

## PoC 是做什么的

PoC（概念验证）用最小成本验证关键假设：**这条路线在真实场景能否稳定跑通**。

在本项目中验证：

- 步骤是否可恢复
- 结构化输出是否稳定（schema 一次通过率）
- 混模型是否可控
- 失败回退是否清晰（重试/降级/终止）

> 选型已定为 LangGraph.js；PoC 只验证**接入细节与风险**，不再做多框架横向比较。

## Claude Code 与 LangGraph（分层）

| 层级 | 职责 | 典型能力 |
|------|------|----------|
| **LangGraph** | **TS 主链**流程编排 | 阶段、分支、checkpoint、重试、审计；采集与规则估值 |
| **Claude Code** | **IDE 侧**深度定性 | Skills / slash commands；六维 narrative、PDF 对照 |

**组合方式**：用 LangGraph 跑 Stage B~E 的数据与契约产物；深度定性与叙事写作在 Claude Code 侧完成。**Claude Code 不替代图编排层**；本仓库 TS 主链的 Phase3 报告仍以**确定性规则估值与因子**为主输出。

业务阶段与策略边界见 [策略与流程解耦](../architecture/strategy-orchestration-architecture.md)；流程与 CLI 真源见 [workflows](../guides/workflows.md)。

## 推荐落地路径（单框架）

### 阶段 1：最小 PoC（只验证 LangGraph）

- 固定 3 条测试链路：`collect/normalize`、`reasoning/render`、`validate/fallback`
- 固定指标：JSON schema 一次通过率、平均重试次数、端到端耗时、失败可恢复率

### 阶段 2：接口解耦

- 抽象 `OrchestratorAdapter`，业务不直接依赖 LangGraph API
- 各 step 输入/输出强制 schema 化
- 关键中间产物落盘，支持断点恢复

### 阶段 3：接入主链路

- 建议先接 `business-analysis` 的 D1~D6 相关链路，再扩展到 `workflow` 关键步骤

## 与相关文档关系

- 流程与命令：[guides/workflows.md](../guides/workflows.md)
- 数据契约：[guides/data-source.md](../guides/data-source.md)
- 策略插件与 Stage：[strategy-orchestration-architecture.md](../architecture/strategy-orchestration-architecture.md)
- 版本与能力节奏：[strategy-roadmap.md](./strategy-roadmap.md)

本文档只回答：**选哪个编排框架、PoC 验证什么、如何与 Claude Code 分层落地**。

## Monorepo 形态

**不建议拆仓**，保持 monorepo：`schema-core`、`provider-*`、`research-strategies` 契约边界已清晰；当前主要缺口在编排机制而非仓库形态。

简化建议：

- 继续冻结 `apps/screener-web`，聚焦 CLI 主链路
- Agent 编排落在 `research-strategies` 内独立模块
- 文档以 `docs/README.md` 为索引入口，避免多入口漂移
