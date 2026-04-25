# 入口与 AI 叙事契约（单一路径）

[返回文档索引](../README.md) · [流程真源](./workflows.md)

本仓库与参考项目（`references/projects/Turtle_investment_framework`）对齐：**确定性证据管线由 TypeScript/CLI 执行；六维定性终稿与叙事收口在 Claude Code（Slash / Skills / 会话内 Agent）完成。**`@trade-signal/research-runtime` **不包含**直连 Anthropic/OpenAI 等模型厂商 HTTP/SDK 的「自动叙事」能力。

## 术语

| 术语 | 含义 |
|------|------|
| **evidence-pack（证据包）** | `data_pack_market.md`、可选 `data_pack_report.md`、`phase1b_qualitative.*` 等可重复、可门禁的产物 |
| **cli-evidence-only** | 仅通过 `pnpm run …` 跑编排时的语义：产出证据与工程合并稿，**不宣称**已完成「AI 六维终稿」 |
| **final-narrative（终稿叙事）** | **V2 专题 ID**：`topic:business-six-dimension`。落地文件仍为 **`qualitative_report.md` / `qualitative_d1_d6.md`**（**`/business-analysis`** 路径），由 **Claude** 写回：**正文仅 `[E*]`/`[M:§x]`**，**裸 URL 只在附录**；含 **监管与合规要点**、**附录：证据索引**、按需缺口与 PDF 声明；终稿完成态受 **PDF 是否存在 / gateVerdict** 约束（见下文）。对外「含六维的全流程完成」以站点发布集合是否包含该 **Topic** 为准（见 [v2-flow-topology](../architecture/v2-flow-topology.md)）。 |
| **SelectionResult（选股分支）** | **V2**：`SelectionLayer` 产出候选池与排序（如 screener）；**不得**视为 Topic 子树。候选可 **按需** 触发额外 **TopicReport** 下钻（非强制全量）；证据链仍须满足 [v2-domain-contract](../architecture/v2-domain-contract.md)（经 Feature → Policy）。 |
| **report-polish（发布型多页稿）** | **`/workflow-analysis`** 在 Phase3 后由 TS 落盘：`report_view_model.json` + `turtle_overview.md` 等四页 Markdown；经 `reports-site:emit` 进入研报站；**不是** `final-narrative`，也**不**替代六维终稿 |

## 入口矩阵

| 入口 | 主要职责 | 是否终稿叙事入口 |
|------|-----------|------------------|
| `/business-analysis` / `business-analysis:run` | PDF 链 + Phase1A/1B/2A/2B，产出证据与定性草稿文件 | **Slash 路径**：默认包含你在会话中执行的 **AI 收口**（见下节）；**纯 CLI**：cli-evidence-only |
| `/workflow-analysis` / `workflow:run` | 全链路至 `analysis_report`、估值、manifest，并 **report-polish** 四页 Markdown + `report_view_model.json` | **发布型终稿**以 report-polish + `reports-site:emit` 为准；**六维定性终稿**仍仅由 **`/business-analysis` + `business-analysis-finalize`** 承担（与 [Agent 编排与 TS 主链](../strategy/agent-framework-comparison.md) 分工一致） |
| `/valuation` / `valuation:run` | 估值 JSON/摘要（可选 full report） | **否** |
| `/download-annual-report` / `phase0:download` | 年报 PDF 获取与缓存 | **否** |
| `reports-site:emit` / `sync:reports-to-app` | 将单次 run 聚合为研报站静态数据（`content.md` v2，见 [reports-site-publish](./reports-site-publish.md)） | **否** |

## 推荐执行顺序（与 reference 一致）

### 商业分析（`/business-analysis`）

1. **证据产物**（CLI 或 Slash 触发的同一套编排）：`data_pack_market.md` +（有 PDF 时）`data_pack_report.md` + `phase1b_qualitative.{json,md}` 等。
2. **AI 六维叙事收口（Claude）**：在 Claude Code 会话中，执行 skill `business-analysis-finalize`（入口：`.claude/skills/business-analysis-finalize/SKILL.md`；**硬约束全文**：[skill-shared-final-narrative-criteria.md](./skill-shared-final-narrative-criteria.md)、[skill-shared-pdf-gate-semantics.md](./skill-shared-pdf-gate-semantics.md)），用证据包与 Phase1B 结构生成终稿叙事，**写回** run 目录下的：
   - `qualitative_report.md`（终稿）
   - `qualitative_d1_d6.md`（填充稿，替换仅表格/骨架占位）
3. 若需全链路或估值，再按 manifest 建议命令衔接 `/workflow-analysis` 或 `/valuation`。

### 全流程（`/workflow-analysis`）

1. 跑 CLI 编排至 manifest、`analysis_report.md`、`valuation_computed.json` 与 **report-polish** 产物（四页 Markdown + `report_view_model.json`）。
2. 若需进研报站：对 run 根目录执行 `pnpm run reports-site:emit -- --run-dir …`，再 `pnpm run sync:reports-to-app`（见 [reports-site-publish](./reports-site-publish.md)）。
3. 若仍需 **六维定性终稿**（`qualitative_report.md` / `qualitative_d1_d6.md`）：请走 **`/business-analysis`** 并在会话内执行 **`business-analysis-finalize`**；**不要**用 workflow 会话写回替代 report-polish 发布稿。

## 输出矩阵（证据包 vs 终稿）

| 文件 | CLI 典型内容 | Claude 收口后期望 |
|------|----------------|-------------------|
| `data_pack_market.md` | 结构化市场证据 | 保持为证据源，一般不覆盖叙事 |
| `data_pack_report.md` | 年报提取证据（若有） | 同上 |
| `qualitative_report.md` | Phase1B 合并与模板段落（**非**终稿叙事承诺） | 六维叙事终稿 + **监管与合规要点** + **`## 附录：证据索引`**（`[E*]` 全表）+ 按需 **证据缺口清单** / **PDF 声明**；**正文不出现 `http://` / `https://`**，附录按“本地路径优先、必要时外链” |
| `qualitative_d1_d6.md` | 契约骨架 + 摘录 + **发布级结构化参数表（output_schema 键名）** + **数据缺口与补齐建议**（工程拼接） | 各维正文已填充；**每维 ≥1 条 `[E*]` 或 `[M:§x]`**；**附录证据索引**；无大面积「待补全」类占位；结构化参数表的 `value` 列须由会话按证据填写（禁止空造数） |

## 失败语义

| 场景 | 行为 |
|------|------|
| **Claude 路径**：证据不足或无法负责任写终稿 | **不得**宣称「已完成终稿」；应明确列出缺失证据或需用户补充的输入 |
| **CLI 路径**：编排 fail-fast（strict、preflight 等） | 按既有前缀报错（`[strict:business-analysis]`、`[strict:workflow:strict]` 等），产物可能不完整；**不**将 CLI 成功等同于终稿叙事完成 |

## 「终稿完成」硬验收清单（business-analysis）

以下**全部满足**才可对外称 **final-narrative 已完成**并使用 **`[终稿状态: 完成]`**；否则须 **`[终稿状态: 阻断]`**（细则见 [skill-shared-final-narrative-criteria.md](./skill-shared-final-narrative-criteria.md) 与 skill 入口 `.claude/skills/business-analysis-finalize/SKILL.md`）。

1. **呈现**：`qualitative_report.md` 与 `qualitative_d1_d6.md` **正文无裸 URL**；均有 **`## 附录：证据索引`**（`[E*]` / `[M:§x]` 映射完整）。
2. **`qualitative_d1_d6.md`**：`D1`~`D6` 每节至少 **1** 条 **`[E*]`** 或 **`[M:§x]`**。
3. **`qualitative_report.md`**：存在 **`## 监管与合规要点`**，且小节内关键结论均有 **`[E*]`**（或 `[M:§x]`）。
4. **缺口**：`phase1b_qualitative.md` 中凡 **`⚠️ 未搜索到相关信息`**，终稿须有 **`## 证据缺口清单（Phase1B）`**。
5. **PDF 与完成态**：若无 `data_pack_report.md`，或 `gateVerdict` 为 **`CRITICAL`**，须按 skill 写 **`> …` 声明`，且 **不得**标 **`[终稿状态: 完成]`**（须阻断）。若 `gateVerdict` 为 **`DEGRADED`**（仅低置信），须写 **`> PDF 抽取质量声明`**；在满足 skill 其它硬约束时 **允许** **`[终稿状态: 完成]`**。

### 失败示例（不应宣称终稿完成）

- 正文出现 `https://...` 链接列表，或仅有叙述而无 **`## 附录：证据索引`**。
- 宣称「完成」但 **无 `data_pack_report.md`** 却未写 **`> 年报 PDF 未解析…`**。
- `data_pack_report` 为 **CRITICAL** 却未写 PDF 质量声明，或仍标 **`[终稿状态: 完成]`**。
- `data_pack_report` 为 **DEGRADED** 却未写 **`> PDF 抽取质量声明`** / 未标注置信边界，却标 **`[终稿状态: 完成]`**。

## 000021 验收示例（人工核对）

在任意一次以 `000021` 为标的的 run 目录下（如 `output/business-analysis/000021/<runId>/`）：

1. **保留证据**：存在 `data_pack_market.md`；若 PDF 链成功则存在 `data_pack_report.md`。
2. **终稿形态**（须经过 Claude 收口，非仅 CLI）：打开 `qualitative_report.md`，确认主体为 **六维叙事终稿**，而非大面积 Phase1B 原始表格占位；并核对上文 **「终稿完成」硬验收清单**（监管与合规小节、缺口清单、PDF 质量声明）。
3. **D1–D6**：打开 `qualitative_d1_d6.md`，确认各维 **有实质正文**，无大面积「待补全正文」类提示；**每维至少一条 `[E*]` 或 `[M:§x]`**，且附录索引可回溯。
4. **与 Phase1B 对齐**：若 `phase1b_qualitative.md` 含监管/内控/关联交易等表格条目，终稿「监管与合规要点」应能映射到相应结论或明确列入证据缺口（不得静默消失）。

### 样例目录 `457122b1-8987-409c-86e9-b697bccdb81c`（对齐说明）

仓库内该 run 的终稿文件会随契约迭代**重写为**：正文 **`[E*]`**、文末 **`## 附录：证据索引`**、**`## 监管与合规要点`**、按需 **缺口清单** 与 **PDF 声明**。若 `data_pack_report` 为 **DEGRADED**，须在声明中写清低置信章节与复核优先级；**允许**在满足 skill 硬约束时标 **`[终稿状态: 完成]`**（与旧版「一律阻断」不同，以 skill 为准）。

### 样例目录 `300770/c53b6fff-...`（无年报包）

该 run **无 `data_pack_report.md`**（见 `phase3_preflight.md`），终稿须 **`> 年报 PDF 未解析…`**，且 **`[终稿状态: 阻断]`**；D5 仅允许预研级结论。

> CI 门禁无法代替上述人工终稿验收；门禁负责证据结构与链路回归。

## 相关文档

- [workflows.md](./workflows.md) — Stage/Phase、产物路径、续跑
- [data-source.md](./data-source.md) — Feed、WebSearch 与最小实操三步法
- 根目录 [README.md](../../README.md) — 首屏入口
