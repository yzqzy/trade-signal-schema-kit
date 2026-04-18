---
description: 独立估值（Phase3 估值引擎）：输入市场包与可选报告包，输出 valuation_computed.json 与 valuation_summary.md
argument-hint: [--market-md] [--report-md] [--from-manifest]
---

在 **monorepo 根目录**执行（需已 `pnpm run build`）。

## Slash → CLI（脚本 / CI）

```bash
pnpm run valuation:run -- \
  --market-md "./output/workflow/600887/data_pack_market.md" \
  [--report-md "./output/workflow/600887/data_pack_report.md"] \
  [--output-dir "./output/workflow/600887"] \
  [--full-report]
```

自 `business-analysis` manifest 解析路径（推荐）：

```bash
pnpm run valuation:run -- \
  --from-manifest "/绝对或相对路径/business_analysis_manifest.json"
```

## 产物

- `valuation_computed.json`
- `valuation_summary.md`
- 可选 `--full-report`：同目录追加 `analysis_report.md` + `analysis_report.html`（与 `phase3:run` 同构）

## 与 business-analysis 衔接

`business-analysis` 生成的 `business_analysis_manifest.json` 内含 `pipeline.valuation.relativePaths` 与建议命令。

## Slash 对应

`/valuation` → 本 CLI。
