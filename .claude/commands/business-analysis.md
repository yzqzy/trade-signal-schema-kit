---
description: PDF-first 独立商业分析（Phase1A + 可选年报 PDF→2A/2B + Phase1B），产出定性稿、D1~D6 契约与 manifest
argument-hint: [--code <股票代码>] [--year YYYY] [--pdf <path> | --report-url <url>] [--strict] [--mode standard|turtle-strict] [--strategy turtle|value_v1]
---

在 **monorepo 根目录**执行（需已 `pnpm install` 且 `pnpm run build`）。

## Slash → CLI（脚本 / CI）

**优先**：在 Claude Code 用本 Slash；CLI 为等价自动化入口。

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

- `qualitative_report.md`（PDF-first 定性主文 + Phase1B 渲染）
- `qualitative_d1_d6.md`（Turtle **D1~D6** 契约稿；含可选 `data_pack_report` 摘录）
- `data_pack_market.md`
- 可选 `data_pack_report.md`（有 PDF 分支时）
- `business_analysis_manifest.json`（含 `pipeline.valuation`、`pipeline.pdfBranch`；`input` 含 **`runId`/`outputDirParent`** 及有值才写入的复跑字段；`suggestedTurtleWorkflowCommand` 为含 `--run-id` 等参数的可复跑模板）
- 中间件：`phase1a_data_pack.json`、`phase1b_qualitative.{json,md}` 等

## 后续衔接

- 仅估值摘要：`pnpm run valuation:run -- --from-manifest "<输出目录>/business_analysis_manifest.json"`（`/valuation`）。
- 完整估值与终稿报告：manifest 中 `pipeline.valuation.suggestedTurtleWorkflowCommand`，或直接使用 `/turtle-analysis`（`workflow:run -- --mode turtle-strict`）。
