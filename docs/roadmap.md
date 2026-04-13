# 路线图

[返回 README](../README.md) · [文档索引](./README.md)

本路线图按“先复刻流程，再替换数据实现”的原则执行，优先对齐现有可运行链路，不扩散新规划。

## v0.1（流程复刻）

- 复刻并打通主流程能力：Phase 0（独立 CLI 支持 Feed 自动发现 PDF + workflow 内 `--report-url`）、Phase 1A/1B/2A/2B/3（独立 CLI）及 **`workflow:run` 串行编排**（默认顺序 1A→1B→可选 2A/2B→3）
- **独立流程 `business-analysis`**：已实现 CLI `pnpm run business-analysis:run` 与 Claude `/business-analysis`（定性 + 数据包，默认不跑 Phase3）
- **workflow `turtle-strict` 模式**：已实现 `--mode turtle-strict`（PDF/报告包前置校验 + fail-fast），Claude `/turtle-analysis`
- **质量回归**：`cn_a` + `hk` 双套件 golden（`quality:regression` / `quality:phase3-golden` 默认 `--suite all`）
- **独立估值入口**：`pnpm run valuation:run`（`/valuation`），可与 `business-analysis` manifest 串接
- **Markdown 转 HTML**：`pnpm run report-to-html:run`（`/report-to-html`）
- 输出：独立 `phase3:run` 与编排均在指定目录下产出 `analysis_report.md` / `analysis_report.html`（文件名固定；可用输出目录区分标的）
- **A 股优先**：主流程与契约以 A 股为第一目标
- **港股**：基础数据与 `hk` 黄金样例已具备；与 A 股同等级别的深度流程 **暂未实现**，列入后续里程碑

## v0.2（计划中）

- Phase 1A 数据包对齐（按原链路 §1~§17 语义映射到标准字段）
- Phase 2A/2B 章节处理对齐（章节定位 + 精提取）
- 估值输入与筛选输入字段对齐（满足原流程可计算）
- 增量回归：同一标的在新旧链路输出结构可比

## v0.3（计划中）

- 数据源替换稳定化：仅通过 `feed` 输出标准字段，不暴露上游实现细节
- 港股缺口补齐：分钟线、交易日历、企业行动/复权因子
- 回归与稳定性提升：覆盖关键流程、关键字段、关键报告段落
