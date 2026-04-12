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

### 策略主流程（必做）

```text
用户输入 (股票代码 + 年报PDF)
         │
    ┌────▼────┐
    │ Phase 0 │  年报获取与缓存 (download/caching)
    └────┬────┘
         │
    ┌────▼──────────────┬───────────────────┐
    │ Phase 1A          │ Phase 2A          │  ← 并行运行
    │ 标准字段数据采集    │ PDF 预处理         │
    │ (HTTP/MCP Provider)│ (章节定位/切片)     │
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

### 独立商业分析流程（必做）

```text
/business-analysis {code}
         │
    ┌────▼────────────────┐
    │ 年报 PDF 获取/缓存    │
    └────┬────────────────┘
         │
    ┌────▼────────────────┐
    │ 标准字段数据采集      │  历史序列补充（标准字段数据段）
    └────┬────────────────┘
         │
    ┌────▼────────────────┐
    │ 单 Agent 定性分析     │  基于 PDF + 结构化数据联合分析
    └────┬────────────────┘
         │
    report.md + report.html
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

### Phase2A：PDF 章节提取（schema_block）

```bash
pnpm --filter @trade-signal/research-strategies run phase2a:extract -- \
  --pdf "./cache/reports/SH600519/600519_2024_年报.pdf" \
  --output "./output/pdf_sections.json" \
  --verbose
```

输出结构对齐 `PdfSections`：`metadata` + `P2/P3/P4/P6/P13/MDA/SUB`（章节命中时带 `title/content/pageFrom/pageTo`）。

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
├── packages/
│   ├── core-schema/         # 标准字段与 Provider 契约
│   ├── provider-http/       # HTTP 数据适配器
│   ├── provider-mcp/        # MCP 数据适配器
│   ├── research-strategies/ # 策略与研究流程编排
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

## 参考与致谢

本项目在流程设计中参考了以下开源项目：

- [terancejiang/Turtle_investment_framework](https://github.com/terancejiang/Turtle_investment_framework)（方法论与流程）

感谢以上项目与维护者对开源投研生态的贡献。

## License

MIT
