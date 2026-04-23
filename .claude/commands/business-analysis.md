---
description: PDF-first 独立商业分析（Phase1A + 可选年报 PDF→2A/2B + Phase1B），产出证据包与定性草稿；六维终稿叙事默认在 Claude 会话收口
argument-hint: [--code <股票代码>] [--year YYYY] [--pdf <path> | --report-url <url>] [--strict] [--mode standard|turtle-strict] [--strategy turtle|value_v1]
---

在 **monorepo 根目录**执行（需已 `pnpm install` 且 `pnpm run build`）。

## 入口与执行映射

- **入口（command）**：`/business-analysis`（参数、产物与 CLI 映射）
- **默认执行 skill**：`business-analysis-finalize`（文件：`.claude/skills/business-analysis-finalize/SKILL.md`；**硬约束真源**：[skill-shared-final-narrative-criteria.md](../../docs/guides/skill-shared-final-narrative-criteria.md)、[skill-shared-pdf-gate-semantics.md](../../docs/guides/skill-shared-pdf-gate-semantics.md)）

## 单一路径（必读）

1. **证据管线（TS/CLI）**：可重复、可门禁；产出 **evidence-pack**（`data_pack_*`、`phase1b_qualitative.*` 等）及工程合并的 `qualitative_report.md` / `qualitative_d1_d6.md` 草稿（**cli-evidence-only**，不宣称 AI 六维终稿）。
2. **终稿叙事（Claude，默认步骤）**：在同一会话执行 skill `business-analysis-finalize`（`.claude/skills/business-analysis-finalize/SKILL.md`），基于证据包完成 **final-narrative**，写回 `qualitative_report.md`（终稿）与 `qualitative_d1_d6.md`（填充稿）。
3. **失败语义**：若证据不足或无法负责任生成终稿，**禁止**对用户宣称「已完成终稿」；应列出缺口。纯 CLI/CI 跑通只表示证据链状态，**不等于**终稿完成。

### 与 `/workflow-analysis`（report-polish）的边界

- **本入口**：六维定性终稿写回（上节第 2 步）。
- **`/workflow-analysis`**：规则链 + **report-polish**（`turtle_overview.md` 等）→ `reports-site:emit`；**不**替代本入口的六维终稿。需要站点多页时跑 workflow；需要六维终稿时跑本入口（或两条都跑）。

## 「终稿完成」判定（分级 PDF 门禁）

仅当 skill **终稿硬约束 + 呈现规范 + PDF 语义**全部满足时，方可对用户宣称 **「终稿已写回」** 并使用 **`[终稿状态: 完成]`**。最低限度包括：

- **呈现**：`qualitative_report.md` 与 `qualitative_d1_d6.md` **正文无裸 URL**；均有 **`## 附录：证据索引`**（`[E*]` / `[M:§x]` 映射表）。
- `qualitative_d1_d6.md`：每个 **D1~D6** 证据链条至少 **1 条 `[E*]`** 或 **`[M:§x]`**（映射附录）。
- `qualitative_report.md`：含 **`## 监管与合规要点`**，且小节内主要结论均有 **`[E*]`**（或 `[M:§x]`）。
- 若 Phase1B 存在 **「未搜索到相关信息」**：须含 **`## 证据缺口清单（Phase1B）`**。
- **PDF**：若无 `data_pack_report.md`，或 `gateVerdict` 为 **`CRITICAL`**：须按 skill 写 **`> …` 声明**，且 **不得**标 **`[终稿状态: 完成]`**（须 **阻断**）。若 `gateVerdict` 为 **`DEGRADED`**：仍须 **`> PDF 抽取质量声明`**，但在满足 skill 深度与其它硬约束时 **允许** **`[终稿状态: 完成]`**。

未满足时：使用 [共享规范](../../docs/guides/skill-shared-final-narrative-criteria.md#阻断模板) 中的 **阻断模板**，文件末尾 **`[终稿状态: 阻断]`**，**不得**宣称终稿完成。入口见 `.claude/skills/business-analysis-finalize/SKILL.md` 与 [entrypoint-narrative-contract.md](../../docs/guides/entrypoint-narrative-contract.md)。

## PDF 默认尝试（编排层）

- **默认**：无 `--pdf`/`--report-url` 时仍 **best-effort** 自动发现年报并走 Phase0→2B（需 `FEED_BASE_URL`）；失败则本 run 可能无 `data_pack_report.md`。
- **强制交付级 PDF**：使用 **`--strict`**（或先 `phase0:download` 再传 `--pdf`）。终稿若依赖年报 MD&A，**强烈建议**在收口前确保 `data_pack_report.md` 存在且人工复核抽取质量。

契约全文：[docs/guides/entrypoint-narrative-contract.md](../../docs/guides/entrypoint-narrative-contract.md)。

## Slash → CLI（脚本 / CI）

**优先**：在 Claude Code 用本 Slash，并在编排完成后执行上节第 2 步；CLI 单独运行时仅为 **cli-evidence-only**。

```bash
pnpm run business-analysis:run -- \
  --code <必填，如 600887 或 00700> \
  [--year 2024] \
  [--pdf "./path/to/annual.pdf"] \
  [--report-url "https://..."] \
  [--output-dir "./output/business-analysis/<code>"] \
  [--company-name "可选"] \
  [--phase1b-channel http|mcp] \
  [--mode standard|turtle-strict] \
  [--strategy turtle|value_v1] \
  [--strict]
```

## 输入校验与 PDF 语义

- `--code`：必填。
- **无 `--pdf` / `--report-url`**：编排会在 run 目录下 **best-effort** 调用 Feed 自动发现年报 URL 并 Phase0 下载（需 `FEED_BASE_URL`）；失败时仍继续跑市场包 + Phase1B（无 `data_pack_report.md`）。
- **`--strict`**：自动发现 **必须成功** 并得到可解析 PDF，且须生成 `data_pack_report.md`；否则 fail-fast（前缀 `[strict:business-analysis]`）。同时启用 Phase1A **Pre-flight**（前缀 `[strict:preflight]`）。
- `--mode` / `--strategy`：与 `workflow:run` 对齐，写入 `business_analysis_manifest.json` 的 `input`；当前商业分析主编排仍走 **B→D→C** 数据管线（无 Stage E），便于后续与全链路串接时字段一致。

## 主要产物（`--output-dir` 或默认 `output/business-analysis/<code>/`）

- `qualitative_report.md`（CLI：**Phase1B 合并 / 草稿**；终稿以 Claude 写回为准）
- `qualitative_d1_d6.md`（CLI：**契约骨架 + 摘录**；填充正文以 Claude 写回为准）
- `data_pack_market.md`
- 可选 `data_pack_report.md`（有 PDF 分支时）
- `business_analysis_manifest.json`（含 `pipeline.valuation`、`pipeline.pdfBranch`；`input` 含 **`runId`/`outputDirParent`** 及有值才写入的复跑字段；`suggestedWorkflowFullCommand` 为含 `--run-id` 等参数的可复跑模板）
- 中间件：`phase1a_data_pack.json`、`phase1b_qualitative.{json,md}` 等

## 后续衔接

- 仅估值摘要：`pnpm run valuation:run -- --from-manifest "<输出目录>/business_analysis_manifest.json"`（`/valuation`）。
- 完整估值与终稿报告：manifest 中 `pipeline.valuation.suggestedWorkflowFullCommand`，或直接使用 `/workflow-analysis`（`workflow:run -- --mode turtle-strict`）。
