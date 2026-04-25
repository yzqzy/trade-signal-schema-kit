---
description: 全流程研究编排（严格 PDF 链 + Phase3 + report-polish 多页 Markdown）；发布走研报站 emit；六维定性终稿请用 /business-analysis
argument-hint: [--code] [--mode standard|turtle-strict] [--pdf|--report-url] [--run-id] [--strategy turtle|value_v1]
---

在 **monorepo 根目录**执行。

## 入口与执行映射

- **入口（command）**：`/workflow-analysis`
- **默认执行 skill**：`workflow-strict`（文件：`.claude/skills/workflow-strict/SKILL.md`）

## 与「终稿 / 发布」的关系

- **CLI / TS 主链**：确定性阶段、估值、`analysis_report.md`（规则审计）与 **report-polish**（`report_view_model.json` + 四页 Markdown）。**cli-evidence-only**：TS 不调模型厂商叙事 API。
- **发布进站点**：对本次 run 执行 `pnpm run reports-site:emit -- --run-dir <run 根目录>`，再 `pnpm run sync:reports-to-app`；emit 使用 polish 三个确定性 Topic（总览、穿透、估值），商业质量只写 manifest 降级状态，不发布为完整页（见 [reports-site-publish.md](../../docs/guides/reports-site-publish.md)）。
- **六维定性终稿**：不属于 workflow TS 主链；若需要完整商业质量页，必须继续跑 **`/business-analysis`** 并在会话内执行 **`business-analysis-finalize`**，写回 `qualitative_report.md` / `qualitative_d1_d6.md`。发布层会用该 complete 终稿覆盖同日同股同 Topic 的 workflow 降级入口。

契约：[docs/guides/entrypoint-narrative-contract.md](../../docs/guides/entrypoint-narrative-contract.md) · [report-polish-narrative-contract.md](../../docs/guides/report-polish-narrative-contract.md)

## Slash → CLI（脚本 / CI，严格主链）

```bash
pnpm run workflow:run -- \
  --code <必填> \
  --mode turtle-strict \
  [--year 2024] \
  [--pdf "./path/to/annual.pdf"] \
  [--report-url "https://..."] \
  [--output-dir "./output/workflow/<code>"] \
  [--run-id "<与 manifest 对齐的 runId>"] \
  [--phase1b-channel http] \
  [--strategy turtle|value_v1] \
  [--preflight strict|off]
```

续跑（`--resume-from-stage`）时 **`--run-id` 无效**，以 checkpoint 的 `runId`/`threadId` 为准。

## 标准模式（兼容旧行为）

```bash
pnpm run workflow:run -- --code 600887 --year 2024
```

无 PDF 时 Phase3 仍可能运行（`data_pack_report` 为空输入），与 `turtle-strict` 不同。

## `--mode turtle-strict` 行为

- 启动前：优先使用显式 `--pdf` 或 `--report-url`；若两者均缺失，将尝试基于 `--code`+`--year` 通过 Feed `/stock/report/search` 自动发现年报 PDF（需 `FEED_BASE_URL`）。
- Phase1A 后：**Pre-flight** 默认开启（亦可用 `--preflight strict|off` 覆盖）；失败前缀 `[strict:preflight]`。
- 管线结束后：必须已成功生成 `data_pack_report.md`，否则 fail-fast 并提示检查 PDF/下载/2A/2B。
- CLI 报错前缀统一为 **`[strict:workflow:strict]`**（与 Slash `/workflow-analysis` 对齐，便于检索）。

## 产物

- `valuation_computed.json`
- `analysis_report.md`
- `workflow_manifest.json`
- **report-polish**：`report_view_model.json`、`turtle_overview.md`、`business_quality.md`、`penetration_return.md`、`valuation.md`
- 以及 Phase1A/1B/2A/2B 中间产物（同 [workflows.md](../../docs/guides/workflows.md)）。

## 发布后（可选）

```bash
pnpm run reports-site:emit -- --run-dir "./output/workflow/<code>/<runId>"
pnpm run sync:reports-to-app
```

若用户要求“完整四 Topic 入站点”，在 workflow 发布后继续执行：

```bash
pnpm run business-analysis:run -- --code <code> --strict
# 在会话内执行 business-analysis-finalize，确认 business_analysis_manifest.json finalNarrativeStatus=complete
pnpm run reports-site:emit -- --run-dir "./output/business-analysis/<code>/<runId>"
pnpm run sync:reports-to-app
```

## 相关 skill

执行顺序与检查清单见 `.claude/skills/workflow-strict/SKILL.md`。
