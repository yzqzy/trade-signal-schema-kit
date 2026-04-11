# 数据源与字段契约

[返回 README](../README.md) · [文档索引](./README.md)

## 数据接入原则

- 上层只依赖标准字段，不依赖上游原始字段名
- 数据统一由 `trade-signal-feed` 提供
- 同一查询在 HTTP/MCP 两种通道语义一致

## 当前通道

- 主通道：`HTTP API`
- 协同通道：`MCP`
- 统一入口：`MarketDataProvider`

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
- `FinancialSnapshot`：估值与筛选所需财务核心字段
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

## 不做事项

- 不在策略层直接拼接上游字段
- 不在业务文档中暴露上游供应商命名
