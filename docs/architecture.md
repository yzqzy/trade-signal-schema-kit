# 系统架构说明

[返回 README](../README.md) · [文档索引](./README.md)

`trade-signal-schema-kit` 采用三层结构：

1. 研究流程层：负责策略、估值、筛选、报告编排
2. 标准字段层：统一领域模型与 `MarketDataProvider` 契约
3. 数据接入层：`feed` 的 HTTP/MCP 双通道适配

其中研究流程层支持“策略注册”模式：在统一流程骨架下挂接不同策略实现，避免框架被单一策略绑定。

## 架构图

```text
research-strategies + reporting
            │
        schema-core
            │
    ┌───────┴────────┐
 provider-http   provider-mcp
            │
      trade-signal-feed
```

## 设计边界

- 研究流程层只消费标准字段，不引用上游原始字段
- 适配器层负责数据映射、错误转换、语义对齐
- 同一查询在 HTTP/MCP 通道输出保持一致
- 策略规则可替换，数据与报告契约保持稳定
