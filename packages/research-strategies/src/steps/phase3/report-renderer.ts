import type { AnalysisReport } from "@trade-signal/schema-core";

import type { Factor2Result, Factor3Result, Factor4Result, Phase3ExecutionResult } from "./types.js";

function pct(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function num(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function yesNo(hit: boolean): string {
  return hit ? "是→否决" : "否";
}

/** 执行摘要表「判定」列：粗算穿透回报率 R（因子2） */
function verdictPenetrationRough(f2: Factor2Result | undefined): string {
  if (!f2 || f2.R === undefined || Number.isNaN(f2.R)) return "—";
  if (!f2.passed && f2.reason) return f2.reason.length <= 40 ? f2.reason : `${f2.reason.slice(0, 37)}…`;
  return "因子2：通过";
}

/** 执行摘要表「判定」列：精算穿透回报率 GG（因子3） */
function verdictPenetrationFine(f3: Factor3Result | undefined): string {
  if (!f3 || f3.GG === undefined || Number.isNaN(f3.GG)) return "—";
  if (!f3.passed && f3.reason) return f3.reason.length <= 40 ? f3.reason : `${f3.reason.slice(0, 37)}…`;
  const trust = f3.extrapolationTrust ?? "—";
  const hh =
    f3.HH !== undefined && Number.isFinite(f3.HH) ? `；R−GG=${f3.HH.toFixed(1)}pct` : "";
  return `因子3：通过（外推${trust}${hh}）`;
}

/** 将多行列表包进引用块，便于阅读器单独样式化「计算过程」 */
function asCalculationBlockquote(lines: string[]): string {
  return lines.map((l) => `> ${l}`).join("\n");
}

/**
 * 机器可读投资结论块（`rh-metadata`），由 `research-hub` 渲染为标签卡片。
 * 仅使用 `key: value` 行，避免在 Markdown 中嵌入 HTML。
 */
function buildInvestmentVerdictBlock(
  report: AnalysisReport,
  f4: Factor4Result | undefined,
  opts?: {
    reportMode?: "full" | "reject";
    rejectType?: string;
  },
): string {
  const trap = f4?.trapRisk;
  const rejectMode = opts?.reportMode === "reject";
  const trapNorm = rejectMode
    ? "not_evaluated"
    : trap === "low" || trap === "medium" || trap === "high"
      ? trap
      : trap && trap !== "—"
        ? trap
        : "unknown";
  const pos = (f4?.position ?? "—").replace(/\s+/g, " ").trim() || "—";
  const analysisStage = rejectMode ? "early_reject" : "factor4_complete";
  const decisionSource = rejectMode
    ? `early_reject_${(opts?.rejectType ?? "unknown").toLowerCase()}`
    : "factor4_decision";
  const confidenceSource = rejectMode ? "early_reject_default" : "factor_votes";
  const trapRiskSource = rejectMode ? "not_evaluated_due_to_early_reject" : "factor4";
  return [
    "## 投资结论",
    "",
    "> 核心判断一览；下方「一、Executive Summary」含完整指标表。",
    "",
    "```rh-metadata",
    `decision: ${report.decision}`,
    `decision_source: ${decisionSource}`,
    `confidence: ${report.confidence ?? "medium"}`,
    `confidence_source: ${confidenceSource}`,
    `analysis_stage: ${analysisStage}`,
    `trap_risk: ${trapNorm}`,
    `trap_risk_source: ${trapRiskSource}`,
    `position: ${pos}`,
    "```",
    "",
  ].join("\n");
}

function renderPhase3RejectMarkdown(result: Phase3ExecutionResult): string {
  const report = result.report;
  const rejectType = result.factor2?.rejectType ?? "unknown";
  const blocks = report.sections.map((s) => [`### ${s.heading}`, "", s.content.trim(), ""].join("\n"));
  return [
    `# ${report.title}`,
    "",
    buildInvestmentVerdictBlock(report, result.factor4, { reportMode: "reject", rejectType }),
    "> **结果：前置筛选结束（非异常）** — 因子2-S4（穿透收益率不足），当前为前置筛选结论。",
    "",
    ...blocks,
    "---",
    "",
    "*本模板由 `reportMode=reject` 触发；若需完整因子3/4结论，请先修复穿透收益率阈值问题后重跑。*",
    "",
  ].join("\n");
}

export function renderPhase3Markdown(result: Phase3ExecutionResult): string {
  if (result.reportMode === "reject") {
    return renderPhase3RejectMarkdown(result);
  }

  const report = result.report;
  const f1a = result.factor1A;
  const f1b = result.factor1B;
  const f2 = result.factor2;
  const f3 = result.factor3;
  const f4 = result.factor4;

  const meta = [
    "## 报告元信息",
    "",
    "| 项目 | 内容 |",
    "|:-----|:-----|",
    `| 分析日期 | ${new Date(report.meta.generatedAt).toISOString().slice(0, 10)} |`,
    "| 框架版本 | 龟龟投资策略 v1.1 |",
    `| 数据来源 | ${report.meta.dataSource} |`,
    `| Warnings | ${f1a?.checks.some((c) => c.hit) ? "存在" : "无"} |`,
    "",
  ].join("\n");

  const verdict = buildInvestmentVerdictBlock(report, f4, { reportMode: "full" });

  const execSummary = [
    "## 一、Executive Summary（执行摘要）",
    "",
    `**一句话结论**：${report.title} — [${report.decision === "buy" ? "买入" : report.decision === "watch" ? "观察" : "排除"}]。`,
    "",
    "| 指标 | 数值 | 判定 |",
    "|:-----|:-----|:-----|",
    `| Owner Earnings | ${num(f2?.I)} 百万元 | — |`,
    `| 粗算穿透回报率 | ${pct(f2?.R)} | ${verdictPenetrationRough(f2)} |`,
    `| 精算穿透回报率 | ${pct(f3?.GG)} | ${verdictPenetrationFine(f3)} |`,
    `| 门槛值 | ${pct(f4?.II)} | — |`,
    `| 安全边际 | ${num(f4?.KK)} pct | — |`,
    `| 价值陷阱风险 | ${f4?.trapRisk ?? "—"} | — |`,
    `| 外推可信度 | ${f3?.extrapolationTrust ?? "—"} | — |`,
    `| 仓位建议 | ${f4?.position ?? "—"} | — |`,
    `| 分析置信度 | ${report.confidence ?? "medium"} | — |`,
    "",
  ].join("\n");

  const factor1a = [
    "## 二、因子1A：五分钟快筛",
    "",
    "| 序号 | 检查项 | 判断 | 结果 |",
    "|------|--------|------|------|",
    ...(f1a?.checks.map((c) => `| ${c.id} | ${c.item} | ${c.reason} | ${yesNo(c.hit)} |`) ?? ["| 1 | N/A | 数据不足 | 是→否决 |"]),
    "",
    `**结论**：${f1a?.passed ? "全部通过" : f1a?.reason ?? "否决"}`,
    "",
  ].join("\n");

  const factor1b = [
    "## 三、因子1B：深度定性分析",
    "",
    "### 计算过程（因子1B · 口径与结论）",
    "",
    asCalculationBlockquote([
      `- 模块0口径锚定：利润=${f1b?.module0.profitAnchor ?? "—"}；现金=${f1b?.module0.cashAnchor ?? "—"}；单位=${f1b?.module0.unit ?? "—"}`,
      `- 模块九触发：${f1b?.module9Applied ? "是" : "否"}`,
      `- 结论：${f1b?.passed ? "通过" : f1b?.reason ?? "否决"}`,
    ]),
    "",
  ].join("\n");

  const factor2 = [
    "## 四、因子2：穿透回报率粗算（Top-Down）",
    "",
    "### 计算过程（因子2 · Top-Down）",
    "",
    asCalculationBlockquote([
      `- A/B/C: ${num(f2?.A)} / ${num(f2?.B)} / ${num(f2?.C)} 百万元`,
      `- D/E/G/I: ${num(f2?.D)} / ${num(f2?.E)} / ${num(f2?.G)} / ${num(f2?.I)}`,
      `- M/O/Q: ${num(f2?.M)} / ${num(f2?.O)} / ${num(f2?.Q)}`,
      `- R vs Rf/II: ${pct(f2?.R)} vs ${pct(result.valuation.impliedExpectations?.rf as number | undefined)} / ${pct(f2?.II)}`,
      `- 结论：${f2?.passed ? "通过" : f2?.reason ?? "否决"}`,
    ]),
    "",
  ].join("\n");

  const factor3 = [
    "## 五、因子3：穿透回报率精算（Bottom-Up）+ 现金质量审计",
    "",
    "### 计算过程（因子3 · Bottom-Up）",
    "",
    asCalculationBlockquote([
      `- AA/FF/GG/HH: ${num(f3?.AA)} / ${num(f3?.FF)} / ${pct(f3?.GG)} / ${num(f3?.HH)}`,
      `- 外推可信度：${f3?.extrapolationTrust ?? "—"}`,
      `- 结论：${f3?.passed ? "通过" : f3?.reason ?? "否决"}`,
    ]),
    "",
  ].join("\n");

  const factor4 = [
    "## 六、因子4：估值与安全边际",
    "",
    "### 计算过程（因子4 · 估值与安全边际）",
    "",
    asCalculationBlockquote([
      `- II/JJ/KK: ${pct(f4?.II)} / ${num(f4?.JJ)} / ${num(f4?.KK)}`,
      `- 价值陷阱：${f4?.trapRisk ?? "—"}（特征数=${f4?.trapCount ?? 0}）`,
      `- 仓位建议：${f4?.position ?? "—"}`,
      `- 结论：${f4?.passed ? "通过" : f4?.reason ?? "排除"}`,
    ]),
    "",
  ].join("\n");

  const finalOutput = [
    "## 七、最终综合输出",
    "",
    `最终判断：${report.decision === "buy" ? "买入" : report.decision === "watch" ? "观察" : "排除"}`,
    `最大优势：${f1b?.moduleRatings["3.3护城河"] ?? "—"}`,
    `最大风险：${f4?.trapRisk ?? "—"}`,
    "",
  ].join("\n");

  const riskAndDisclaimer = [
    "## 八、风险提示与待验证事项",
    "",
    "### 8.1 该标的特定风险",
    `- ${f4?.trapRisk === "high" ? "价值陷阱风险偏高" : "主要风险可控，但需持续跟踪"}`,
    "",
    "### 8.2 需要人工验证的内容",
    "| # | 待验证事项 | 原因 | 建议验证方式 |",
    "|:-:|:---------|:-----|:-----------|",
    "| 1 | 管理层与治理关键结论 | 自动提取存在语义误差风险 | 人工复核原始年报与公告 |",
    "",
    "## 九、数据来源与免责声明",
    "",
    "### 9.1 数据来源汇总",
    "| 数据项 | 来源 | 工具/URL | 获取日期 |",
    "|:-------|:-----|:---------|:--------:|",
    `| 财务报表（合并+母公司） | data_pack_market | phase3 strict parser | ${new Date().toISOString().slice(0, 10)} |`,
    `| 年报附注（P2/P3/P4/P6/P13） | data_pack_report | phase3 strict parser | ${new Date().toISOString().slice(0, 10)} |`,
    "",
    "### 9.2 免责声明",
    "本报告由自动化流程生成，仅供研究参考，不构成投资建议。",
    "",
  ].join("\n");

  return [
    `# 龟龟投资策略 · 选股分析报告：${report.title.replace("龟龟投资策略 · 选股分析报告：", "")}`,
    "",
    "---",
    "",
    meta,
    verdict,
    execSummary,
    factor1a,
    factor1b,
    factor2,
    factor3,
    factor4,
    finalOutput,
    riskAndDisclaimer,
  ].join("\n");
}
