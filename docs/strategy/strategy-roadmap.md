# 路线图（策略与版本节奏）

[返回项目首页](../../README.md) · [文档索引](../README.md)

本页描述**版本能力节奏**与主链路里程碑；**Turtle** 仅为当前默认策略示例，不独占路线图语义。通用流程以 **Stage A~E** 为准，详见 [策略与流程解耦](../architecture/strategy-orchestration-architecture.md) 与 [流程说明](../guides/workflows.md)。

详细执行状态与内部待办以 `.cursor/plans/roadmap.plan.md` 为准（路径相对仓库根；若本地未同步 `.cursor`，以你环境中的计划文件为准）。

## v0.1（流程复刻）

- 打通主流程：Phase 0（独立 CLI 支持 Feed 自动发现 PDF + workflow 内 `--report-url`）、Phase 1A/1B/2A/2B/3（独立 CLI）及 **`workflow:run` 串行编排**（当前实现顺序见 [workflows](../guides/workflows.md)）
- **独立 `business-analysis`**：Claude `/business-analysis`；CLI `pnpm run business-analysis:run`（定性 + 数据包，默认不跑完整 Phase3）
- **`turtle-strict`**：Claude `/workflow-analysis`；CLI `--mode turtle-strict`（PDF/报告包前置校验 + fail-fast）
- **质量回归**：`cn_a` + `hk` 双套件 golden（`quality:regression` / `quality:phase3-golden` 默认 `--suite all`）
- **独立估值**：`/valuation`；CLI `pnpm run valuation:run`，可与 `business-analysis` manifest 串接
- **研报站 Markdown**：`reports-site:emit` → `sync:reports-to-app`（`content.md` v2，见 [reports-site-publish](../guides/reports-site-publish.md)）
- 输出：`run:phase3`（包内）与 `workflow:run`（根目录编排）均在指定目录产出 `analysis_report.md`（文件名固定）
- **A 股优先**；**港股**：基础数据与 `hk` 黄金样例已具备，与 A 股同等深度 **暂未实现**

## v0.2（计划中）

- Phase 1A 数据包对齐（§1~§17 语义与标准字段映射）
- Phase 2A/2B 章节处理对齐（定位 + 精提取）
- 估值与筛选输入字段对齐（可计算、可回归）
- 增量回归：同一标的在新旧链路输出结构可比

## v0.3（计划中）

- 数据源替换稳定化：仅通过 feed 输出标准字段，不暴露上游实现细节
- 港股缺口补齐：分钟线、交易日历、企业行动/复权因子等
- 回归与稳定性：覆盖关键流程、字段与报告段落

## 策略插件化（跨版本）

- 编排层显式 **Stage** 与 **`StrategyPlugin`**，支持 Turtle 之外策略接入；详见 [策略与流程解耦](../architecture/strategy-orchestration-architecture.md)。
- Agent 侧：**TS workflow 主链 + Claude Code 定性**，见 [Agent 编排与 TS 主链](./agent-framework-comparison.md)。
