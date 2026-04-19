---
name: business-analysis-finalize
description: "PDF-first：TS 跑证据链；默认在同一会话用 Claude 完成六维终稿写回（qualitative_report / qualitative_d1_d6）。"
---

# business-analysis-finalize 执行规范

> 由入口 `/business-analysis` 默认调用；该 skill 只定义 AI 收口执行规范，不定义用户入口参数。

## 架构边界

- **TS/CLI**：只做 **evidence-pack** 与确定性合并（**cli-evidence-only**），不调 Anthropic/OpenAI HTTP/SDK 做「自动叙事」。
- **Claude（本 skill）**：编排成功后 **默认**执行 **final-narrative** 收口（非可选增强），写回终稿文件。

契约：[docs/guides/entrypoint-narrative-contract.md](../../docs/guides/entrypoint-narrative-contract.md)。

## 终稿呈现：正文 `[E*]` + 附录证据索引（强制）

- **`qualitative_report.md` 与 `qualitative_d1_d6.md` 正文**（除附录表格外）：**禁止**出现裸 URL（`http://` / `https://`）；**禁止**在正文堆多行「根据 Phase1B…」+ 链接列表。结论句旁仅保留 **`[E1]`…`[En]`** 或 **`[M:§x]`**（市场包章节简引，须在附录展开为 `data_pack_market.md` 路径）。
- **文末必须**有 **`## 附录：证据索引`**（Markdown 表格），列：`证据ID | 类型（PDF/公告/市场包） | 摘要 | 链接或定位`。**路径优先**：先写本地证据路径（如 `data_pack_report.md` / `phase1b_qualitative.md`）+ 章节/页码；仅当本地文件无法承载原始出处时再保留外链。PDF 定位写 `p.N`，市场包写文件内章节。同一 run 内两份终稿 **优先共用一套 `E` 编号**。
- **软约束**：完成硬约束后，可选 **`## 终稿自检（软）`**（1～5 分），不阻断。

## PDF 与「终稿完成」语义（默认尝试 + 分级门禁）

- **编排层（CLI）**：无 `--pdf`/`--report-url` 时已 **best-effort** Phase0 拉取年报并跑 Phase2B（见 command）；收口前仍须在会话内打开 run 目录 **`data_pack_report.md`**（若存在）核对 **`gateVerdict`**、`allowsFinalNarrativeComplete`、`data_pack_report` 头部 **`pdfTextBackendsUsed`** 与低置信/缺失提示。
- **不得标 `[终稿状态: 完成]`** 的情形（须 **`[终稿状态: 阻断]`** 并写清原因）：
  1. **不存在** `data_pack_report.md`（未解析出年报包）：须正文显著位置 **`> 年报 PDF 未解析：本 run 无 data_pack_report.md`**，并提示 `--strict` / `--pdf` / `phase0:download` 补链。
  2. `gateVerdict` 为 **`CRITICAL`**（关键块 **MDA / P4 / P13** 任一缺失）：编排与终稿均视为硬不合格。
- **`gateVerdict` 为 `DEGRADED`（仅关键块低置信，块仍在）**：
  - **允许**在满足下文 **硬约束** 的前提下标 **`[终稿状态: 完成]`**；
  - **必须**在两份终稿显著位置写 **`> PDF 抽取质量声明`**（说明 `DEGRADED`、低置信章节、`humanReviewPriority` 建议复核顺序、**不得将附注数字细节当高置信事实**），并引用 `data_pack_report` 中对应警告行；
  - 须在叙事中反复标注**结论置信边界**（哪些来自市场包 `[M:§x]`、哪些来自 PDF `[E*]`、哪些仍依赖人工复核）。
- 凡 **无 `data_pack_report`** 或 **`gateVerdict` 为 `CRITICAL`** 时，不得宣称「终稿证据已充分核验」或对外等价措辞。

## 终稿硬约束（可审计底线，不满足则不得宣称「终稿完成」）

写回前自检；任一硬项未满足时，**不得**在对话或文件元信息中宣称终稿已完成，须改用下方「阻断模板」并在文件中写明 **`[终稿状态: 阻断]`**（或等价措辞）。

### 1) D1~D6 证据底线（`qualitative_d1_d6.md`）

- 每个 **`## D1` … `## D6`** 下须同时包含：
  - **核心判断**（可短）
  - **证据链条**：**至少 1 条**可追溯引用，格式为 **`[E*]`**（映射附录）和/或 **`[M:§x]`**（仅当该维主要依据为 `data_pack_market.md`）。**禁止**在证据链条中写裸 URL；**禁止**仅用「Phase1B 检索」而无对应 **`[E*]`**。
  - **结论**（与证据对齐，不夸大）
- **深度叙事**：在证据允许范围内，每一维还须尽量包含（无证据则写入缺口，不得编造）：
  - **反证 / 情景分析**：至少一段「若关键假设不成立会怎样」；
  - **可跟踪指标表**：用小 Markdown 表列出 3～8 个后续季度/年度要跟的指标（名称、为何重要、当前从证据读到的区间或趋势、信息来源 `[E*]`/`[M:§x]`）；
  - **与 PDF 附注的勾稽**：凡涉及应收、非经、关联交易、资本开支等，优先引用 `data_pack_report` 对应块；若该块 `LOW_CONFIDENCE` / `SECTION_MISSING`，必须在当节写明并降级结论。
- 禁止保留大面积 **`待补全正文`** 或空壳占位；若某维证据确实不足，该维结论必须降级为「**证据不足，待补**」，并指向具体缺口（见 §3）。

### 2) 监管与合规强制段（`qualitative_report.md`）

在叙事主体中须包含**独立小节**（建议标题 **`## 监管与合规要点`**，置于「结论/投资建议」之前），且**每条结论须带至少 1 条 `[E*]`**（或 `[M:§x]` + 附录展开）。该小节至少覆盖下列维度中**在证据包内已有信息**的子项（无信息则写入缺口清单，不得静默省略）：

- 处罚 / 监管措施 / 整改（含「报告期内无」类否定结论，须引用年报或 Phase1B 来源）
- 重大诉讼 / 仲裁（同上）
- 内控审计 / 审计师 / 审计意见（若年报有披露）
- 关联交易规模、审议与定价口径（可与「关联交易」章节合并，但须保留可追溯引用）
- 治理结构近期重大变化（章程/委员会条例/股东大会等，以证据包为准）

### 3) 缺口显式化（两份终稿文件均需体现）

- 若 `phase1b_qualitative.md`（或 json）某格为 **`⚠️ 未搜索到相关信息`**：在 `qualitative_report.md` 末尾增加 **`## 证据缺口清单（Phase1B）`**，逐条列出维度与「未检索到」事实，**不得**假装已覆盖。
- 若 `data_pack_report.md` 含 **`gateVerdict` 为 `CRITICAL`**，或正文有 Phase2B **章节缺失**警告：在 `qualitative_report.md` 与 `qualitative_d1_d6.md` 中均须 **`> PDF 抽取质量声明`**，且 **不得**标 **`[终稿状态: 完成]`**。
- 若 **`gateVerdict` 为 `DEGRADED`**（仅低置信）或正文有 Phase2B **低置信**警告：两份终稿仍须 **`> PDF 抽取质量声明`**（说明 `humanReviewPriority`、低置信块、**不得将附注数字细节当高置信事实**）；在满足本节其它硬约束时可标 **`[终稿状态: 完成]`**。

### 4) `qualitative_report.md` 主文深度

- **六维结构**：须有清晰 **D1～D6 对应叙事**（可用二级标题或段落标题对齐 Turtle 六维），每维至少 **「结论 + 证据 + 不确定性」** 三层；**禁止**仅列要点无论证。
- **关键表格 / 指标**：至少一处 **盈利质量**（毛利率/费用/非经）、一处 **营运与现金流**（存货、应收、Capex/折旧若证据有）、一处 **资本与回报**（ROE/杠杆/分红若证据有）；以 **Markdown 小表** 呈现，表内数字旁仍用 `[E*]` / `[M:§x]` 脚注式引用（表下用一句话映射附录行号或 PDF 页码）。
- **可读性**：适当分段、加粗关键判断句；避免 Phase1B 式长链接列表。

### 5) 「终稿完成」判定

仅当 **§0（呈现）+ §1～§5 + 上文「PDF 与终稿完成语义」** 全部满足时，方可使用 **`[终稿状态: 完成]`**。否则文件末尾须为 **`[终稿状态: 阻断]`**，并在对话中说明阻断原因。

## 阻断模板（复制到对话或 `qualitative_report.md` 文首说明块）

```markdown
[终稿状态: 阻断]

**原因**（勾选适用项并展开）：
- [ ] 正文出现裸 URL 或未提供「附录：证据索引」
- [ ] D1~D6 某一维缺少可追溯的 `[E*]` / `[M:§x]` 映射
- [ ] `qualitative_report.md` 缺少「监管与合规要点」或该小节结论无 `[E*]`
- [ ] Phase1B 存在「未搜索到相关信息」但未写「证据缺口清单」
- [ ] 无 `data_pack_report.md` / `gateVerdict` 为 **CRITICAL**，但未按「PDF 与终稿完成语义」写声明
- [ ] `gateVerdict` 为 **DEGRADED** 却未写 **`> PDF 抽取质量声明`** 或未标注结论置信边界

**下一步**：补 PDF / 扩大 Phase1B 检索 / 人工核对 `data_pack_report.md` 标疑段落后再执行收口。
```

## 软约束（不阻断）

见上文「终稿呈现」节末；完成硬约束后可选 **`## 终稿自检（软）`**。

## 顺序（与实现一致）

1. **Stage A / PDF**：无 `--pdf`/`--report-url` 时，在 run 目录下按 Feed **自动发现**年报 URL 并 Phase0 下载（**非 `--strict`** 为 best-effort；**`--strict`** 为强制，失败 fail-fast）。与 `workflow --mode turtle-strict` 共用 `ensureAnnualPdfOnDisk` 语义。
2. **Phase 1A**：结构化市场数据 → `data_pack_market.md`。
3. **Phase 2A/2B（有本地 PDF 时）**：精提取 → `data_pack_report.md`。
4. **Phase 1B**：HTTP/MCP 检索补充 → 合并写入 `qualitative_report.md`（§7/§8/§10）与 `qualitative_d1_d6.md`（含可选 `data_pack_report` 摘录）——此为 **草稿/证据合并**，**不等于**终稿叙事。
5. **AI 六维终稿（Claude，默认）**：通读 `data_pack_market.md`、（若有）`data_pack_report.md`、`phase1b_qualitative.md`，将 `qualitative_report.md` 写为 **六维叙事终稿**，将 `qualitative_d1_d6.md` 各维写为 **实质正文**（去掉「待补全」类占位）。若证据不足，**明确阻断**并列出缺口，**不**宣称已完成终稿。

## 降级与告警

- 无可用 PDF：不生成 `data_pack_report.md`；Phase1B 仍为事实补充；D5 **交付级**须有报告包（见 `phase3_preflight.md` 规则 A/B；`qualitative_d1_d6.md` 的 D5 会提示缺口）。
- **`--strict`**：禁止「无报告包」静默成功；自动发现失败、缺少可解析 PDF 或 2B 未产出则 **fail-fast**（规则 C；前缀 `[strict:business-analysis]`），并启用 Phase1A Pre-flight（`[strict:preflight]`）。

## 输出标准

- `qualitative_report.md`：终稿目标为 **六维叙事主文** + **「监管与合规要点」** + 文末 **`## 附录：证据索引`**（`[E*]`/`[M:§x]` 全表）+（按需）**证据缺口清单** / **PDF 声明**（Claude 写回）；CLI 初次落盘可为 Phase1B 合并草稿。
- `qualitative_d1_d6.md`：终稿目标为 **各维已填充** 的 Turtle D1~D6 稿 + 与上同构的 **`## 附录：证据索引`**（可与报告共用 `E` 编号）（Claude 写回）；CLI 初次落盘可为骨架+摘录。
- `phase1b_evidence_quality.json`：§7/§8 证据结构离线指标。
- `business_analysis_manifest.json`：`input.mode` / `input.strategy`、`input.runId` / `input.outputDirParent`、按需写入的 `from`/`to`/`category` 等复跑字段、`pipeline.pdfBranch`、`pipeline.valuation`；`suggestedWorkflowFullCommand` 含 `--run-id` 等与当次 run 对齐的参数。供 `valuation:run --from-manifest`（未传 `--code` 时用 `outputLayout.code` 分区）与全链路衔接。

## 入口映射

- **Claude Code**：`/business-analysis`（推荐）
- **CLI**：`pnpm run business-analysis:run -- ...`（支持 `--strict`、`--mode`、`--strategy`；CI、无 IDE）
