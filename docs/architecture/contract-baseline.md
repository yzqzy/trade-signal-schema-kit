# 原语义契约基线（M0）

[返回文档索引](../README.md)

本文件冻结 **当前实现** 下用户可见的语义边界，作为后续重构（M1+）的验收对照。真源仍以 [流程与 CLI](../guides/workflows.md)、[数据源与质量](../guides/data-source.md) 及源码为准；若三者冲突，以 **本文件 + 源码行为** 为仲裁。

## 1. 文档与代码真源

| 主题 | 路径 |
|------|------|
| Stage / Phase、CLI、产物列表 | [docs/guides/workflows.md](../guides/workflows.md) |
| Feed、字段、质量门禁 | [docs/guides/data-source.md](../guides/data-source.md) |
| 策略插件与 Stage 抽象 | [strategy-orchestration-architecture.md](./strategy-orchestration-architecture.md) |
| Workflow 编排实现 | `packages/research-strategies/src/workflow/orchestrator.ts`（薄入口）+ `packages/research-strategies/src/orchestration/langgraph/`（LangGraph 内核） |
| Workflow CLI | `packages/research-strategies/src/workflow/cli.ts` |
| Phase3 独立 CLI | `packages/research-strategies/src/phase3/cli.js`（构建后） |
| Business analysis | `packages/research-strategies/src/business-analysis/orchestrator.ts` |
| 严格模式文案与前缀 | `packages/research-strategies/src/pipeline/strict-messages.ts` |

## 2. Stage 与 Phase 对应（语义）

| Stage | 名称 | 实现（Phase） |
|-------|------|---------------|
| A | ReportAcquire | Phase 0；`workflow` 内仅 `--report-url` 触发下载；**仅 `--pdf` 不经 Phase0** |
| B | StructuredCollect | Phase 1A |
| C | ExternalEvidence | Phase 1B（实现上 **C1 采集 → C2 投影** 后仍输出 `Phase1BQualitativeSupplement`） |
| D | ReportExtract | Phase 2A + 2B（有 `pdfPath` 时） |
| E | StrategyEvaluate | Phase 3（当前为 `runPhase3Strict` 路径） |

## 3. 编排顺序（当前实现，契约冻结）

**`workflow:run` / `executeWorkflowDataPipeline` 当前顺序：**

- **有年报 PDF 路径**（`--pdf`，或 `--report-url` / turtle-strict 自动发现后经 Phase0 得到本地 PDF，即存在 `pdfPath` 用于年报 2A/2B）：

```text
B → D → C →（Phase3 在 runResearchWorkflow 内，即 Stage E）
```

- **无年报 PDF**（无 `--pdf` 且无上述 `pdfPath`）：

```text
B → C →（无 D）→（Phase3 在 runResearchWorkflow 内）
```

`runResearchWorkflow` 在管线结束后再跑 Phase3。中期报告 `--interim-pdf` / `--interim-report-md` 仍在管线前段处理，不改变上述 B/D/C 分支语义。

## 4. `workflow:run` CLI 契约

- **必填**：`--code <stock-code>`
- **常用可选**：`--year`、`--company-name`、`--from`、`--to`、`--output-dir`、`--pdf`、`--report-url`、`--category`、`--phase1b-channel http|mcp`、`--mode standard|turtle-strict`、`--preflight off|strict`、`--interim-report-md`、`--interim-pdf`、`--preflight-remedy-pass 0|1`、`--refresh-market`（flag）
- **`--mode turtle-strict`**：无 `--pdf`/`--report-url` 时尝试 Feed 自动发现年报 URL；仍无报告包则按严格文案失败；**必须有** `data_pack_report.md` 等价内容（即 `reportPackMarkdown`）才能进入 Phase3
- **`--preflight`**：未指定时，`turtle-strict` 等价 `strict`，否则默认 `off`；`business-analysis --strict` 会把管线 preflight 置为 `strict`
- **退出**：未捕获错误以非零退出；消息体须保留 `strict-messages` 中定义的前缀（见第 7 节）

## 5. `RunWorkflowInput` 与产物路径（相对 `outputDir`）

| 产物 | 相对路径 / 说明 |
|------|-----------------|
| Phase1A JSON | `phase1a_data_pack.json` |
| 市场包 | `data_pack_market.md` |
| Phase1B | `phase1b_qualitative.json`、`phase1b_qualitative.md` |
| Phase2A/2B（有 PDF） | `pdf_sections.json`、`data_pack_report.md` |
| 中报 PDF 链 | `pdf_sections_interim.json`、`data_pack_report_interim.md` |
| Phase3 预检 | `phase3_preflight.md` |
| Phase3 输出 | `valuation_computed.json`、`analysis_report.md`、`analysis_report.html` |
| 编排清单 | `workflow_manifest.json`（`manifestVersion` 当前为 `"1.0"`） |

`workflow_manifest.json` 须保留：

- `generatedAt`、`input`（code 归一化后写入）、`outputs` 各路径
- `pipeline.valuation.relativePaths.marketMd`；若有年报包则含 `reportMd`；中报链可能含 `interimReportMd`

## 6. `phase3:run` CLI 契约

- **必填**：`--market-md <path>`
- **可选**：`--report-md`、`--interim-report-md`、`--output-dir`（默认 `output`）
- **输出**：`valuation_computed.json`、`analysis_report.md`、`analysis_report.html`（与 workflow 内 Phase3 一致）

## 7. 错误与前缀契约（严格模式）

| 前缀 | 用途 |
|------|------|
| `[strict:business-analysis]` | `business-analysis --strict` |
| `[strict:workflow:turtle-strict]` | `workflow --mode turtle-strict` 相关 |
| `[strict:preflight]` | Phase1A / Phase3 preflight 严格失败 |

具体文案以 `strict-messages.ts` 导出函数为准（含自动发现失败、缺报告包、Phase3 ABORT、SUPPLEMENT_NEEDED 等）。

## 8. Stage E / 策略语义（当前冻结）

- **默认策略**：`turtle` → Turtle 严格管线 `runPhase3Strict`（解析 `data_pack_market` / 可选 `data_pack_report` / 可选中报 md）。
- **样板第二策略**：`value_v1` → 与 `turtle` 共用同一套 `runPhase3Strict` 计算，仅在报告呈现层打标（标题后缀），用于验证插件注册与编排隔离；CLI `--strategy turtle|value_v1`，manifest `orchestration.strategyId` 记录选用策略。
- **策略与编排边界**：Phase0~2B 与策略无关；策略仅消费标准契约产物，不直接读 feed 原始字段。

## 9. 质量门禁契约（发布前）

以下命令须全部通过（与根目录脚本一致）：

```bash
pnpm run typecheck
pnpm run build
pnpm run test:linkage
pnpm run quality:all
```

其中 `quality:all` 在 `@trade-signal/research-strategies` 包内包含 `quality:strategy-registry`（`turtle` 与 `value_v1` 插件烟测）。

## 10. 变更策略

- 任何 M1+ 代码改动若影响上述 CLI、顺序、产物路径、manifest 形状或严格错误语义，须**同步更新本文件**并跑通第 9 节门禁。
