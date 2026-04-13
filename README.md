# trade-signal-schema-kit

面向 A 股/港股研究场景的 TypeScript 分析框架。  
聚焦“数据采集 -> 定性分析 -> 定量评估 -> 估值 -> 报告输出”的完整能力。

> 当前版本：**v0.1-alpha** — A 股优先完整支持 + 港股基础支持（实时、日周月 K、基础信息）。  
> 项目阶段：研究验证（Research）。

## 功能介绍

| 模块 | 名称 | 实现方式 | 说明 |
|------|------|----------|------|
| 策略流程 | 研究流程编排 | TypeScript + Provider 抽象 | 提供可执行的 Phase 0~3 主流程 |
| 数据接入 | 标准字段数据层 | HTTP + MCP 适配器 | 支持统一字段语义的数据读取 |
| 估值分析 | 多方法估值 | 统一估值输入模型 | 支持 DCF/DDM/PE Band/PEG/PS 等 |
| 批量筛选 | 两级筛选框架 | Tier1 + Tier2 | 支持批量过滤 + 深度评分 |
| 报告输出 | MD + HTML 输出 | 统一报告元数据 | 自动产出结构化研究报告 |

## 适用场景

- 单股研究：从数据到报告的端到端分析
- 独立商业分析：基于年报与结构化数据的定性输出
- 估值评估：统一输入下的多模型估值结果
- 批量筛选：先粗筛后深筛的两级流程
- 多策略扩展：后续可接入不同策略规则，复用同一数据与报告框架

## 系统架构（主流程）

`trade-signal-schema-kit` 采用“共享模块 + 策略专属模块”分层，且必须实现以下主流程（Phase 0~3）：

### 策略主流程（逻辑阶段，Turtle 对齐）

下图表示**方法论上的阶段划分**；同一阶段可在不同 CLI 中独立执行，也可由 `workflow:run` **按顺序**串联（见下一节「Workflow」说明）。Phase 1A 与 Phase 2A 在逻辑上可并行准备数据，**当前一键编排实现为串行**。

```text
用户输入 (股票代码 [+ 年报 PDF / 报告 URL])
         │
    ┌────▼────┐
    │ Phase 0 │  年报获取与缓存（可选：独立 CLI 或 workflow 传 --report-url）
    └────┬────┘
         │
    ┌────▼──────────────┬───────────────────┐
    │ Phase 1A          │ Phase 2A          │  ← 逻辑上可并行准备
    │ 标准字段数据采集    │ PDF 预处理         │
    │ (MarketDataProvider)│ (章节定位/切片)     │
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
                 （文件名固定；可用目录名区分标的）
```

### 独立商业分析流程（规划中）

以下对应 Turtle 等产品形态中的「单 Agent 商业分析」路径；**本仓库当前无 `/business-analysis` 单一命令**，能力由 Phase 0~3 各 CLI 与 `workflow:run` 组合覆盖。

```text
/business-analysis {code}   （规划/外部产品形态，非本仓库 CLI）
         │
         ▼
    年报 PDF + 结构化数据 → 定性/报告输出（report.md + report.html）
```

### 各阶段实现范围

- **Phase 0**：年报下载、缓存、版本命名
- **Phase 1A**：通过 `MarketDataProvider` 采集标准字段数据包
- **Phase 1B**：补充外部非结构化信息（治理/行业/事件）
- **Phase 2A**：PDF 章节定位与结构化切分
- **Phase 2B**：附注/关键段落精提取
- **Phase 3**：定性分析 + 定量分析 + 估值 + 报告渲染

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 10

### 安装

```bash
pnpm install
```

### 验证

```bash
pnpm run typecheck
pnpm run build
```

`@trade-signal/research-strategies` 下的 CLI（`phase2a:extract`、`phase3:run`、`workflow:run`、`screener:run` 等）依赖编译产物 `dist/...`；首次运行前请执行根目录 `pnpm run build`（或对该包单独 `pnpm --filter @trade-signal/research-strategies run build`）。

### Phase2A：PDF 章节提取（schema_block）

```bash
pnpm --filter @trade-signal/research-strategies run phase2a:extract -- \
  --pdf "./cache/reports/SH600519/600519_2024_年报.pdf" \
  --output "./output/pdf_sections.json" \
  --verbose
```

输出结构对齐 `PdfSections`：`metadata` + `P2/P3/P4/P6/P13/MDA/SUB`（章节命中时带 `title/content/pageFrom/pageTo`）。

### Phase2B：生成 `data_pack_report.md`（5+1，不含 MDA）

```bash
pnpm --filter @trade-signal/research-strategies run phase2b:render -- \
  --pdf "./cache/reports/SH600519/600519_2024_年报.pdf" \
  --phase2a-output "./output/pdf_sections.json" \
  --output "./output/data_pack_report.md"
```

也支持直接基于已有 `pdf_sections.json` 渲染：

```bash
pnpm --filter @trade-signal/research-strategies run phase2b:render -- \
  --sections "./output/pdf_sections.json" \
  --output "./output/data_pack_report.md"
```


### Phase3：定量+估值+报告（MD + HTML）

```bash
pnpm --filter @trade-signal/research-strategies run phase3:run -- \
  --market-md "./output/phase3_golden/data_pack_market.md" \
  --report-md "./output/data_pack_report.md" \
  --output-dir "./output"
```

说明：Phase3 严格模式已切换为 `data_pack_market.md` 输入契约（A 股优先），不再默认走简化 JSON。

产出文件：
- `output/valuation_computed.json`
- `output/analysis_report.md`
- `output/analysis_report.html`

### Workflow：Phase1A/1B/2A/2B/3 一键编排

```bash
pnpm run workflow:run -- \
  --code 600887 \
  --year 2024 \
  --pdf "./references/tmp/1216664083.pdf" \
  --output-dir "./output/workflow/600887"
```

**执行顺序（实现）**：`Phase1A → Phase1B →（可选）Phase2A/2B → Phase3`，串行执行。

**环境与通道**：
- **必须**配置 `FEED_BASE_URL`（及按需 `FEED_API_KEY`）；Phase1A 在编排内固定使用 **HTTP** `createFeedHttpProviderFromEnv()`。
- Phase1B 默认 HTTP。`workflow:run` 虽支持 `--phase1b-channel mcp`，但 MCP 需 `mcpCallTool` 注入；**仅命令行使用时请保持默认 `http`**（传 `mcp` 且无注入会在运行期失败）。在自定义代码中可调用 `collectPhase1BQualitative(..., { mcpCallTool })`。
- 编排内的 `data_pack_market.md` 由 Phase1A 数据**合成**，含编排层说明（如部分字段估算）；与「手写 golden 市场包」用途不同。
- 独立 `phase3:run` 支持 `--interim-report-md`；**workflow 编排当前未接入**中期报告参数。

**Phase 0 何时触发**：仅当传入 `--report-url` 时，内部会调用 Phase0 下载器拉取 PDF；若只传 `--pdf` 指向本地文件，**不执行** Phase0 下载。

**PDF 支路**：传 `--pdf` 或 `--report-url`（下载后）会跑 Phase2A/2B；两者都不传则 Phase3 仅有市场包、无 `data_pack_report.md`。

**产物**（均在 `--output-dir` 或默认 `output/workflow/<code>/` 下）：`phase1a_data_pack.json`、`data_pack_market.md`、`phase1b_qualitative.{json,md}`、可选 `pdf_sections.json` / `data_pack_report.md`、`valuation_computed.json`、`analysis_report.md` / `analysis_report.html`、`workflow_manifest.json`。

### Screener：独立 + 组合模式

Screener 支持两种运行模式：
- `standalone`：独立快筛（不依赖财报分析流水线）
- `composed`：候选标的串联 Phase3 严格分析后融合评分

示例（A 股独立模式）：

```bash
pnpm --filter @trade-signal/research-strategies run screener:run -- \
  --market CN_A \
  --mode standalone \
  --input-json "./output/screener_samples/cn_a_universe.json" \
  --output-dir "./output/screener_run/cn_a_standalone"
```

示例（港股组合模式）：

```bash
pnpm --filter @trade-signal/research-strategies run screener:run -- \
  --market HK \
  --mode composed \
  --input-json "./output/screener_samples/hk_universe.json" \
  --output-dir "./output/screener_run/hk_composed"
```

Screener 产出：
- `screener_results.json`
- `screener_input.csv`（输入 universe 的 CSV 导出）
- `screener_report.md`
- `screener_report.html`

### Next.js 在线运行（MVP）

在 **monorepo 根目录**启动（保证 `process.cwd()` 下存在 `packages/research-strategies/dist/...`，供 API 动态加载 pipeline）：

```bash
pnpm run web:dev
```

等价于：

```bash
pnpm --filter @trade-signal/screener-web run dev
```

`screener-web` 的 `prebuild` 会先构建 `research-strategies`。开发时若改了策略代码，请重新 `pnpm run build`（或对该包 build）。

默认页面提供市场与模式切换，并通过 `/api/screener/run` 在线触发筛选；Universe 在有 `FEED_BASE_URL` 时优先请求 Feed 的 `/stock/screener/universe`，失败则回退内置 mock。

### Quality Gate

单测 golden 文件校验（对比 `output/phase3_golden/run/golden_manifest.json` 中的 sha256 与字节数）：

```bash
pnpm run quality:phase3-golden
```

完整质量门禁（依次执行）：

```bash
pnpm run quality:all
```

包含：`quality:conformance`（HTTP/MCP fixture 语义一致）→ `quality:contract`（市场包与估值 JSON 契约）→ `quality:regression`（重跑 Phase3 与 golden 基线对比，时间戳已规范化）→ `quality:phase3-golden`。`contract` / `regression` / `phase3-golden` 依赖仓库内 `output/phase3_golden/` 基线文件。

### 环境变量配置（packages 统一口径）

仅入口读取 `.env`，库层保持显式参数。  
项目提供两套模板：
- 极简：`/.env.example`（开箱只需地址 + API Key）
- 全量：`/.env.full`（包含 Phase0/Phase1B demo 与 MCP 可选项）

| 变量名 | 用途 | 作用包 | 默认值 |
|------|------|------|------|
| `FEED_BASE_URL` | Feed HTTP 根地址 | `provider-http` | 无 |
| `FEED_API_KEY` | Feed API Key | `provider-http` / `provider-mcp` | 无 |
| `FEED_MCP_URL` | Feed MCP endpoint（仅 MCP 场景） | `provider-mcp` | 无 |

## 项目结构（简版）

```text
trade-signal-schema-kit/
├── apps/
│   └── screener-web/        # Next.js 选股 MVP（在线触发 screener pipeline）
├── packages/
│   ├── core-schema/         # 标准字段与 Provider 契约（npm: @trade-signal/schema-core）
│   ├── provider-http/       # HTTP 数据适配器
│   ├── provider-mcp/        # MCP 数据适配器
│   ├── research-strategies/ # 策略与研究流程编排（Phase 0~3、workflow、screener、quality）
│   └── reporting/           # 报告输出
├── package.json
├── tsconfig.base.json
└── README.md
```

## 底层数据源

- 主数据通道：`trade-signal-feed`
- 接入方式：HTTP API + MCP（同语义字段输出）
- 设计原则：分析层只依赖标准字段，不直接依赖上游原始字段名

## 通道使用规则（统一约定）

- 默认执行通道：`HTTP`（脚本、批处理、流水线场景优先）
- AI/Agent 场景：`MCP`（交互式检索、工具编排、按需补充）
- 同一语义输出：HTTP/MCP 只更换通道，不更换标准字段语义
- 建议实践：默认先走 HTTP，只有在需要 Agent 能力时再切 MCP
- **`workflow:run` 编排**：Phase1A 固定 HTTP Provider；Phase1B 可在代码层配置 MCP，默认 HTTP

## 参考与致谢

本项目在流程设计中参考了以下开源项目：

- [terancejiang/Turtle_investment_framework](https://github.com/terancejiang/Turtle_investment_framework)（方法论与流程）

感谢以上项目与维护者对开源投研生态的贡献。

## License

MIT
