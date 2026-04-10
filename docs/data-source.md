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

## 不做事项

- 不在策略层直接拼接上游字段
- 不在业务文档中暴露上游供应商命名
