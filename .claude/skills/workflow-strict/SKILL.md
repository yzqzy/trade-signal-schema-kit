---
name: workflow-strict
description: "`workflow:run --mode turtle-strict`：TS 严格链 + Phase3 + report-polish；六维终稿不在本入口。详见 docs/guides。"
---

## Purpose

规范 **`/workflow-analysis`**（`pnpm run workflow:run -- --mode turtle-strict`）的严格执行、**report-polish 产物验收**与可选站点发布步骤；**不**承担六维定性终稿写回。

## Scope / Boundary

- **包含**：PDF 链（或 URL）、Pre-flight、`data_pack_report` 在 strict 下的 fail-fast、Phase3、`report-polish` 四页 + `report_view_model.json`。
- **不包含**：`qualitative_report.md` / `qualitative_d1_d6.md` 的 **final-narrative** 写回（见 **`/business-analysis` + `business-analysis-finalize`**）。
- **发布**：多页稿以 report-polish 为准 → `reports-site:emit` → `sync:reports-to-app`（见 [report-polish-narrative-contract.md](../../../docs/guides/report-polish-narrative-contract.md)）。

## Execution Checklist

1. **initPrep**：无 `--pdf`/`--report-url` 时按 Feed 自动发现（`turtle-strict` 下失败即抛错）。
2. **turtle-strict**：Phase1A 后 Pre-flight（`[strict:preflight]`）；缺 `data_pack_report.md` 进 Phase3 → **fail-fast**（`[strict:workflow:strict]`）。
3. **CLI 成功后验收 report-polish**：run 目录须存在且非空：
   - `report_view_model.json`
   - `turtle_overview.md`、`business_quality.md`、`penetration_return.md`、`valuation.md`
   - `workflow_manifest.json` 的 `outputs` 含上述路径字段
4. 若用户需要进站点：提示 `pnpm run reports-site:emit -- --run-dir <run>` → `pnpm run sync:reports-to-app`。
5. 若缺失 polish 文件：提示 `pnpm run build` 后重跑 workflow；**不要求**用会话「六维终稿」替代 report-polish。

## Pass / Block Criteria

| 结果 | 条件 |
|------|------|
| **编排通过** | CLI 退出成功且上节 report-polish 文件齐全 |
| **阻断** | strict 下缺年报包 / Pre-flight 失败 / Phase3 抛错（见 CLI 前缀） |

## References

- [Skill 统一模板](../../../docs/guides/skill-shared-skill-template.md)
- [入口与叙事契约](../../../docs/guides/entrypoint-narrative-contract.md)
- [report-polish 证据边界](../../../docs/guides/report-polish-narrative-contract.md)
- Slash：[`.claude/commands/workflow-analysis.md`](../../commands/workflow-analysis.md)

## 关键差异（`standard` vs `turtle-strict`）

| 项 | standard | turtle-strict |
|----|----------|---------------|
| 自动发现年报 | 否（除非显式 URL / 其他入口） | 是（无 PDF/URL 时） |
| Phase1A Pre-flight 默认 | off | strict |
| 缺 `data_pack_report` 进 Phase3 | 可能继续 | 禁止 |

## Phase1B · WebSearch（可选）

- 配置了 `WEB_SEARCH_API_KEY` 时，Phase1B 对 **`违规/处罚记录` / `行业监管动态` / `回购计划`** 优先联网搜索；无命中再回退 Feed（不静默补数）。
- Smoke：`pnpm run build` 后 `pnpm --filter @trade-signal/research-strategies run run:websearch-smoke -- --query "…" --limit 3`
- 六维终稿写回仍遵守 **`business-analysis-finalize`**（见该 skill 与共享终稿规范）。

## 质量门禁（可选）

- `pnpm run test:linkage`
- `pnpm run quality:all`
