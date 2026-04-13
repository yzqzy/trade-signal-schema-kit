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
- 同一查询在 HTTP/MCP 通道输出保持一致（由 `quality:conformance` 等在 fixture 上校验）
- 策略规则可替换，数据与报告契约保持稳定

## 编排与通道（当前实现要点）

- **`workflow:run`**：Phase1A 固定经 **HTTP** `FeedHttpProvider`（`FEED_BASE_URL`）；Phase1B 默认 HTTP，可在代码中切换 MCP 并注入 `mcpCallTool`。
- **双通道切换**：独立脚本或库代码可任选 `createFeedHttpProviderFromEnv()` / `createFeedMcpProviderFromEnv(callTool)`；并非所有编排入口都已暴露「运行时切换」。
