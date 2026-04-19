# Feed 缺口契约（Feed-first）

## 目的

在 **不静默补数、不外网自动拉取** 的前提下，由工程层从 `data_pack_market.md` 等产物推断 **数据与占位缺口**，并写入固定 Markdown 小节：

```markdown
## 数据缺口与补齐建议
```

实现：`packages/research-strategies/src/crosscut/feed-gap/feed-gap-contract.ts`。

## 分级

| 级别 | 含义 | 典型行为 |
|------|------|----------|
| **阻断级** | 缺关键前提，同业/周期或深度交叉验证无法结构化绑定 | 行业未知且无 feed 分类；缺 `data_pack_report` |
| **降级级** | 主结论仍可能产出，但置信度或维度完整度下降 | §8/§4P 占位、K 线窗口空、过多 `[估算]` |
| **提示级** | 增强叙事或可选监控 | 无风险利率占位、前十大股东 feed 未接 |

## 接入点

- `business-analysis`：`qualitative_report.md` / `qualitative_d1_d6.md` 文末拼接（若已有该二级标题则跳过）。
- `workflow` Stage E：`analysis_report.md` / `.html` 基于带缺口小节的 Markdown 渲染。
- `phase3-run` / `valuation --full-report`：与 workflow 一致。

## 类型契约（schema-core）

`FeedDataGap` / `FeedDataGapSeverity` 定义于 `@trade-signal/schema-core`，供将来 manifest JSON 扩展复用。

## 与 Phase3 Preflight 的关系

`evaluatePhase3Preflight` 仍负责 **SUPPLEMENT / ABORT** 三态与补救检索建议；`evaluateFeedDataGaps` 负责 **用户可读缺口表** 与「数据边界」审计，二者互补，不互相替代。
