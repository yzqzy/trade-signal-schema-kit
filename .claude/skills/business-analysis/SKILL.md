---
name: business-analysis
description: "独立商业分析入口：先采集市场数据与 Phase1B 外部补充，再可选 PDF→2A/2B；输出 qualitative_report、qualitative_d1_d6（Turtle 六维契约）与 data_pack_*。"
---

# business-analysis 执行规范

## 顺序

1. **Phase 1A**：结构化市场数据 → `data_pack_market.md`。
2. **Phase 1B**：HTTP/MCP 检索补充 → 写入 `qualitative_report.md`（含 §7/§8/§10 渲染）。
3. **可选 PDF 分支**：`--pdf` 或 `--report-url`（Phase0 下载）→ Phase2A/2B → `data_pack_report.md`。

## 降级与告警

- 无 PDF：不生成 `data_pack_report.md`；Phase1B 仅为**预研级**线索；D5（MD&A）**交付级**须有 `data_pack_report.md`（见 `phase3_preflight.md`「PDF 与交付语义（MVP）」规则 A/B；`qualitative_d1_d6.md` 的 D5 会提示待补充 PDF 解析）。
- `--strict`：禁止「无报告包」静默成功；缺少 PDF 输入或 2B 失败则 **fail-fast**（规则 C；前缀 `[strict:business-analysis]`）。

## 输出标准

- `qualitative_report.md`：含元信息头 + Phase1B 正文。
- `qualitative_d1_d6.md`：Turtle PDF-first **D1~D6** 结构化契约稿（工程骨架 + Phase1B 摘录；深度叙事由 **Claude Code** `/business-analysis` 补全）。
- `phase1b_evidence_quality.json`：§7/§8 证据结构离线指标（唯一标题占比、跨条目 URL 重复、主题命中率等），便于对比两次 run。
- `business_analysis_manifest.json`：记录输入与产物路径；含 `pipeline.valuation` 供 `valuation:run --from-manifest` 串接。

## CLI / 命令映射

- Claude：`/business-analysis`
- 工程：`pnpm run business-analysis:run -- ...`
