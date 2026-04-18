---
description: 独立商业分析（Phase 1A/1B + 可选 PDF→2A/2B），产出定性补充与市场/报告数据包
argument-hint: [--code <股票代码>] [--year YYYY] [--pdf <path> | --report-url <url>] [--strict]
---

在 **monorepo 根目录**执行（需已 `pnpm install` 且 `pnpm run build`）。

## 映射 CLI

```bash
pnpm run business-analysis:run -- \
  --code <必填，如 600887 或 00700> \
  [--year 2024] \
  [--pdf "./path/to/annual.pdf"] \
  [--report-url "https://..."] \
  [--output-dir "./output/business-analysis/<code>"] \
  [--company-name "可选"] \
  [--phase1b-channel http|mcp] \
  [--strict]
```

## 输入校验

- `--code`：必填。
- `--strict`：必须同时提供 `--pdf` 或 `--report-url`，且需成功生成 `data_pack_report.md`；否则 fail-fast（报错前缀 `[strict:business-analysis]`）。同时启用 Phase1A **Pre-flight**（前缀 `[strict:preflight]`）：校验行情/财报关键字段与市场包 `§13 Warnings` 结构。
- 无 PDF / 无 URL：非 strict 模式下仍会产出 `data_pack_market.md` 与 `qualitative_report.md`（Phase1B），但不会生成 `data_pack_report.md`。

## 降级与补充

- 无本地 PDF：可提供 `--report-url` 触发 Phase0 下载后再走 2A/2B。
- Phase1B 默认 HTTP feed 检索；可切换 `--phase1b-channel mcp`（需注入 MCP 能力的环境）。

## 主要产物（`--output-dir` 或默认 `output/workflow/<code>/`）

- `qualitative_report.md`（定性补充，含 Phase1B 渲染正文）
- `qualitative_d1_d6.md`（Turtle **D1~D6** 契约骨架；用于承载深度定性结论）
- `data_pack_market.md`
- 可选 `data_pack_report.md`（有 PDF 分支时）
- `business_analysis_manifest.json`（含 `pipeline.valuation`，可接 `/valuation`）
- 中间件：`phase1a_data_pack.json`、`phase1b_qualitative.{json,md}` 等

## 后续衔接

- 仅估值摘要：`pnpm run valuation:run -- --from-manifest "<输出目录>/business_analysis_manifest.json"`（`/valuation`）。
- 完整估值与终稿报告：使用 `/turtle-analysis`（`workflow:run -- --mode turtle-strict`）或标准 `workflow:run`。
