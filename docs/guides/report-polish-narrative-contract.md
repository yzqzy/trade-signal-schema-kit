# Report Polish（Markdown-first）叙事与证据契约

本仓库在 **Phase3（`stageE`）之后** 增加 **`reportPolish`** 阶段：生成 `report_view_model.json` 与四份 Markdown（`turtle_overview.md`、`business_quality.md`、`penetration_return.md`、`valuation.md`）。其中总览、穿透、估值供 `reports-site:emit` 作为确定性 Topic 正文来源；`business_quality.md` 是 workflow 证据组织预览，完整商业质量页以 `business-analysis-finalize` 通过门禁后的 `topic:business-six-dimension` 为准。

## 角色与默认行为

| 角色 | 职责 |
|:-----|:-----|
| **结构化填充** | 从 `phase1a_data_pack.json`、`data_pack_market.md`、`phase1b_qualitative.md`、`data_pack_report.md`（若存在）、`valuation_computed.json`、`analysis_report.md` 与 Phase3 内存结果组装 `report_view_model.json`，并写入各页固定章节骨架。 |
| **叙事优化（默认同轮）** | 在不新增事实的前提下，调整段落顺序（结论先行）、衔接句与标题可读性；**所有数值与判定须可回溯**到上述证据文件。 |

## 硬约束（质量门禁）

1. **不得超证据扩写**：禁止引入证据文件中不存在的财务数字、监管结论、行业排名等。
2. **缺口显式化**：无法从当前 run 解析或缺失的文件，写入 `report_view_model.todos[]` 与对应 Markdown 的 `TODO` 段落，**禁止静默造数**。
3. **引用边界**：workflow 的商业质量 Markdown 以 `phase1b_qualitative.md` + Phase3「因子1B」为主；**不等价**于 `business-analysis:run` 产出的 `qualitative_report.md` 六维成稿，发布层不得把 workflow 降级页作为完整商业质量 Topic 展示。
4. **估值页**：估值表体由 `valuation_computed.json` **机械渲染**（`renderValuationComputedMarkdownFromJson`），叙事层不得覆盖 JSON 中未出现的假设参数。

## 可选开关（未来扩展）

CLI / 输入级开关可扩展为 `reportPolishNarrative: "off" | "on"`（默认 `on`）。`off` 时仅输出骨架与表格填充，省略衔接性段落；**证据表与 TODO 行为不变**。

## 验收对齐

- 同一次 `workflow:run` 在输出目录稳定生成 **4 份 Markdown + `report_view_model.json`**。
- `reports-site:emit --run-dir …` 在 workflow manifest 含 polish 路径时，采用 polish 的总览、穿透、估值作为专题正文来源；商业质量只写降级 manifest，等待 business-analysis complete 版本发布。
- 同一自然日 + 股票代码 + Topic 去重按 `complete > degraded > missing` 优先；business-analysis complete 商业质量页覆盖 workflow 降级入口。
