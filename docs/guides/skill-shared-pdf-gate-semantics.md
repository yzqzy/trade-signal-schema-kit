# 共享规范：`data_pack_report` 与 PDF 门禁语义

供 **`business-analysis-finalize`** 等 skill 引用；与 Phase2B / `gateVerdict` 行为一致。

## 收口前必读（会话内）

- 打开 run 目录 **`data_pack_report.md`**（若存在），核对：
  - **`gateVerdict`**、`allowsFinalNarrativeComplete`
  - 头部 **`pdfTextBackendsUsed`**
  - 低置信 / 章节缺失等警告行

## 与「终稿完成」态的关系

### 不得标 `[终稿状态: 完成]`（须 `[终稿状态: 阻断]` 并写清原因）

1. **不存在** `data_pack_report.md`（未解析出年报包）：正文显著位置须有 **`> 年报 PDF 未解析：本 run 无 data_pack_report.md`**，并提示 `--strict` / `--pdf` / `phase0:download` 补链。
2. **`gateVerdict` 为 `CRITICAL`**（关键块 **MDA / P4 / P13** 任一缺失）：编排与终稿均视为硬不合格；两份终稿须有 **`> PDF 抽取质量声明`**（按阻断语义），且 **不得**标 **`[终稿状态: 完成]`**。

凡 **无 `data_pack_report`** 或 **`gateVerdict` 为 `CRITICAL`** 时，不得宣称「终稿证据已充分核验」或对外等价措辞。

### `gateVerdict` 为 `DEGRADED`（仅关键块低置信，块仍在）

- **允许**在满足 [终稿硬约束](./skill-shared-final-narrative-criteria.md) 的前提下标 **`[终稿状态: 完成]`**。
- **必须**在 `qualitative_report.md` 与 `qualitative_d1_d6.md` 显著位置写 **`> PDF 抽取质量声明`**（说明 `DEGRADED`、低置信章节、`humanReviewPriority` 建议复核顺序、**不得将附注数字细节当高置信事实**），并引用 `data_pack_report` 中对应警告行。
- 须在叙事中反复标注**结论置信边界**（哪些来自市场包 `[M:§x]`、哪些来自 PDF `[E*]`、哪些仍依赖人工复核）。

### 章节缺失 / 低置信（正文警告）

- 若正文含 Phase2B **章节缺失**警告：与 **CRITICAL** 对齐处理（见上）。
- 若仅有 **低置信**警告：与 **DEGRADED** 对齐，须 **`> PDF 抽取质量声明`**；满足其它硬约束时可标 **`[终稿状态: 完成]`**。

## 编排层（CLI）提示

- 无 `--pdf`/`--report-url` 时已 **best-effort** Phase0 拉取年报并跑 Phase2B（详见 `/business-analysis` command）。
- **`--strict`**：禁止「无报告包」静默成功；失败 fail-fast（前缀 `[strict:business-analysis]`），并启用 Phase1A Pre-flight（`[strict:preflight]`）。
