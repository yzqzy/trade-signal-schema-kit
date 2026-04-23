---
name: business-analysis-finalize
description: "PDF-first：TS 跑证据链；默认在同一会话用 Claude 完成六维终稿写回（qualitative_report / qualitative_d1_d6）。细则见 docs/guides/skill-shared-*.md。"
---

## Purpose

在 **`/business-analysis`** 编排成功后，于 **Claude 会话**内执行 **final-narrative**：写回 **`qualitative_report.md`**（六维叙事终稿）与 **`qualitative_d1_d6.md`**（各维实质正文），并满足可审计硬约束。

## Scope / Boundary

- **TS/CLI**：仅 **evidence-pack** 与确定性合并（**cli-evidence-only**），不调模型厂商 HTTP/SDK 做自动叙事。
- **本 skill（Claude）**：**默认**执行终稿写回；不定义 Slash 参数（见 command）。
- **不做**：改写 **`/workflow-analysis`** 的 **report-polish** 四页、`analysis_report.md` 或研报站 `content.md`；站点多页发布走 `reports-site:emit`。

## Execution Checklist

1. 确认 run 目录存在 `data_pack_market.md`、`phase1b_qualitative.md`（及 json）；若有 PDF 链则打开 `data_pack_report.md`，按 [PDF 门禁语义](../../../docs/guides/skill-shared-pdf-gate-semantics.md) 核对 `gateVerdict` 与声明义务。
2. 通读证据包与 Phase1B 结构，按 [终稿硬约束](../../../docs/guides/skill-shared-final-narrative-criteria.md) 写回两份终稿（正文 `[E*]`/`[M:§x]`、附录证据索引、监管与合规小节等）。
3. 若证据不足或门禁阻断：使用 [阻断模板](../../../docs/guides/skill-shared-final-narrative-criteria.md#阻断模板)，文件末尾 **`[终稿状态: 阻断]`**，对话中说明原因；**不得**宣称终稿已完成。
4. 全部满足硬约束与 PDF 语义时：文件末尾 **`[终稿状态: 完成]`**。

## Pass / Block Criteria

| 状态 | 条件（摘要） |
|------|----------------|
| **通过** | 满足 [终稿完成判定](../../../docs/guides/skill-shared-final-narrative-criteria.md#5-终稿完成判定) 与 [PDF 语义](../../../docs/guides/skill-shared-pdf-gate-semantics.md) 允许标「完成」的情形 |
| **阻断** | 任一硬约束未满足，或无 `data_pack_report` / `CRITICAL` 未按语义声明，或 DEGRADED 未写 PDF 质量声明等（全文见共享规范） |

## References

- [Skill 统一模板](../../../docs/guides/skill-shared-skill-template.md)
- [六维终稿硬约束与模板](../../../docs/guides/skill-shared-final-narrative-criteria.md)
- [PDF 门禁与终稿完成态](../../../docs/guides/skill-shared-pdf-gate-semantics.md)
- [入口与叙事契约](../../../docs/guides/entrypoint-narrative-contract.md)
- Slash：[`.claude/commands/business-analysis.md`](../../commands/business-analysis.md)

## 入口映射

- **Claude Code**：`/business-analysis`（推荐）
- **CLI**：`pnpm run business-analysis:run -- ...`（`--strict` / `--mode` / `--strategy` 等见 command）
