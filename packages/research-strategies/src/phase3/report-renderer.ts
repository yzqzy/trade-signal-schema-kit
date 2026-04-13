import type { AnalysisReport } from "@trade-signal/schema-core";

import { renderMarkdownToSemanticHtml } from "./markdown-to-html.js";
import type { Phase3ExecutionResult } from "./types.js";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

export function renderPhase3Markdown(result: Phase3ExecutionResult): string {
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

  const execSummary = [
    "## 一、Executive Summary（执行摘要）",
    "",
    `**一句话结论**：${report.title} — [${report.decision === "buy" ? "买入" : report.decision === "watch" ? "观察" : "排除"}]。`,
    "",
    "| 指标 | 数值 | 判定 |",
    "|:-----|:-----|:-----|",
    `| Owner Earnings | ${num(f2?.I)} 百万元 | — |`,
    `| 粗算穿透回报率 | ${pct(f2?.R)} | — |`,
    `| 精算穿透回报率 | ${pct(f3?.GG)} | — |`,
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
    `- 模块0口径锚定：利润=${f1b?.module0.profitAnchor ?? "—"}；现金=${f1b?.module0.cashAnchor ?? "—"}；单位=${f1b?.module0.unit ?? "—"}`,
    `- 模块九触发：${f1b?.module9Applied ? "是" : "否"}`,
    `- 结论：${f1b?.passed ? "通过" : f1b?.reason ?? "否决"}`,
    "",
  ].join("\n");

  const factor2 = [
    "## 四、因子2：穿透回报率粗算（Top-Down）",
    "",
    `- A/B/C: ${num(f2?.A)} / ${num(f2?.B)} / ${num(f2?.C)} 百万元`,
    `- D/E/G/I: ${num(f2?.D)} / ${num(f2?.E)} / ${num(f2?.G)} / ${num(f2?.I)}`,
    `- M/O/Q: ${num(f2?.M)} / ${num(f2?.O)} / ${num(f2?.Q)}`,
    `- R vs Rf/II: ${pct(f2?.R)} vs ${pct(result.valuation.impliedExpectations?.rf as number | undefined)} / ${pct(f2?.II)}`,
    `- 结论：${f2?.passed ? "通过" : f2?.reason ?? "否决"}`,
    "",
  ].join("\n");

  const factor3 = [
    "## 五、因子3：穿透回报率精算（Bottom-Up）+ 现金质量审计",
    "",
    `- AA/FF/GG/HH: ${num(f3?.AA)} / ${num(f3?.FF)} / ${pct(f3?.GG)} / ${num(f3?.HH)}`,
    `- 外推可信度：${f3?.extrapolationTrust ?? "—"}`,
    `- 结论：${f3?.passed ? "通过" : f3?.reason ?? "否决"}`,
    "",
  ].join("\n");

  const factor4 = [
    "## 六、因子4：估值与安全边际",
    "",
    `- II/JJ/KK: ${pct(f4?.II)} / ${num(f4?.JJ)} / ${num(f4?.KK)}`,
    `- 价值陷阱：${f4?.trapRisk ?? "—"}（特征数=${f4?.trapCount ?? 0}）`,
    `- 仓位建议：${f4?.position ?? "—"}`,
    `- 结论：${f4?.passed ? "通过" : f4?.reason ?? "排除"}`,
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

export type Phase3HtmlOptions = {
  /** 为 true 时使用旧版 `<pre>` 全量转义（仅调试） */
  legacyPre?: boolean;
  /** 在 HTML 正文前插入目录 */
  toc?: boolean;
};

export function renderPhase3Html(
  markdownOrReport: string | AnalysisReport,
  options: Phase3HtmlOptions = {},
): string {
  const markdown =
    typeof markdownOrReport === "string" ? markdownOrReport : `# ${markdownOrReport.title}`;
  const title =
    typeof markdownOrReport === "string"
      ? markdown.match(/^#\s+(.+)/)?.[1]?.trim() ?? "Phase3 Strict Report"
      : markdownOrReport.title;

  if (options.legacyPre) {
    return [
      "<!doctype html>",
      '<html lang="zh-CN">',
      "<head>",
      '<meta charset="utf-8" />',
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
      "<title>Phase3 Strict Report</title>",
      "<style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;padding:24px;max-width:1100px;margin:0 auto}pre{white-space:pre-wrap;line-height:1.5;background:#f7f7f8;padding:12px;border-radius:8px}</style>",
      "</head>",
      "<body>",
      `<pre>${escapeHtml(markdown)}</pre>`,
      "</body>",
      "</html>",
    ].join("");
  }

  return renderMarkdownToSemanticHtml(markdown, {
    documentTitle: title,
    toc: options.toc,
  });
}

export { renderMarkdownToSemanticHtml } from "./markdown-to-html.js";
