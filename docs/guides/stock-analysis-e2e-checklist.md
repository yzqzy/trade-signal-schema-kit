# 个股分析全链路跑通清单（A 股）

[返回文档索引](../README.md) · [返回项目首页](../../README.md)

用于验证：从单只 A 股输入到研究报告输出的完整链路可跑通、可回归。

## 目标

- 验证 CLI 主入口（`phase0` / `business-analysis` / `workflow` / `valuation` / `report-to-html`）可联通
- 验证财务新路径（`financial/snapshot`、`financial/history`）已在 Provider 生效
- 验证 `quality:all` 通过后链路具备可回归性

## 测试样本

- 主样本：`600887`（伊利）
- 补样本：`300798`（创业板）
- 可选边界：`002594`

## 0. 前置环境

- [ ] `pnpm install`
- [ ] `pnpm run build`
- [ ] `FEED_BASE_URL` 可访问
- [ ] （可选）若使用 MCP，确认 MCP 工具可调用

## 1. Phase0（可选）年报下载

执行：

```bash
pnpm run phase0:download -- \
  --stock-code "600887" \
  --category "年报" \
  --year "2024"
```

验收：

- [ ] PDF 成功下载或命中缓存（默认目录：`cache/reports/<代码>/`，已加入 `.gitignore`）
- [ ] 失败时错误信息可读（非 silent fail）
- [ ] 未披露财年：`---RESULT---` 中 `status: NO_DATA`，退出码 `4`；参数/配置问题仍为 `FAILED` + `3`

## 2. Business Analysis 链路（Phase1A/1B + 可选 PDF 分支）

执行：

```bash
pnpm run business-analysis:run -- \
  --code 600887 \
  --year 2024 \
  --output-dir "./output/business-analysis/600887"
```

验收产物（`output/business-analysis/600887/<runId>/`）：

- [ ] `qualitative_report.md`
- [ ] `qualitative_d1_d6.md`
- [ ] `data_pack_market.md`
- [ ] `business_analysis_manifest.json`

财务关键验收：

- [ ] `financialHistory` 至少 2 个独立财年
- [ ] 母公司扩展字段缺失时有 `degradeReasons`

### 2.1 Phase1B 检索质量回归门槛

产物（同目录 `<runId>/`）：`phase1b_qualitative.{json,md}`、`phase1b_evidence_quality.json`（编排与 `business-analysis` 一致时落盘）。

**对照**：同一 `code` / `year`、尽量同一 feed 版本，保留「改造前 vs 改造后」两次 run 目录，对比上述文件及（若已进入 Phase3）`phase3_preflight.md`。

**数值门槛（§7 高敏条目精准命中改造后固化）**：

- [ ] `phase1b_evidence_quality.json` → `section7.topicHitRatio >= 0.80`
- [ ] `phase1b_evidence_quality.json` → `section7.crossItemDuplicateUrlRatio <= 0.35`

**结构 / 人工 spot-check**：

- [ ] `byItem` 覆盖 §7、§8、§10 各检索条目（每行含 `evidenceCount`、`topicHit`）
- [ ] 对照 `phase1b_qualitative.md`：`违规/处罚`、`质押/减持`、`回购` 等条目不应长期出现明显「制度类文档误灌」；空结果优于强误命中时可接受

## 3. Workflow 严格全链路（端到端）

### 3.1 有 PDF 输入

执行：

```bash
pnpm run workflow:run -- \
  --code 600887 \
  --year 2024 \
  --mode turtle-strict \
  --pdf "<annual-report.pdf>" \
  --output-dir "./output/workflow/600887"
```

### 3.2 无 PDF（自动发现）

执行：

```bash
pnpm run workflow:run -- \
  --code 600887 \
  --year 2024 \
  --mode turtle-strict \
  --output-dir "./output/workflow/600887"
```

验收产物（`output/workflow/600887/<runId>/`）：

- [ ] `analysis_report.md`
- [ ] `analysis_report.html`（或由 `report-to-html` 生成）
- [ ] `valuation_computed.json`
- [ ] `workflow_manifest.json`

验收行为：

- [ ] 全流程不中断完成
- [ ] 报告内容覆盖定性 + 定量 + 估值

## 4. 独立估值链路

执行：

```bash
pnpm run valuation:run -- \
  --from-manifest "./output/workflow/600887/<runId>/workflow_manifest.json"
```

验收：

- [ ] `valuation_computed.json`
- [ ] `valuation_summary.md`

## 5. 报告转 HTML

执行：

```bash
pnpm run report-to-html:run -- \
  --input-md "./output/workflow/600887/<runId>/analysis_report.md" \
  --code 600887
```

验收：

- [ ] HTML 成功生成
- [ ] 标题/段落/列表结构正常

## 6. Provider 一致性（HTTP / MCP）

执行：

```bash
pnpm run quality:conformance
```

验收：

- [ ] conformance 通过
- [ ] `financialSnapshot` 与 `financialHistory` 语义一致

## 7. 质量门禁（最终）

执行：

```bash
pnpm run test:linkage
pnpm run quality:all
```

验收：

- [ ] conformance / contract / regression / golden 全通过

## 8. 问题记录模板

每个失败项请记录：

- 用例编号
- 个股代码
- 执行命令
- 期望结果
- 实际结果
- 日志片段
- 是否稳定复现
- 优先级（P0 / P1 / P2）

## 当前可接受缺失（本轮不阻塞）

以下字段允许 `undefined`，由 `degradeReasons` 说明：

- `parentRevenue`
- `parentOperatingCashFlow`
- `parentTotalAssets`
- `parentTotalLiabilities`
