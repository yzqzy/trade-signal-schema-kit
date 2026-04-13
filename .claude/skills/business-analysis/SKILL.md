---
name: business-analysis
description: "独立商业分析入口：先采集市场数据与 Phase1B 外部补充，再可选 PDF→2A/2B；输出 qualitative_report 与 data_pack_*。"
---

# business-analysis 执行规范

## 顺序

1. **Phase 1A**：结构化市场数据 → `data_pack_market.md`。
2. **Phase 1B**：HTTP/MCP 检索补充 → 写入 `qualitative_report.md`（含 §7/§8/§10 渲染）。
3. **可选 PDF 分支**：`--pdf` 或 `--report-url`（Phase0 下载）→ Phase2A/2B → `data_pack_report.md`。

## 降级与告警

- 无 PDF：不生成 `data_pack_report.md`；在报告中说明依赖 Web/搜索补充已由 Phase1B 部分覆盖。
- `--strict`：禁止上述「无报告包」静默成功；缺少 PDF 输入或 2B 失败则 **fail-fast**。

## 输出标准

- `qualitative_report.md`：含元信息头 + Phase1B 正文。
- `business_analysis_manifest.json`：记录输入与产物路径，便于 CI/人工复核。

## CLI / 命令映射

- Claude：`/business-analysis`
- 工程：`pnpm run business-analysis:run -- ...`
