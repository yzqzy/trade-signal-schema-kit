# Agent 编排与 TS 主链分层

[返回项目首页](../../README.md) · [文档索引](../README.md)

## 结论（先看这个）

- **实现（2026）**：`research-runtime` 的 workflow 主链为 **TypeScript 线性 runner**（`src/runtime/workflow/pipeline/`，`workflow_checkpoint.json` 续跑），阶段与分支在仓库内**自研实现**，不引入第三方工作流/编排运行时。
- **本阶段不做**：不并行落地多套 Agent 框架或不同编排引擎；多实现会放大维护成本。
- **执行原则**：业务编排经 `OrchestratorAdapter` 等入口保持可测、可替换实现细节。

## 为什么要编排层

主链路已有可运行 CLI（`workflow` / `business-analysis` / `valuation` / `screener`）。若要在「国产模型 + Claude」混跑下稳定交付，仅靠 skills 难以系统保证：

- 步骤级可恢复（失败后从中间步骤继续）
- 结构化输出稳定（JSON schema 一次通过率）
- 可观测与可审计（每步输入/输出/重试可追踪）

建议：**skills 作规则层**；**独立执行编排层**管状态与恢复。

## 项目约束（边界）

- 技术栈：TypeScript + pnpm monorepo
- 主链路：日常 **Claude Code Slash** 优先；CLI 用于脚本化与 CI；演进避免大爆炸式重构
- 运行：多模型路由、结构化输出、回退策略
- 交付：中间产物落盘，便于复跑与审计

## 实现选择（不引入独立编排产品）

- **主链位置**：`runtime/workflow/pipeline`（`pipeline-run`、`stage-nodes`、各 `node*`，续跑用 `workflow_checkpoint.json`）
- **策略**：不引入需单独运维的图/工作流类库；以清晰模块边界、契约与落盘为主。若未来需要换内部实现，仍以 `OrchestratorAdapter` 为业务侧入口。

## 验证与关注指标（与 PoC 等价问题）

在真实场景下持续验证：

- 步骤是否可恢复
- 结构化输出是否稳定（schema 一次通过率）
- 混模型是否可控
- 失败回退是否清晰（重试/降级/终止）

## Claude Code 与 TypeScript 主链（分层）

| 层级 | 职责 | 典型能力 |
|------|------|----------|
| **TypeScript 主链** | CLI 可脚本化的流程与落盘 | 阶段、分支、续跑、重试、审计；采集与规则估值 |
| **Claude Code** | **IDE 侧**深度定性 | Skills / slash commands；六维 narrative、PDF 对照 |

**组合方式**：由 TS 主链跑 Stage B~E 的数据与契约产物；深度定性与叙事写作在 Claude Code 侧完成。**Claude Code 不替代** TS 主链上的编排、契约校验与落盘；本仓库 TS 主链的 Phase3 报告仍以**确定性规则估值与因子**为主输出。

业务阶段与策略边界见 [策略与流程解耦](../architecture/strategy-orchestration-architecture.md)；流程与 CLI 真源见 [workflows](../guides/workflows.md)。

## 推荐落地路径

### 阶段 1：最小可观测链路

- 固定 3 条测试链路：`collect/normalize`、`reasoning/render`、`validate/fallback`
- 固定指标：JSON schema 一次通过率、平均重试次数、端到端耗时、失败可恢复率

### 阶段 2：接口解耦

- 抽象 `OrchestratorAdapter`，业务不绑死具体阶段实现细节
- 各 step 输入/输出强制 schema 化
- 关键中间产物落盘，支持断点恢复

### 阶段 3：接入主链路

- 建议先接 `business-analysis` 的 D1~D6 相关链路，再扩展到 `workflow` 关键步骤

## 与相关文档关系

- 流程与命令：[guides/workflows.md](../guides/workflows.md)
- 数据契约：[guides/data-source.md](../guides/data-source.md)
- 策略插件与 Stage：[strategy-orchestration-architecture.md](../architecture/strategy-orchestration-architecture.md)
- 版本与能力节奏：[strategy-roadmap.md](./strategy-roadmap.md)

本文档说明：**TS 主链与 Claude Code 如何分层、职责边界、可观测与验收关注点**。

## Monorepo 形态

**不建议拆仓**，保持 monorepo：`schema-core`、`provider-*`、`research-runtime` 契约边界已清晰；当前主要缺口在机制沉淀而非仓库形态。

简化建议：

- 继续冻结 `apps/screener-web`，聚焦 CLI 主链路
- Agent 编排在 `research-runtime` 内 `runtime/workflow` 等独立模块
- 文档以 `docs/README.md` 为索引入口，避免多入口漂移
