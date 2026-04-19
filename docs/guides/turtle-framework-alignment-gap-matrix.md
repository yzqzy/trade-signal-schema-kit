# Turtle 参考工程 ↔ 本仓库「全量功能对齐」差距矩阵（可审计基线）

> **范围**：对照 `references/projects/Turtle_investment_framework`（Python + Jinja 模板 + 交互脚本）与本 monorepo 的 **TS 编排 + CLI + Feed-first 契约**。  
> **数据策略**：默认 **仅 Feed**；缺字段/序列须显式写入「数据缺口与补齐建议」，不静默外采填平。  
> **范围外（本轮）**：`apps/screener-web` 冻结，不纳入改造；见下文「选股器」行说明。

| 能力域 | 参考（Turtle_investment_framework） | 本仓库现状 | 差距状态 | 验收/门禁 |
|--------|--------------------------------------|------------|----------|-----------|
| 端到端 workflow（行情→PDF→证据→Phase3） | 脚本链 + 多阶段产物 | `workflow:run`、`executeWorkflowDataPipeline`、checkpoint | **已具备**（架构不同） | `quality:regression`、`quality:phase3-golden` |
| Phase3 严格估值与报告 | 因子/门槛逻辑 | `runPhase3Strict`、`renderPhase3Markdown/Html` | **已具备** | 同上 |
| PDF-first 商业分析 | qualitative v2 + 证据 | `business-analysis:run`、`d1-d6-scaffold`、`phase1b` | **部分**：工程骨架+证据；终稿在 Claude 会话 | `business-analysis --strict`、文档契约 |
| 发布级结构化参数（output_schema 键） | `output_schema.md` 风格键表 | `qualitative_d1_d6.md` 增加 **发布级结构化参数骨架**（键名对齐） | **本轮补齐** | 键名 grep / 人工审 schema |
| 发布级 HTML（KPI/Verdict/参数面板） | `dashboard.html` + `report_to_html.py` | `report-to-html`：`semantic`（Phase3）+ **`dashboard`（定性发布模板）** | **本轮补齐** | 快照/烟测 `renderQualitativeDashboardHtml` |
| Feed 缺口契约（分级+模板+命令建议） | 部分隐含在脚本 | `feed-gap-contract.ts` + 固定小节 **`## 数据缺口与补齐建议`** | **本轮补齐** | 跑 `business-analysis` / `workflow` 后人工检视小节 |
| 同业对标 / 周期定位数据层 | 外采/宽表 | **无静默补采**；由缺口规则提示「需 feed 扩展」 | **Feed-first**：仅缺口与指引 | 报告内小节 + 契约测试 |
| Screener Tier1/2 + 导出 | `screener_core.py` 等 | `packages/research-strategies/src/screener/*`、`screener-parity.md` | **已对齐 CLI/契约**（见 parity 文档） | `pnpm run test:screener` |
| Screener Web UI | 参考若有 Web | `apps/screener-web` | **冻结 / 待独立规划** | 不阻断本轮 |
| Notebook / 交互 | Jupyter 等 | CLI + Markdown/HTML + Claude 会话收口叙事 | **策略替代**（非逐行复刻） | E2E checklist |
| 质量门禁 | pytest 等 | `quality:conformance|contract|regression|phase3-golden` | **已具备** | `pnpm run quality:all` |

## 输入 / 输出对照（摘要）

| 类型 | 参考 | 本仓库 |
|------|------|--------|
| 市场包 | 多表合并 | `data_pack_market.md`（`build-market-pack`） |
| 年报解析 | PDF 管线 | Phase2A/2B → `data_pack_report.md` |
| 定性终稿 | LLM + 模板 | `qualitative_report.md` / `qualitative_d1_d6.md`（会话写回） |
| 估值 JSON | 结构化输出 | `valuation_computed.json` |
| HTML | Jinja dashboard | `analysis_report.html`（Phase3）/ `dashboard` 模式（定性） |

## 里程碑映射（与实施计划一致）

| 里程碑 | 交付物 | 本矩阵对应行 |
|--------|--------|----------------|
| M1 | 差距矩阵 + Feed 缺口契约 + 发布稿 schema 骨架 | 本文 + `feed-gap-contract` + 结构化参数表 |
| M2 | 发布级 HTML（dashboard 模式） | 上表「发布级 HTML」 |
| M3 | 同业/周期：仅缺口层 | 「同业对标 / 周期定位」 |
| M4 | Screener CLI/导出/文档 | 「Screener」两行 |
| M5 | quality 全绿 | `pnpm run quality:all`；清单见 [stock-analysis-e2e-checklist.md](./stock-analysis-e2e-checklist.md) |

## 维护说明

- 参考树路径以仓库内 `references/projects/Turtle_investment_framework/` 为准（若未 vendor，以本地 clone 为准）。  
- 本文件为**验收唯一依据之一**；代码变更若影响能力边界，应同步更新本表「差距状态」列。
