# 流程说明（Phase 0~3）

[返回 README](../README.md) · [文档索引](./README.md)

## 策略主流程（逻辑阶段）

与 [README](../README.md) 一致：下图为**方法论阶段**；各阶段可独立 CLI 执行，或由 `workflow:run` **串行**串联。Phase 1A 与 Phase 2A 逻辑上可并行准备数据，**当前一键编排为顺序执行**。

```text
用户输入 (股票代码 [+ PDF / 报告 URL])
         │
    ┌────▼────┐
    │ Phase 0 │  年报获取与缓存（可选：phase0 CLI 或 workflow 的 --report-url）
    └────┬────┘
         │
    ┌────▼──────────────┬───────────────────┐
    │ Phase 1A          │ Phase 2A          │  ← 逻辑上可并行准备
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
      <output-dir>/analysis_report.md + .html
```

## `workflow:run` 实际顺序

```text
Phase1A → Phase1B →（若 --pdf 或 --report-url）Phase2A/2B → Phase3
```

- **Phase 0**：`workflow` 内仅 `--report-url` 触发下载；**仅 `--pdf` 不经过 Phase0**。独立 `phase0:download` 可无 `--url`，由 Feed `/stock/report/search` 自动发现 PDF（需 `FEED_BASE_URL`）。
- **依赖**：`FEED_BASE_URL`（Phase1A 固定 HTTP Provider）；编排内合成的 `data_pack_market.md` 与手写 golden 用途不同。
- **Pre-flight**：`--mode turtle-strict` 时，Phase1A 后会校验行情/财报关键字段及市场包是否含 `## §13 Warnings`；亦可用 `--preflight strict` 在 `standard` 下强制开启。`business-analysis --strict` 等价打开 Pre-flight。
- **与 `phase3:run` 差异**：编排不传 `--interim-report-md`。

## 独立商业分析流程（已实现）

CLI：`pnpm run business-analysis:run`（根目录）或 filter 等价命令。Claude：`/business-analysis`（见 `.claude/commands/business-analysis.md`）。规范：`.claude/skills/business-analysis/SKILL.md`。

产出：`qualitative_report.md`、**`qualitative_d1_d6.md`（Turtle D1~D6 契约骨架）**、`data_pack_market.md`、可选 `data_pack_report.md`、`business_analysis_manifest.json`。

`business_analysis_manifest.json` 内含 `pipeline.valuation.relativePaths` 与建议的 `valuation:run --from-manifest ...`，便于与独立估值入口串接。

## 独立估值与 HTML 转换

**Valuation**（默认：`valuation_computed.json` + `valuation_summary.md`；加 `--full-report` 时额外输出与 `phase3:run` 同构的 `analysis_report.md` / `analysis_report.html`）：

```bash
pnpm run valuation:run -- \
  --market-md "./output/workflow/600887/data_pack_market.md" \
  [--report-md "./output/workflow/600887/data_pack_report.md"] \
  [--output-dir "./output/workflow/600887"] \
  [--full-report]
```

或从 manifest 解析路径：

```bash
pnpm run valuation:run -- --from-manifest "./output/workflow/600887/business_analysis_manifest.json"
```

**report-to-html**（Markdown → **语义化 HTML**：标题/表格/列表/代码块；`--toc` 生成目录；`--legacy-pre` 回退旧版整页 `<pre>`）：

```bash
pnpm run report-to-html:run -- \
  --input-md "./output/workflow/600887/analysis_report.md" \
  [--toc] [--legacy-pre]
```

Claude：`/valuation`、`/report-to-html`（见 `.claude/commands/`）。

`workflow_manifest.json` 同样包含 `pipeline.valuation.relativePaths`，便于对照路径。

## 阶段职责

- Phase 0：年报下载、缓存、版本命名（详见 [Phase 0 年报下载器](./phase0-download.md)）
- Phase 1A：通过 `MarketDataProvider` 采集结构化数据
- Phase 1B：补充外部非结构化信息（治理/行业/MD&A，默认 HTTP 调用 feed 检索）
- Phase 2A：PDF 章节定位与切分
- Phase 2B：附注与关键段落精提取
- Phase 3：定性分析 + 定量分析 + 估值 + 报告渲染

## 关键中间产物契约（v0.1）

### `data_pack_market`（Phase 1A 输出）

- 用途：提供 Phase 3 定量与估值的基础输入
- 最小字段集合：`instrument`、`quote`、`klines`、`financialSnapshot`
- 编排 Markdown：§1~§17 骨架、多年财务表（无历史时由单期快照外推复制并写入 §13 警告）、**§13 Warnings** 区块
- 要求：仅使用标准字段命名，不出现供应商原始字段

### `pdf_sections`（Phase 2A 输出）

- 用途：作为 Phase 2B 的章节索引输入
- 最小结构：
  - `metadata`（`pdfFile`、`totalPages`、`extractTime`、`sectionsFound`、`sectionsTotal`）
  - 章节键：`P2`、`P3`、`P4`、`P6`、`P13`、`MDA`、`SUB`
- 章节值：`PdfSectionBlock`（`title/content/pageFrom/pageTo`）

Phase2A CLI（research-strategies）：

```bash
pnpm --filter @trade-signal/research-strategies run phase2a:extract -- \
  --pdf "./cache/reports/SH600519/600519_2024_年报.pdf" \
  --output "./output/pdf_sections.json"
```

Phase2B CLI（research-strategies，输出 5+1 `data_pack_report.md`，不含 MDA）：

```bash
pnpm --filter @trade-signal/research-strategies run phase2b:render -- \
  --pdf "./cache/reports/SH600519/600519_2024_年报.pdf" \
  --phase2a-output "./output/pdf_sections.json" \
  --output "./output/data_pack_report.md"
```

如果已经有 `pdf_sections.json`，可直接渲染：

```bash
pnpm --filter @trade-signal/research-strategies run phase2b:render -- \
  --sections "./output/pdf_sections.json" \
  --output "./output/data_pack_report.md"
```

Phase3 CLI（research-strategies，输入市场数据 + 可选附注包，输出估值与报告）：

```bash
pnpm --filter @trade-signal/research-strategies run phase3:run -- \
  --market-md "./output/phase3_golden/cn_a/data_pack_market.md" \
  --report-md "./output/phase3_golden/cn_a/data_pack_report.md" \
  --output-dir "./output"
```

> 严格 1:1 模式下，Phase3 以 `data_pack_market.md` 为必选输入，`data_pack_report.md`/`data_pack_report_interim.md` 为可选增强输入。

输出：
- `output/valuation_computed.json`
- `output/analysis_report.md`
- `output/analysis_report.html`

Workflow CLI（一键串联 Phase1A/1B/2A/2B/3）：

```bash
pnpm --filter @trade-signal/research-strategies run workflow:run -- \
  --code 600887 \
  --year 2024 \
  --pdf "./references/tmp/1216664083.pdf" \
  --output-dir "./output/workflow/600887"
```

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
- 可选 PDF 分支：`--pdf` 或 `--report-url`（启用 Phase2A/2B；`--report-url` 会走 Phase0 下载）
- 中期报告：`--interim-pdf <path>` 经 Phase2A/2B 生成 `data_pack_report_interim.md` 并作为 Phase3 interim 输入；亦可 `--interim-report-md` 直接传入已渲染 md（**同时传时 PDF 优先**）
- 主要产物：`phase1a_data_pack.json`、`data_pack_market.md`、`phase1b_qualitative.{json,md}`、可选 `pdf_sections.json` / `data_pack_report.md`、可选 `pdf_sections_interim.json` / `data_pack_report_interim.md`、`valuation_computed.json`、`analysis_report.{md,html}`、`phase3_preflight.md`、`workflow_manifest.json`
- Phase2 分区/渲染契约烟测（需先 `pnpm run build`）：`pnpm --filter @trade-signal/research-strategies run test:phase2`

Business analysis CLI（Phase3 前停，定性 + 数据包）：

```bash
pnpm run business-analysis:run -- \
  --code 600887 \
  --year 2024 \
  [--pdf "..."] \
  [--strict]
```

Screener CLI（独立/组合双模式）：

```bash
pnpm --filter @trade-signal/research-strategies run screener:run -- \
  --market CN_A \
  --mode standalone \
  --input-json "./output/screener_samples/cn_a_universe.json" \
  --output-dir "./output/screener_run/cn_a_standalone"
```

```bash
pnpm --filter @trade-signal/research-strategies run screener:run -- \
  --market HK \
  --mode composed \
  --input-json "./output/screener_samples/hk_universe.json" \
  --output-dir "./output/screener_run/hk_composed"
```

Screener 输出：
- `screener_results.json`
- `screener_input.csv`
- `screener_report.md`
- `screener_report.html`

质量门禁：

```bash
# 全量：conformance → contract → regression → phase3-golden
pnpm run quality:all
```

或分项（根目录 `pnpm run quality:<name>` 与 filter 等价）：

```bash
pnpm --filter @trade-signal/research-strategies run quality:conformance
pnpm --filter @trade-signal/research-strategies run quality:contract
pnpm --filter @trade-signal/research-strategies run quality:regression -- --suite hk
pnpm --filter @trade-signal/research-strategies run quality:phase3-golden -- --suite cn_a
```

说明：`contract` 使用 `output/phase3_golden/cn_a/`；`regression` / `phase3-golden` 支持 `--suite cn_a|hk|all`（`quality:all` 默认 `all`）。`regression` 为重跑 Phase3 后与 golden 基线做规范化哈希对比；`phase3-golden` 为各套件 `run/golden_manifest.json` 中文件的 sha256+字节数校验。详见 [数据源与字段契约](./data-source.md)。

**港股（HK）**：质量门禁中的 `hk` 套件用于防回归快照；与 A 股同等级别的端到端深度能力 **暂未实现**，将在后续版本补齐。

Next.js 在线 MVP（请在 **monorepo 根目录**启动，以便 API 解析 `packages/research-strategies/dist/...`）：

```bash
pnpm run web:dev
```

### `qualitative_report`（Phase 1B/2B 输出）

- 用途：为 Phase 3 的定性与估值假设提供依据
- 最小内容：结论、证据引用、参数化因子表
- Phase1B 当前补充范围：§7 管理层与治理、§8 行业与竞争、§10 MD&A 摘要（每项保留来源 URL）

### `valuation_computed`（Phase 3 中间产物）

- 用途：承载确定性估值方法结果，供报告层渲染
- 最小内容：方法结果（DCF/DDM/PE Band/PEG/PS）、关键假设、敏感性说明

### `analysis_report`（Phase 3 最终输出）

- 输出格式：`Markdown + HTML`
- 元信息要求：`schema_version`、`data_source`、`generated_at`、`capability_flags`
