---
name: turtle-strict
description: "workflow turtle-strict 模式：全流程编排，关键输入与 data_pack_report 缺失时 fail-fast；用于与严格协调器语义对齐。"
---

# turtle-strict 执行规范

## 适用场景

- 需要 **端到端** 估值与 `analysis_report`（Phase3），且要求 **PDF 报告包** 完整可用。

## 顺序

1. 同标准 `workflow:run`：**1A → 1B →（PDF 分支）2A/2B → 3**。
2. 在 **turtle-strict** 下：
   - 运行前校验：`--pdf` 或 `--report-url` 至少其一。
   - 运行后校验：必须存在 `data_pack_report.md`（即 `reportPackMarkdown` 已生成）。

## 与 standard 的差异

| 项 | standard | turtle-strict |
|----|----------|---------------|
| 无 PDF | 可继续 Phase3（报告包为空） | 启动即失败 |
| PDF 无效/2B 失败 | 可能无 report 包仍跑 Phase3 | 管线后失败 |

## 输出标准

- 与 `workflow:run` 相同：`valuation_computed.json`、`analysis_report.md/html`、`workflow_manifest.json`。

## CLI / 命令映射

- Claude：`/turtle-analysis`（推荐带 `--mode turtle-strict`）
- 工程：`pnpm run workflow:run -- --mode turtle-strict ...`
