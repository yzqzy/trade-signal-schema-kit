# 数据源与字段契约

[返回项目首页](../../README.md) · [文档索引](../README.md)

## 数据接入原则

- 上层只依赖标准字段，不依赖上游原始字段名
- 数据统一由 `trade-signal-feed` 提供
- A 股单期合并快照：`FeedHttpProvider.getFinancialSnapshot` 优先 `GET /api/v1/stock/financial/snapshot/:code?reportDate=`，失败回退 `GET /stock/indicator/financial/:code`（简表首条）；MCP 对位 `get_stock_financial_snapshot`。
- A 股多年财报：`FeedHttpProvider.getFinancialHistory` 优先 `GET /api/v1/stock/financial/history/:code`，失败回退按年 `getFinancialSnapshot`；MCP 对位 `get_stock_financial_history`。
- 同一查询在 HTTP/MCP 两种通道语义一致

## 当前通道

- 主通道：`HTTP API`
- 协同通道：`MCP`
- 统一入口：`MarketDataProvider`

## 通道选择规则（项目级）

- 默认：优先 `HTTP`（脚本、批处理、CI/CD、可观测性优先场景）
- AI 场景：使用 `MCP`（Agent 交互、工具链编排、动态检索补充）
- 约束：切换通道不改变输出契约，必须保持标准字段语义一致

## 标准字段范围（v0.1）

- 标的基础信息（代码、市场、名称、币种、lot/tick）
- 实时行情（价格、涨跌幅、成交量、时间戳）
- K 线（日/周/月，港股基础）
- 财务快照（估值与筛选所需核心字段）
- 报告元数据（`schema_version`、`data_source`、`generated_at`）

## 关键契约对象（与流程产物对齐）

- `Instrument`：代码、市场、名称、交易最小单位信息
- `Quote`：价格、涨跌幅、成交量、时间戳
- `KlineBar[]`：周期、OHLC、成交量
- `FinancialSnapshot`：营收/净利/OCF/资产负债、可选 Capex、有息负债、货币资金、少数股东损益、EPS/DPS、总市值（百万元）、总股本（百万股）等扩展字段（均可选，映射自 feed）
- `CorporateAction[]`：分红、拆合股、供股、送股等企业行动
- `TradingCalendar[]`：交易日、半日市、休市状态

## 能力状态标记（CapabilityMatrix）

- 状态枚举：`supported`、`partial`、`unsupported`
- 适用维度：市场（A/HK/US）x 能力（quote/kline/financial/calendar/action）
- 规则：能力不足必须显式标注，不允许静默降级

## HTTP/MCP 语义一致性要求

- 同一输入参数在 HTTP/MCP 产出同构语义（字段含义、单位、时区一致）
- 允许差异：上游返回延迟或覆盖率差异，但需通过 `capability_flags` 显式暴露
- 验证方式：conformance tests 对齐关键接口（`getInstrument/getQuote/getKlines` 起步）

## Phase1A（结构化采集）调用方式

- 聚合入口：`@trade-signal/research-strategies` 的 `collectPhase1ADataPack(provider, input)`
- 标准输出：`DataPackMarket`（最小必含 `instrument/quote/klines`）
- 可选输出：`financialSnapshot/corporateActions/tradingCalendar`
- 降级策略：`optionalFailure: "ignore" | "throw"`（默认 `ignore`，即可选项失败时省略该字段）

通道切换（provider 选择）：

- HTTP：`@trade-signal/provider-http` 的 `createFeedHttpProviderFromEnv()`
- MCP：`@trade-signal/provider-mcp` 的 `createFeedMcpProviderFromEnv(callTool)`

示例（伪代码）：

```ts
import { collectPhase1ADataPack } from "@trade-signal/research-strategies";
import { createFeedHttpProviderFromEnv } from "@trade-signal/provider-http";

const provider = createFeedHttpProviderFromEnv();
const dataPack = await collectPhase1ADataPack(provider, {
  code: "SH600519",
  period: "day",
  from: "2024-01-01",
  to: "2024-12-31",
});
```

**`workflow:run` 编排**：当前固定使用 HTTP `createFeedHttpProviderFromEnv()` 采集 Phase1A，需配置 `FEED_BASE_URL`。若要在编排链路中用 MCP 采结构化数据，需在自定义代码中传入 `FeedMcpProvider`。

## Phase1B（外部信息补全）调用方式

- 聚合入口：`collectPhase1BQualitative(input, options)`（默认 `channel=http`）
- 渲染入口：`renderPhase1BMarkdown(supplement)`
- 章节覆盖：§7 管理层与治理、§8 行业与竞争、§10 MD&A 摘要
- 来源约束：每个条目保留来源 URL；未命中时标记 `⚠️ 未搜索到相关信息`

依赖的 feed 配置（HTTP）：

- `FEED_BASE_URL`
- `FEED_API_KEY`（可选）

说明：

- HTTP API 基础前缀固定为 `/api/v1`（代码内置默认）
- Phase1B 检索 endpoint 固定为 `/stock/report/search`（代码内置默认）
- Phase0 在未提供 `--url` 时复用同一检索端点做年报 PDF 自动发现（需 `FEED_BASE_URL`）；失败需手动传 PDF 直链

MCP 场景（AI/Agent）：

- 设置 `input.channel = "mcp"`
- 通过 `options.mcpCallTool` 注入 MCP `callTool` 实现
- 可选 `options.mcpToolName`（默认 `search_stock_reports`）

## 不做事项

- 不在策略层直接拼接上游字段
- 不在业务文档中暴露上游供应商命名

## 质量门禁（v0.1 当前实现）

- **全量**：`pnpm run quality:all`  
  顺序为：`quality:conformance` → `quality:contract` → `quality:regression` → `quality:phase3-golden`。

- **conformance**：`pnpm run quality:conformance`  
  - 以同源 fixture 驱动已构建的 `provider-http` 与 `provider-mcp`，校验 `instrument/quote/klines/financial/corporateActions/tradingCalendar` 的语义一致性（不访问真实 Feed）。

- **contract**：`pnpm run quality:contract`  
  - 读取 `output/phase3_golden/cn_a/data_pack_market.md` 与 `output/phase3_golden/cn_a/run/valuation_computed.json`，校验关键字段/结构与方法枚举。

- **regression**：`pnpm run quality:regression`（默认 `--suite all`，覆盖 **cn_a + hk**）  
  - 使用各套件下 `data_pack_market.md` + `data_pack_report.md` 重跑 Phase3，将生成物与 `run/` 下基线做规范化哈希对比。可选：`--suite cn_a|hk|all`。

- **phase3-golden**：`pnpm run quality:phase3-golden`（默认 `--suite all`）  
  - 依次校验 `output/phase3_golden/<suite>/run/golden_manifest.json` 清单内各文件的 **sha256 + 字节数**。也可用 `--manifest <path>` 指定单个 manifest（忽略 `--suite`）。

**依赖**：`contract`、`regression`、`phase3-golden` 均要求仓库内已存在 `output/phase3_golden/cn_a/` 与 `output/phase3_golden/hk/`（及其中 `run/` 基线）。本仓库已跟踪该目录；若你本地缺失（例如误删 `output/`），在根目录执行：`pnpm --filter @trade-signal/research-strategies run build` 后 `pnpm --filter @trade-signal/research-strategies run gen:phase3-golden` 可重新生成同名基线。

**港股说明**：`hk` 黄金样例用于回归一致性；港股侧与 A 股同等深度的业务语义与专项验证 **暂未实现**，后续里程碑会单独补齐。

## 相关文档

- [流程与 CLI](./workflows.md)
- [系统架构](../architecture/system-architecture.md)
