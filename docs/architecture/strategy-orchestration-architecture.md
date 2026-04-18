# 策略与流程解耦（定稿）

[返回项目首页](../../README.md) · [文档索引](../README.md)

## 目标

- **Turtle** 是**策略插件**，不是整条流水线的本体；通用流程由 **Stage A~E** 描述。
- 上层保留通用编排骨架，支持接入更多策略（价值、成长、红利、事件驱动等）。
- **CLI 与产物契约保持稳定**：演进以「接口先行 + 分阶段落地」为原则，避免大范围破坏性改名。

## 关键结论

- `Phase 0/1/2/3` 本质是**通用处理阶段**（实现命名），与策略无关。
- Turtle 特有的是：规则集、阈值、提示词模板、评分/否决逻辑、**C2 证据槽位映射**等。
- 推荐采用**双层架构**：
  1. **通用编排层**（可恢复、可审计、schema 化 I/O）
  2. **策略插件层**（`StrategyPlugin`：Turtle / 其他策略）

## Claude Code 与图编排（分层，勿混用）

- **Claude Code**：IDE 侧深度定性、六维契约与 PDF 对照（Skills / slash commands）。
- **LangGraph**：TS 主链全流程状态编排（阶段、分支、checkpoint、重试、审计）。

外层用 LangGraph 跑 Stage；定性 narrative 在 **Claude Code** 完成。选型见 [Agent 编排框架选型](../strategy/agent-framework-comparison.md)。

## 阶段映射（Phase ↔ Stage）

| 当前术语 | 抽象术语 | 职责 | 是否策略相关 |
|---|---|---|---|
| Phase 0 | Stage A: ReportAcquire | 报告发现/下载/缓存 | 否 |
| Phase 1A | Stage B: StructuredCollect | 标准字段采集与归一化 | 否 |
| Phase 1B | Stage C: ExternalEvidence | 外部证据（C1 通用 + C2 策略投影） | C1 否 / C2 是 |
| Phase 2A/2B | Stage D: ReportExtract | PDF 章节定位与提取 | 否 |
| Phase 3 | Stage E: StrategyEvaluate | 策略计算/决策/渲染 | 是（核心） |

实现侧可长期保留 `Phase` 命名；文档与编排设计以 **Stage** 为语义真源。

## ExternalEvidence 分层（C1 / C2）

`Stage C` 不是纯策略层，拆为两层：

- **C1 通用证据采集（非策略）**  
  外部来源采集、去重、时间排序、来源可信度标注；输出统一证据对象，**不含策略判断**。

- **C2 策略证据投影（策略相关）**  
  按策略需求筛选/映射证据槽位（例如 Turtle D1~D6）；**仅在本层写策略语义**，不回写 C1 原始证据。

新增策略时：**复用 C1，只替换或扩展 C2**。

## PDF 与 Stage 顺序（目标架构 vs 当前实现）

**目标（有 `--pdf` 或 `--report-url`）**：`A → B → D → C → E`  
先完成报告结构化（D），再做外部证据（C），降低后续推理漂移。

**无报告源**：`A → B → C → E`。

**当前 `workflow:run` 实现**：有年报 PDF 路径时为 **`B → D → C → E`**；无年报 PDF 时为 **`B → C → E`**。详见 [流程说明（Stage）](../guides/workflows.md) 与 [契约基线](./contract-baseline.md)。

## 接口边界

### `StrategyPlugin`（实现见 `packages/research-strategies/src/strategies/contracts.ts`）

```ts
export interface StrategyPlugin {
  readonly id: string;
  readonly version: string;
  supports(context: StrategyEvaluationContext): boolean;
  evaluate(context: StrategyEvaluationContext): Phase3ExecutionResult;
  /** 可选：Stage E 前由编排调用；例如 turtle-strict 下要求已存在报告包 Markdown */
  validateStageEPrerequisites?(context: StrategyStageEPrerequisitesContext): void;
}
```

### `OrchestratorAdapter`

```ts
export interface OrchestratorAdapter {
  runStages(input: PipelineInput, strategyId: string): Promise<PipelineOutput>;
  resume?(runId: string, fromStage: string): Promise<PipelineOutput>;
}
```

**约束**：

- `StrategyPlugin` **不直接消费**上游原始字段，只消费 **标准字段契约**（与 `data_pack_*` 对齐）。
- 各 Stage 输入/输出 **schema 化**（建议 Zod）；中间产物 **强制落盘**（JSON/Markdown）以支持恢复与审计。

## Monorepo 目录与边界（与当前仓库对齐）

- `packages/research-strategies/src/app/`：对外用例编排（workflow / business-analysis / valuation / report-to-html）
- `packages/research-strategies/src/orchestrator/`：LangGraph 图、状态、checkpoint、编排适配器（**不含策略实现**）
- `packages/research-strategies/src/stages/phase*`：阶段执行器（Phase0~Phase3）
- `packages/research-strategies/src/strategies/`：`contracts.ts`、`registry.ts`、平行策略目录（如 `turtle/`、`value-v1/`）
- `packages/research-strategies/src/contracts/`：跨层契约类型（如 `workflow-run-types.ts` / `RunWorkflowInput`）
- `packages/research-strategies/src/cli/`：Node CLI 入口（`run:*` 脚本指向构建产物）
- `packages/core-schema/`（包名 `@trade-signal/schema-core`）：通用契约，**不放策略私有字段**

## 新增策略接入流程（非 Turtle）

1. **定义策略 ID 与版本**，实现 `StrategyPlugin`（`supports` / `evaluate` / 可选 `render`）。
2. **实现 C2**：将策略所需的证据槽位从 C1 输出投影为策略上下文（不与 C1 混写）。
3. **注册策略**：在 `packages/research-strategies/src/strategies/registry.ts` 将 `strategyId` 映射到插件实现；编排层仅解析 ID（CLI 已支持 `--strategy <id>`，与 `--mode` 等参数共存演进）。操作步骤见 [策略注册指南](../guides/strategy-registration.md)。
4. **契约对齐**：仅使用标准字段；需要新字段时走 **schema-core 变更**，而非在插件内引用 feed 原始键。
5. **质量门禁**：通用门（conformance / contract / regression / golden）照跑；策略专有规则单独目录或 manifest（按 `strategyId` 分类）。

## 演进路线（分阶段）

1. **接口先行**：抽象 `StrategyPlugin` / `OrchestratorAdapter`；Turtle 以插件形态接入，输出与当前一致。
2. **编排抽离**：Stage 显式化、runId / stageStatus / checkpoint，支持失败恢复。
3. **第二策略样板**：轻量策略（如 `value_v1`）验证多策略共存与同契约。
4. **质量分层**：通用质量门 + 按策略 ID 的策略基线。

## 质量与验收（DoD）

- 通用编排与单一策略实现解耦：**新增策略不改 LangGraph 主流程核心代码**，在 `strategies/registry.ts` 注册并扩展策略目录即可。
- CLI 兼容：既有命令可用；新策略通过 **`--strategy` 或同类策略开关**扩展。
- 支持从中间阶段恢复（至少从 Stage B 或 D 重跑）。
- 文档之间应一致：[workflows](../guides/workflows.md)、[data-source](../guides/data-source.md)、[contract-baseline](./contract-baseline.md)、本文件、[agent 选型](../strategy/agent-framework-comparison.md)。

## 与现状兼容说明

- `apps/screener-web` 冻结策略不变（独立域，见 [流程文档](../guides/workflows.md) 选股器章节）。
- **不要求**立即全局把 `Phase` 改名为 `Stage`；语义以本文 Stage 为准即可。

## 文档职责划分（不合并）

- [agent-framework-comparison.md](../strategy/agent-framework-comparison.md)：框架选型、PoC 范围、Deep Agents vs LangGraph。
- **本文件**：业务阶段抽象、策略插件化、C1/C2、编排边界。

二者互相链接，维护时各改各的职责范围。
