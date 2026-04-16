# 流程说明（Stage 编排与 CLI）

[返回项目首页](../../README.md) · [文档索引](../README.md)

本文档以 **Stage（通用编排阶段）** 为真源描述流程；**Phase 0~3** 为当前 CLI/代码中的实现命名，二者一一对应。策略（如 **Turtle / 龟龟**）仅作用于 **Stage E** 及证据投影层，不是整条流水线的名字。详见 [策略与流程解耦](../architecture/strategy-orchestration-architecture.md)。

**脚本口径（非兼容收敛后）**：仓库根目录仍保留用户向命令（如 `pnpm run workflow:run`）；在 `@trade-signal/research-strategies` 包内请使用分组脚本 **`run:*` / `dev:*` / `quality:*` / `test:*`**（无历史 `phase*:run` 等别名）。下文 `pnpm --filter @trade-signal/research-strategies run …` 示例均指向包内 `run:*`。

## 产物目录 output v2（非兼容）

- **根目录**：仍使用仓库根下 `output/`（包内执行时解析到 monorepo 根，见 `resolve-monorepo-path`）。
- **workflow**：未传 `--output-dir` 时默认父目录为 `output/workflow/<code>/`，产物在 `output/workflow/<code>/<runId>/`；`<runId>` 为 UUID。显式 `--output-dir <父目录>` 时写入 `<父目录>/<runId>/`。
- **business-analysis**：与 workflow 共用 LangGraph 管线；未传 `--output-dir` 时默认父目录为 `output/business-analysis/<code>/`，产物在 `output/business-analysis/<code>/<runId>/`。
- **续跑**：`--resume-from-stage` 时必须传入 `--output-dir`，且指向**已有 run 根目录**（该目录下含 `workflow_graph_checkpoint.json`）。
- **`valuation:run`（独立 CLI）**：`--output-dir` 为默认 `output` 时，写入 `output/valuation/<code>/<runId>/`；可用 `--code` 指定分区（缺省 `_adhoc`）。`--from-manifest` 且默认 `--output-dir` 时，仍写入 manifest 所在 run 目录。
- **`run:phase3`（独立 CLI）**：`--output-dir` 为默认 `output` 时，写入 `output/phase3/<code>/<runId>/`；可用 `--code` 指定分区（缺省 `_adhoc`）。显式 `--output-dir` 为**写入根目录**，不再追加子 UUID。
- **report-to-html**：未传 `--output-html` 时，写入 `output/report/<code>/<runId>/<stem>.html`；可用 `--code` 指定分区（缺省 `_adhoc`）。
- **screener**：在 `--output-dir` 根下写入 `output/screener/<market>/<mode>/<runId>/`（若根为默认 `output`，则完整路径为 `output/screener/...`）。
- **清单字段**：`workflow_manifest.json` / `business_analysis_manifest.json` 的 `manifestVersion` 为 **`2.0`**，并含 `outputLayout: { version, area, code, runId }`。

源码目录职责见 [research-strategies-src-layout.md](./research-strategies-src-layout.md)；策略注册步骤见 [strategy-registration.md](./strategy-registration.md)。

### output v2 典型命令对照

**1）workflow 新跑（`--output-dir` = 父目录，其下自动建 `<runId>/`）**

```bash
pnpm run workflow:run -- \
  --code 600887 \
  --year 2024 \
  --pdf "./path/to/annual.pdf" \
  --output-dir "./output/workflow/600887"
```

**2）workflow 续跑（`--output-dir` = 已有 run 根目录，与 `--resume-from-stage` 同用）**

```bash
pnpm run workflow:run -- \
  --code 600887 \
  --output-dir "./output/workflow/600887/<runId>" \
  --resume-from-stage B
```

**3）valuation 写回某次 workflow 的 run 目录（`--output-dir` = 写入根，不再套子 UUID）**

```bash
pnpm run valuation:run -- \
  --market-md "./output/workflow/600887/<runId>/data_pack_market.md" \
  --code 600887 \
  --output-dir "./output/workflow/600887/<runId>"
```

## Stage 与 Phase 对照

| Stage | 名称 | 对应 Phase（实现） | 策略无关 |
|-------|------|-------------------|----------|
| A | ReportAcquire | Phase 0（及 workflow 内 `--report-url` 下载） | 是 |
| B | StructuredCollect | Phase 1A | 是 |
| C | ExternalEvidence | Phase 1B（含 C1 通用采集 + C2 策略投影） | C1 是 / C2 随策略 |
| D | ReportExtract | Phase 2A + 2B | 是 |
| E | StrategyEvaluate | Phase 3（定性 + 定量 + 估值 + 报告） | 核心在策略插件 |

### ExternalEvidence（C1 / C2）

Stage C 在实现上对应 Phase 1B，但语义上拆两层（详见 [策略与流程解耦](../architecture/strategy-orchestration-architecture.md)）：

- **C1（通用）**：外部来源采集、去重、时间排序、可信度标注；输出**与策略无关**的统一证据对象。
- **C2（策略投影）**：按当前策略（如 Turtle D1~D6）把 C1 产物映射为策略上下文；**策略判断只应出现在 C2 及 Stage E**，不回写污染 C1 原始证据。

## 推荐执行顺序（按输入分支）

**有 `--pdf` 或 `--report-url`（推荐）**

```text
A → B → D → C → E
```

先完成报告结构化（D），再做外部证据补充（C），降低后续推理漂移。

**无 PDF / 无报告 URL**

```text
A → B → C → E
```

（A 在无 URL 场景下可能跳过或仅作占位；以当前 CLI 行为为准。）

**当前 `workflow:run` 实现顺序（与文档目标对齐）**

- 有年报 PDF（`--pdf`，或 `--report-url` / 自动发现后经 Phase0 得到本地 PDF，用于年报 2A/2B）：

```text
Phase1A → Phase2A/2B → Phase1B → Phase3
```

即 **B→D→C→E**（Stage A 仍仅在 `--report-url` 等场景发生，见上文）。

- 无年报 PDF：

```text
Phase1A → Phase1B → Phase3
```

即 **B→C→E**（无 D）。

## LangGraph 与 LangChain Deep Agents（分层）

- **LangGraph**：外层流程状态机（阶段、分支、checkpoint、重试、审计）。
- **LangChain.js Deep Agents**：单阶段内的智能执行（工具调用、任务拆解、推理）。

组合方式：图编排跑 Stage；在 C2 / E 等节点内按需接入 Deep Agents。选型见 [Agent 编排框架选型](../strategy/agent-framework-comparison.md)。

## 逻辑总览（方法论）

```text
用户输入 (股票代码 [+ PDF / 报告 URL])
         │
    ┌────▼────┐
    │ Stage A │  报告获取与缓存
    └────┬────┘
         │
    ┌────▼──────────────┬───────────────────┐
    │ Stage B           │ Stage D（若有 PDF）│
    │ 标准字段采集       │ PDF 定位与精提取   │
    └────┬──────────────┴──────────┬────────┘
         │                         │
         │    （有年报 PDF 时：`workflow` 内先 D 再 C）
         │
    ┌────▼────┐
    │ Stage C │  外部证据（C1+C2）
    └────┬────┘
         │
    ┌────▼────┐
    │ Stage E │  策略评估与报告（如 turtle 插件）
    └────┬────┘
         │
  analysis_report.md + .html 等
```

## `workflow:run` 与参数

- **Stage A / Phase 0**：`workflow` 内仅 `--report-url` 触发下载；**仅 `--pdf` 不经过 Phase0**。独立 `phase0:download` 可无 `--url`，由 Feed `/stock/report/search` 自动发现 PDF（需 `FEED_BASE_URL`）。详见 [Phase 0 下载器](./phase0-download.md)。
- **依赖**：`FEED_BASE_URL`（Phase1A 固定 HTTP Provider）；编排内合成的 `data_pack_market.md` 与手写 golden 用途不同。
- **Pre-flight**：`--mode turtle-strict` 时，Phase1A 后会校验行情/财报关键字段及市场包是否含 `## §13 Warnings`；亦可用 `--preflight strict` 在 `standard` 下强制开启。`business-analysis --strict` 等价打开 Pre-flight。
- **与独立 Phase3（`run:phase3`）差异**：编排不传 `--interim-report-md`。

## 独立商业分析流程

CLI：`pnpm run business-analysis:run`（根目录）或 filter 等价命令。Claude：`/business-analysis`（见 `.claude/commands/business-analysis.md`）。规范：`.claude/skills/business-analysis/SKILL.md`。

产出：`qualitative_report.md`、**`qualitative_d1_d6.md`**、`data_pack_market.md`、可选 `data_pack_report.md`、`business_analysis_manifest.json`。

`business_analysis_manifest.json` 内含 `pipeline.valuation.relativePaths` 与建议的 `valuation:run --from-manifest ...`。

## 独立估值与 HTML 转换

**Valuation**：

```bash
pnpm run valuation:run -- \
  --market-md "./output/workflow/600887/<runId>/data_pack_market.md" \
  [--report-md "./output/workflow/600887/<runId>/data_pack_report.md"] \
  [--code 600887] \
  [--full-report]
```

> 说明：未传 `--output-dir`（默认 `output`）时，估值产物写入 `output/valuation/<code>/<runId>/`（可用 `--code` 指定分区）。若要与某次 workflow 产物同目录，可显式传入 `--output-dir ./output/workflow/600887/<runId>`（该路径为**写入根目录**，不再追加子 UUID）。

或从 manifest 解析路径：

```bash
pnpm run valuation:run -- --from-manifest "./output/workflow/600887/<runId>/business_analysis_manifest.json"
```

**report-to-html**：

```bash
pnpm run report-to-html:run -- \
  --input-md "./output/workflow/600887/<runId>/analysis_report.md" \
  [--toc] [--legacy-pre]
```

Claude：`/valuation`、`/report-to-html`（见 `.claude/commands/`）。

`workflow_manifest.json` 同样包含 `pipeline.valuation.relativePaths`。

## 阶段职责（Stage / Phase）

- **A / Phase 0**：年报下载、缓存、版本命名（详见 [Phase 0 年报下载器](./phase0-download.md)）
- **B / Phase 1A**：通过 `MarketDataProvider` 采集结构化数据
- **C / Phase 1B**：外部证据补充（C1 通用 + C2 策略投影）
- **D / Phase 2A+2B**：PDF 章节定位与精提取
- **E / Phase 3**：策略评估（如 Turtle）+ 定量 + 估值 + 报告渲染

## 关键中间产物契约（v0.1）

### `data_pack_market`（Stage B / Phase 1A 输出）

- 用途：提供 Stage E / Phase 3 定量与估值的基础输入
- 最小字段集合：`instrument`、`quote`、`klines`、`financialSnapshot`
- 编排 Markdown：§1~§17 骨架、多年财务表（无历史时由单期快照外推复制并写入 §13 警告）、**§13 Warnings** 区块
- 要求：仅使用标准字段命名，不出现供应商原始字段

### `pdf_sections`（Stage D / Phase 2A 输出）

- 用途：作为 Phase 2B 的章节索引输入
- 最小结构：
  - `metadata`（`pdfFile`、`totalPages`、`extractTime`、`sectionsFound`、`sectionsTotal`）
  - 章节键：`P2`、`P3`、`P4`、`P6`、`P13`、`MDA`、`SUB`
- 章节值：`PdfSectionBlock`（`title/content/pageFrom/pageTo`）

Phase2A CLI（research-strategies）：

```bash
pnpm --filter @trade-signal/research-strategies run run:phase2a-extract -- \
  --pdf "./cache/reports/SH600519/600519_2024_年报.pdf" \
  --output "./output/pdf_sections.json"
```

Phase2B CLI（research-strategies，输出 5+1 `data_pack_report.md`，不含 MDA）：

```bash
pnpm --filter @trade-signal/research-strategies run run:phase2b-render -- \
  --pdf "./cache/reports/SH600519/600519_2024_年报.pdf" \
  --phase2a-output "./output/pdf_sections.json" \
  --output "./output/data_pack_report.md"
```

如果已经有 `pdf_sections.json`，可直接渲染：

```bash
pnpm --filter @trade-signal/research-strategies run run:phase2b-render -- \
  --sections "./output/pdf_sections.json" \
  --output "./output/data_pack_report.md"
```

Phase3 CLI（research-strategies）：

```bash
pnpm --filter @trade-signal/research-strategies run run:phase3 -- \
  --market-md "./output/phase3_golden/cn_a/data_pack_market.md" \
  --report-md "./output/phase3_golden/cn_a/data_pack_report.md" \
  --output-dir "./output"
```

> 严格 1:1 模式下，Phase3 以 `data_pack_market.md` 为必选输入，`data_pack_report.md`/`data_pack_report_interim.md` 为可选增强输入。

输出：

- `output/valuation_computed.json`
- `output/analysis_report.md`
- `output/analysis_report.html`

Workflow CLI（一键串联）：

```bash
pnpm --filter @trade-signal/research-strategies run run:workflow -- \
  --code 600887 \
  --year 2024 \
  --pdf "./references/tmp/1216664083.pdf" \
  --output-dir "./output/workflow/600887"
```

> 说明：`--output-dir` 为**父目录**；实际产物在 `./output/workflow/600887/<runId>/`（`<runId>` 由运行生成，见控制台 `outputDir` 日志或 `workflow_manifest.json` 的 `outputLayout.runId`）。

严格模式（与 `/turtle-analysis` 对齐）：

```bash
pnpm run workflow:run -- \
  --code 600887 \
  --year 2024 \
  --mode turtle-strict \
  --pdf "./path/to/annual.pdf"
```

根目录等价：`pnpm run workflow:run -- ...`。运行前需 `pnpm run build`（或对该包 build）以生成 `dist/`。

说明：

- 必填：`--code`
- `--mode`：`standard`（默认）或 `turtle-strict`（优先显式 PDF/URL；若缺失则尝试按 `code+year` 自动发现，且必须生成 `data_pack_report.md`）
- `--strategy`：`turtle`（默认）或 `value_v1`（第二策略样板；Stage E 插件切换，编排顺序不变）
- 可选 PDF 分支：`--pdf` 或 `--report-url`（启用 Phase2A/2B；`--report-url` 会走 Phase0 下载）
- 中期报告：`--interim-pdf <path>` 经 Phase2A/2B 生成 `data_pack_report_interim.md` 并作为 Phase3 interim 输入；亦可 `--interim-report-md` 直接传入已渲染 md（**同时传时 PDF 优先**）
- 主要产物：`phase1a_data_pack.json`、`data_pack_market.md`、`phase1b_qualitative.{json,md}`、可选 `pdf_sections.json` / `data_pack_report.md`、可选 `pdf_sections_interim.json` / `data_pack_report_interim.md`、`valuation_computed.json`、`analysis_report.{md,html}`、`phase3_preflight.md`、`workflow_manifest.json`
- 编排侧：`workflow_graph_checkpoint.json`（续跑快照）与 `workflow_manifest.json` 的 `orchestration` 扩展字段（`engine`、`strategyId`、`runId`、`threadId`、`completedStages`、`agentSidecarNote`）。续跑：`--resume-from-stage B|D`（**必须** `--output-dir` 指向已有 run 根目录 `.../workflow/<code>/<runId>/`；`D` 会跳过 Stage B）。程序化调用等价字段为 `RunWorkflowInput.resumeFromStage`。
- 可选 Stage C LLM sidecar：环境变量 `TS_LLM_*` 见 [agent-llm-and-env.md](./agent-llm-and-env.md)（不配不影响主链）。
- Phase2 分区/渲染契约烟测（需先 `pnpm run build`）：`pnpm --filter @trade-signal/research-strategies run test:phase2`

Business analysis CLI（Stage E 前停）：

```bash
pnpm run business-analysis:run -- \
  --code 600887 \
  --year 2024 \
  [--pdf "..."] \
  [--strict]
```

Screener CLI（独立策略域，与 Stage E 并行存在）：

```bash
pnpm --filter @trade-signal/research-strategies run run:screener -- \
  --market CN_A \
  --mode standalone \
  --input-json "./output/screener_samples/cn_a_universe.json" \
  --output-dir "./output"
```

```bash
pnpm --filter @trade-signal/research-strategies run run:screener -- \
  --market HK \
  --mode composed \
  --input-json "./output/screener_samples/hk_universe.json" \
  --output-dir "./output"
```

> 说明：实际写入 `./output/screener/<market>/<mode>/<runId>/`（每次运行新建 `<runId>`）。

Screener 输出：

- `screener_results.json`
- `screener_input.csv`
- `screener_report.md`
- `screener_report.html`

质量门禁：

```bash
pnpm run quality:all
```

或分项：

```bash
pnpm --filter @trade-signal/research-strategies run quality:conformance
pnpm --filter @trade-signal/research-strategies run quality:contract
pnpm --filter @trade-signal/research-strategies run quality:regression -- --suite hk
pnpm --filter @trade-signal/research-strategies run quality:phase3-golden -- --suite cn_a
```

说明：`contract` 使用 `output/phase3_golden/cn_a/`；`regression` / `phase3-golden` 支持 `--suite cn_a|hk|all`（`quality:all` 默认 `all`）。详见 [数据源与字段契约](./data-source.md)。

**港股（HK）**：质量门禁中的 `hk` 套件用于防回归快照；与 A 股同等级别的端到端深度能力 **暂未实现**，将在后续版本补齐。

### `apps/screener-web`（已冻结，非主链路）

历史实验用 Next 壳层，**默认不参与**根目录 `pnpm run build`；选股器请以 **`pnpm run screener:run`** 与产物 `screener_results.*` / `screener_report.*` 为准。若本地仍需启动，见 [`apps/screener-web/README.md`](../../apps/screener-web/README.md)。

### `qualitative_report`（Stage C / Phase 1B 等输出）

- 用途：为 Stage E / Phase 3 的定性与估值假设提供依据
- 最小内容：结论、证据引用、参数化因子表
- Phase1B 当前补充范围：§7 管理层与治理、§8 行业与竞争、§10 MD&A 摘要（每项保留来源 URL）

### `valuation_computed`（Stage E / Phase 3 中间产物）

- 用途：承载确定性估值方法结果，供报告层渲染
- 最小内容：方法结果（DCF/DDM/PE Band/PEG/PS）、关键假设、敏感性说明

### `analysis_report`（Stage E / Phase 3 最终输出）

- 输出格式：`Markdown + HTML`
- 元信息要求：`schema_version`、`data_source`、`generated_at`、`capability_flags`

## 相关文档

- [数据源与字段契约](./data-source.md)
- [策略与流程解耦](../architecture/strategy-orchestration-architecture.md)
- [路线图（策略与版本）](../strategy/strategy-roadmap.md)
