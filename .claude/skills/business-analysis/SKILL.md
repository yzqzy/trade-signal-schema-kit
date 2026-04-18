---
name: business-analysis
description: "PDF-first 独立商业分析：年报自动发现/下载（best-effort 或 strict）→ Phase1A →（有 PDF 时）2A/2B → Phase1B；输出 qualitative_report、qualitative_d1_d6 与 data_pack_*。"
---

# business-analysis 执行规范

## 顺序（与实现一致）

1. **Stage A / PDF**：无 `--pdf`/`--report-url` 时，在 run 目录下按 Feed **自动发现**年报 URL 并 Phase0 下载（**非 `--strict`** 为 best-effort；**`--strict`** 为强制，失败 fail-fast）。与 `workflow --mode turtle-strict` 共用 `ensureAnnualPdfOnDisk` 语义。
2. **Phase 1A**：结构化市场数据 → `data_pack_market.md`。
3. **Phase 2A/2B（有本地 PDF 时）**：精提取 → `data_pack_report.md`。
4. **Phase 1B**：HTTP/MCP 检索补充 → 合并写入 `qualitative_report.md`（§7/§8/§10）与 `qualitative_d1_d6.md`（含可选 `data_pack_report` 摘录）。

## 降级与告警

- 无可用 PDF：不生成 `data_pack_report.md`；Phase1B 仍为事实补充；D5 **交付级**须有报告包（见 `phase3_preflight.md` 规则 A/B；`qualitative_d1_d6.md` 的 D5 会提示缺口）。
- **`--strict`**：禁止「无报告包」静默成功；自动发现失败、缺少可解析 PDF 或 2B 未产出则 **fail-fast**（规则 C；前缀 `[strict:business-analysis]`），并启用 Phase1A Pre-flight（`[strict:preflight]`）。

## 输出标准

- `qualitative_report.md`：PDF-first 元信息头 + Phase1B 正文。
- `qualitative_d1_d6.md`：Turtle **D1~D6** 契约稿（工程骨架 + Phase1B 摘录 + 可选报告包摘录）。
- `phase1b_evidence_quality.json`：§7/§8 证据结构离线指标。
- `business_analysis_manifest.json`：`input.mode` / `input.strategy`、`input.runId` / `input.outputDirParent`、按需写入的 `from`/`to`/`category` 等复跑字段、`pipeline.pdfBranch`、`pipeline.valuation`；`suggestedTurtleWorkflowCommand` 含 `--run-id` 等与当次 run 对齐的参数。供 `valuation:run --from-manifest`（未传 `--code` 时用 `outputLayout.code` 分区）与全链路衔接。

## 入口映射

- **Claude Code**：`/business-analysis`（推荐）
- **CLI**：`pnpm run business-analysis:run -- ...`（支持 `--strict`、`--mode`、`--strategy`；CI、无 IDE）
