import type { Phase1BEvidence, Phase1BItem, Phase1BQualitativeSupplement } from "./types.js";

/** 渲染 C2 投影后的 `Phase1BQualitativeSupplement`（与 M2 前输出结构一致）。 */

const NOT_FOUND_TEXT = "⚠️ 未搜索到相关信息";

function renderSources(evidences: Phase1BEvidence[]): string {
  if (evidences.length === 0) return NOT_FOUND_TEXT;
  return evidences
    .map((item) => {
      const text = item.source ? `${item.source}: ${item.title}` : item.title;
      return `[${text}](${item.url})`;
    })
    .join("<br/>");
}

function humanRetrievalStatus(item: Phase1BItem): string {
  const d = item.retrievalDiagnostics;
  if (item.evidences.length > 0) {
    if (d?.evidenceRetrievalStatus === "web_limited_feed_hit") {
      return "WebSearch 受限，已回退 Feed 并取得候选证据";
    }
    if (d?.evidenceRetrievalStatus === "web_hit") return "WebSearch 命中";
    if (d?.evidenceRetrievalStatus === "feed_hit") return "Feed 命中";
    return "已取得候选证据";
  }
  if (d?.evidenceRetrievalStatus === "web_limited_feed_empty") {
    return "外部检索受限，已回退 Feed，仍未形成可确认候选证据";
  }
  if (d?.webSearchUsed && d.webSearchFailureReason) {
    return "外部检索未形成可用结果，已保留为证据缺口";
  }
  return "Feed 类别检索无命中，保留为证据缺口";
}

function renderContent(item: Phase1BItem): string {
  if (item.evidences.length > 0) return item.content || NOT_FOUND_TEXT;
  return humanRetrievalStatus(item);
}

function renderSection7(report: Phase1BQualitativeSupplement): string {
  const lines = [
    "## 7. 管理层与治理",
    "",
    "| 项目 | 内容 | 来源 |",
    "|:-----|:-----|:-----|",
  ];
  for (const item of report.section7) {
    lines.push(`| ${item.item} | ${renderContent(item)} | ${renderSources(item.evidences)} |`);
  }
  return lines.join("\n");
}

function renderSection8(report: Phase1BQualitativeSupplement): string {
  const lines = [
    "## 8. 行业与竞争",
    "",
    "| 项目 | 内容 | 来源 |",
    "|:-----|:-----|:-----|",
  ];
  for (const item of report.section8) {
    lines.push(`| ${item.item} | ${renderContent(item)} | ${renderSources(item.evidences)} |`);
  }
  return lines.join("\n");
}

function renderSection10(report: Phase1BQualitativeSupplement): string {
  const lines = ["## 10. MD&A 摘要", ""];
  report.section10.forEach((section, index) => {
    lines.push(`### 10.${index + 1} ${section.heading}`);
    for (const point of section.points) {
      lines.push(`- ${point}`);
    }
    lines.push(`- 来源：${renderSources(section.evidences)}`);
    lines.push("");
  });
  return lines.join("\n");
}

export function renderPhase1BMarkdown(report: Phase1BQualitativeSupplement): string {
  return [
    `# Phase1B 外部信息补全`,
    "",
    `- 股票代码：${report.stockCode}`,
    `- 公司名称：${report.companyName}`,
    `- 年份：${report.year ?? "未指定"}`,
    `- 通道：${report.channel}`,
    `- 生成时间：${report.generatedAt}`,
    "",
    renderSection7(report),
    "",
    renderSection8(report),
    "",
    renderSection10(report),
  ].join("\n");
}
