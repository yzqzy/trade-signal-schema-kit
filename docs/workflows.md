# 流程说明（Phase 0~3）

[返回 README](../README.md) · [文档索引](./README.md)

## 策略主流程

```text
用户输入 (股票代码 + 年报PDF)
         │
    ┌────▼────┐
    │ Phase 0 │  年报获取与缓存
    └────┬────┘
         │
    ┌────▼──────────────┬───────────────────┐
    │ Phase 1A          │ Phase 2A          │
    │ 标准字段数据采集    │ PDF 预处理         │
    └────┬──────────────┴──────────┬────────┘
         │                         │
    ┌────▼────┐               ┌────▼────┐
    │ Phase 1B │               │ Phase 2B │
    │ 外部补充信息 │             │ PDF 精提取 │
    └────┬────┘               └────┬────┘
         │                         │
         └──────────┬──────────────┘
                    │
            ┌───────▼────────┐
            │   Phase 3      │
            │ 定性 + 定量 + 估值 │
            └───────┬────────┘
                    │
      output/{code}_analysis_report.md + .html
```

## 独立商业分析流程

```text
/business-analysis {code}
         │
    ┌────▼────────────────┐
    │ 年报 PDF 获取/缓存    │
    └────┬────────────────┘
         │
    ┌────▼────────────────┐
    │ 标准字段数据采集      │
    └────┬────────────────┘
         │
    ┌────▼────────────────┐
    │ 单 Agent 定性分析     │
    └────┬────────────────┘
         │
    report.md + report.html
```

## 阶段职责

- Phase 0：年报下载、缓存、版本命名（详见 [Phase 0 年报下载器](./phase0-download.md)）
- Phase 1A：通过 `MarketDataProvider` 采集结构化数据
- Phase 1B：补充外部非结构化信息
- Phase 2A：PDF 章节定位与切分
- Phase 2B：附注与关键段落精提取
- Phase 3：定性分析 + 定量分析 + 估值 + 报告渲染

## 关键中间产物契约（v0.1）

### `data_pack_market`（Phase 1A 输出）

- 用途：提供 Phase 3 定量与估值的基础输入
- 最小字段集合：`instrument`、`quote`、`klines`、`financialSnapshot`
- 要求：仅使用标准字段命名，不出现供应商原始字段

### `pdf_sections`（Phase 2A 输出）

- 用途：作为 Phase 2B 的章节索引输入
- 最小结构：
  - `metadata`（`pdf_file`、`total_pages`、`extract_time`、`sections_found`、`sections_total`）
  - 章节键：`P2`、`P3`、`P4`、`P6`、`P13`、`MDA`、`SUB`

### `qualitative_report`（Phase 1B/2B 输出）

- 用途：为 Phase 3 的定性与估值假设提供依据
- 最小内容：结论、证据引用、参数化因子表

### `valuation_computed`（Phase 3 中间产物）

- 用途：承载确定性估值方法结果，供报告层渲染
- 最小内容：方法结果（DCF/DDM/PE Band/PEG/PS）、关键假设、敏感性说明

### `analysis_report`（Phase 3 最终输出）

- 输出格式：`Markdown + HTML`
- 元信息要求：`schema_version`、`data_source`、`generated_at`、`capability_flags`
