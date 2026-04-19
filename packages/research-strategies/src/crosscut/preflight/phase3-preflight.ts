import type { PdfExtractQualitySummary } from "@trade-signal/schema-core";

import { parseDataPackMarket } from "../../steps/phase3/market-pack-parser.js";
import { parseDataPackReport } from "../../steps/phase3/report-pack-parser.js";

/** 从 `data_pack_report*.md` 头部嵌入的机器可读块解析 PDF 抽取质量（Phase2B 生成）。 */
export function parsePdfExtractQualityFromReportMarkdown(markdown: string): PdfExtractQualitySummary | undefined {
  const m = markdown.match(/<!--\s*PDF_EXTRACT_QUALITY:([\s\S]*?)-->/);
  if (!m?.[1]) return undefined;
  try {
    return JSON.parse(m[1].trim()) as PdfExtractQualitySummary;
  } catch {
    return undefined;
  }
}

export type Phase3PreflightVerdict = "PROCEED" | "SUPPLEMENT_NEEDED" | "ABORT";

export interface Phase3PreflightResult {
  verdict: Phase3PreflightVerdict;
  markdown: string;
  abortReasons: string[];
  supplementGaps: Array<{ target: string; search: string; priority: "high" | "medium" | "low" }>;
}

function countEstimateTags(marketMd: string): number {
  const m = marketMd.match(/\[估算\|/g);
  return m?.length ?? 0;
}

/**
 * Turtle `phase3_preflight.md` 对齐：三态裁决 + 可选补救请求块（不调用外网）。
 */
export function evaluatePhase3Preflight(input: {
  companyName: string;
  marketMarkdown: string;
  reportMarkdown?: string;
  interimReportMarkdown?: string;
}): Phase3PreflightResult {
  const parsed = parseDataPackMarket(input.marketMarkdown);
  const report = input.reportMarkdown ? parseDataPackReport(input.reportMarkdown) : undefined;
  const pdfExtractQuality = input.reportMarkdown
    ? parsePdfExtractQualityFromReportMarkdown(input.reportMarkdown)
    : undefined;
  const estimates = countEstimateTags(input.marketMarkdown);
  const financialYears = parsed.financials.filter(
    (f) => f.netProfit !== undefined && f.netProfit !== null && Number.isFinite(f.netProfit),
  ).length;
  const allNetMissing = parsed.financials.length > 0 && financialYears === 0;

  const abortReasons: string[] = [];
  if (allNetMissing) abortReasons.push("§3 归母净利润行全部不可解析（视为不可补救）");
  if (parsed.financials.length > 0 && financialYears < 2) {
    abortReasons.push(`可用财报年度不足 2（当前可解析净利润年度数=${financialYears}）`);
  }
  const noIdentity =
    (!parsed.code || parsed.code === "UNKNOWN") &&
    (!parsed.name || parsed.name.length === 0) &&
    (!parsed.marketCap || parsed.marketCap <= 0);
  if (noIdentity) abortReasons.push("§1 基础信息缺失（代码/名称/市值均无效）");

  const supplementGaps: Phase3PreflightResult["supplementGaps"] = [];
  if (input.marketMarkdown.includes("§8 重大事件与公告（占位）")) {
    supplementGaps.push({
      target: "§8 重大事件与公告",
      search: `${input.companyName} 公告 重大事项`,
      priority: "medium",
    });
  }
  if (input.marketMarkdown.includes("行业标签：未知")) {
    supplementGaps.push({
      target: "§9 行业与竞争",
      search: `${input.companyName} 行业 竞争格局`,
      priority: "medium",
    });
  }
  if (estimates >= 3) {
    supplementGaps.push({
      target: "§3~§5 财务估算项",
      search: `${input.companyName} annual report 现金流量表 有息负债`,
      priority: "high",
    });
  }
  if (!input.reportMarkdown?.trim()) {
    supplementGaps.push({
      target: "data_pack_report.md",
      search: `${input.companyName} 年报 PDF MD&A`,
      priority: "high",
    });
  }
  const mda = report?.sections.MDA;
  if (report && (!mda || mda.trim().length < 80)) {
    supplementGaps.push({
      target: "MD&A 深度",
      search: `${input.companyName} 管理层讨论与分析 经营情况`,
      priority: "medium",
    });
  }
  if (input.interimReportMarkdown && input.interimReportMarkdown.length < 200) {
    supplementGaps.push({
      target: "data_pack_report_interim.md",
      search: `${input.companyName} 中报 附注`,
      priority: "low",
    });
  }

  if (pdfExtractQuality?.missingCritical?.length) {
    supplementGaps.push({
      target: "PDF 关键章节（MDA/P4/P13）",
      search: `${input.companyName} 年报 PDF 附注 管理层讨论与分析 关联方 非经常性损益`,
      priority: "high",
    });
  }
  if (pdfExtractQuality?.lowConfidenceCritical?.length) {
    supplementGaps.push({
      target: "PDF 低置信关键章节复核",
      search: `${input.companyName} 年报 对应章节 人工核对页码`,
      priority: "medium",
    });
  }

  const minSectionsFound = Number(process.env.PHASE3_PREFLIGHT_PDF_MIN_SECTIONS_FOUND ?? "");
  if (
    pdfExtractQuality &&
    Number.isFinite(minSectionsFound) &&
    pdfExtractQuality.sectionsFound < minSectionsFound
  ) {
    supplementGaps.push({
      target: "PDF 章节覆盖率",
      search: `${input.companyName} 年报 PDF 文本层 附注起始页`,
      priority: "high",
    });
  }

  const minEstForSupplement = Number(process.env.PHASE3_PREFLIGHT_SUPPLEMENT_MIN_ESTIMATE_TAGS ?? "8");
  const estThreshold = Number.isFinite(minEstForSupplement) ? minEstForSupplement : 8;

  const pdfGate = (process.env.PHASE3_PREFLIGHT_PDF_GATE ?? "off").trim().toLowerCase();
  const pdfGateNeedsSupplement =
    pdfExtractQuality &&
    ((pdfGate === "missing" && pdfExtractQuality.gateVerdict === "CRITICAL") ||
      (pdfGate === "strict" &&
        (pdfExtractQuality.gateVerdict === "CRITICAL" || pdfExtractQuality.missingCritical.length > 0)) ||
      (pdfGate === "sections" &&
        Number.isFinite(minSectionsFound) &&
        pdfExtractQuality.sectionsFound < minSectionsFound));

  let verdict: Phase3PreflightVerdict = "PROCEED";
  if (abortReasons.length > 0) verdict = "ABORT";
  else if (estimates >= estThreshold) verdict = "SUPPLEMENT_NEEDED";
  else if (financialYears === 2 && estimates >= 4) verdict = "SUPPLEMENT_NEEDED";
  else if (pdfGateNeedsSupplement) verdict = "SUPPLEMENT_NEEDED";

  const supplementBlock =
    verdict === "SUPPLEMENT_NEEDED" && supplementGaps.length > 0
      ? [
          "",
          "<!-- SUPPLEMENT_REQUEST",
          "gaps:",
          ...supplementGaps.map(
            (g) =>
              `  - target: ${JSON.stringify(g.target)}\n    search: ${JSON.stringify(g.search)}\n    priority: ${g.priority}`,
          ),
          "-->",
          "",
        ].join("\n")
      : "";

  const mvpPdfBlock = [
    "",
    "## PDF 与交付语义（MVP）",
    "",
    "- **规则 A（交付级）**：输出 D5（MD&A）**可交付结论**时，必须有 `data_pack_report.md`（需下载并解析年报 PDF：Phase0 + Phase2A/2B）。",
    "- **规则 B（预研级）**：无 `data_pack_report.md` 时仅输出预研草稿；`qualitative_d1_d6.md` 的 D5 会标注「证据不足，待补充 PDF 解析」。",
    "- **规则 C（strict）**：`turtle-strict` 或 `business-analysis --strict` 下，缺少 `data_pack_report.md` 为不合格结果（编排层 fail-fast）。",
    "- **规则 D（PDF 门禁分级）**：`gateVerdict=CRITICAL`（关键块缺失）视为硬不合格；`DEGRADED`（仅低置信）允许继续交付证据链，但 Claude 终稿须写 **`> PDF 抽取质量声明`** 且明确复核优先级（见 `business-analysis-finalize`）。",
    "",
    "### 补救命令示例",
    "",
    "- 自动发现年报并下载：`pnpm run phase0:download -- --stock-code \"<代码>\" --category \"年报\" --year \"<YYYY>\"`（需 `FEED_BASE_URL`）。",
    "- 全链路带 PDF：见仓库 `docs/guides/workflows.md` 中 `workflow:run` / `--pdf` / `--report-url` 说明。",
    "",
  ];

  const md = [
    "# Phase 3 Pre-flight（编排层自动裁决）",
    "",
    `> 生成时间：${new Date().toISOString()}`,
    "",
    "## 裁决",
    "",
    `- **verdict**: \`${verdict}\``,
    ...(verdict === "ABORT" ? ["", "### ABORT 原因", ...abortReasons.map((r) => `- ${r}`)] : []),
    "",
    "## 摘要",
    "",
    `- 估算类警告（[估算|）条数：**${estimates}**`,
    `- 可解析净利润的财报年度数：**${financialYears}**`,
    `- data_pack_report：${input.reportMarkdown ? "已提供" : "缺失"}`,
    `- data_pack_report_interim：${input.interimReportMarkdown ? "已提供" : "未提供"}`,
    ...(pdfExtractQuality
      ? [
          `- **PDF 抽取质量**：gate=\`${pdfExtractQuality.gateVerdict}\`；缺失关键块=${JSON.stringify(pdfExtractQuality.missingCritical)}；低置信关键块=${JSON.stringify(pdfExtractQuality.lowConfidenceCritical)}；sections=${pdfExtractQuality.sectionsFound}/${pdfExtractQuality.sectionsTotal}；allowsFinalNarrativeComplete=${String(pdfExtractQuality.allowsFinalNarrativeComplete ?? (pdfExtractQuality.gateVerdict !== "CRITICAL"))}`,
          `- **PHASE3_PREFLIGHT_PDF_GATE** 当前=\`${pdfGate}\`（off | missing | strict | sections；默认 off，仅诊断不落盘改 verdict）`,
        ]
      : input.reportMarkdown
        ? ["- **PDF 抽取质量**：未解析到嵌入块（可能为旧版 data_pack_report）"]
        : []),
    ...mvpPdfBlock,
    "## 说明",
    "",
    "- 本文件由 `evaluatePhase3Preflight` 生成，**不调用外网**；`SUPPLEMENT_NEEDED` 仅输出结构化补救提示。",
    "- 严格编排下：`ABORT` 会终止；`SUPPLEMENT_NEEDED` 在未携带补救通行证时终止，见 orchestrator。",
    ...(verdict === "PROCEED" && supplementGaps.length > 0
      ? [
          "",
          "## 建议关注（不影响 PROCEED 裁决）",
          "",
          ...supplementGaps.map((g) => `- **${g.target}**：检索示例 ${JSON.stringify(g.search)}（${g.priority}）`),
        ]
      : []),
    supplementBlock,
  ].join("\n");

  return { verdict, markdown: md, abortReasons, supplementGaps };
}
