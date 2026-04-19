import type {
  PdfExtractQualitySummary,
  PdfSectionBlock,
  PdfSectionDiagnosticEntry,
  PdfSections,
} from "@trade-signal/schema-core";

import { runPhase2AExtractPdfSections } from "../phase2a/extractor.js";
import { computePdfExtractQuality } from "../phase2a/extract-quality.js";

type Phase2BSectionId = "P2" | "P3" | "P4" | "P6" | "P13" | "MDA" | "SUB";

const PHASE2B_ORDER_FULL: Phase2BSectionId[] = ["P2", "P3", "P4", "P6", "P13", "MDA", "SUB"];

const PHASE2B_ORDER_NO_MDA: Phase2BSectionId[] = ["P2", "P3", "P4", "P6", "P13", "SUB"];

const PHASE2B_TITLES: Record<Phase2BSectionId, string> = {
  P2: "受限资产",
  P3: "应收账款账龄",
  P4: "关联方交易",
  P6: "或有负债",
  P13: "非经常性损益",
  MDA: "管理层讨论与分析（MD&A）",
  SUB: "主要控股参股公司",
};

export type Phase2BReportKind = "annual" | "interim";

export interface Phase2BRenderInput {
  sections: PdfSections;
  /** 默认 true：与 Turtle 7 章口径对齐，输出 MDA 区块 */
  includeMda?: boolean;
  /** annual：年报；interim：中报/季报（契约标识，关键词集仍复用 Phase2A） */
  reportKind?: Phase2BReportKind;
}

export interface Phase2BRenderFromPdfInput {
  pdfPath: string;
  verbose?: boolean;
  reportKind?: Phase2BReportKind;
}

/** 轻量清洗：压缩异常空白，便于下游消费与 diff */
export function sanitizePhase2ExtractedText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{5,}/g, "\n\n\n\n")
    .trim();
}

function sectionMetaLines(section: PdfSectionBlock, diag?: PdfSectionDiagnosticEntry): string[] {
  const codes: string[] = [];
  if (section.confidence === "low") codes.push("LOW_CONFIDENCE");
  if (section.extractionWarnings?.length) codes.push("EXTRACTION_WARNINGS");
  const codeStr = codes.length > 0 ? codes.join(",") : "none";
  const backend =
    diag?.textBackend != null ? `；**textBackend**: \`${diag.textBackend}\`` : "";
  return [
    `> **sourcePageRange**: p.${section.pageFrom}–p.${section.pageTo}；**confidence**: \`${section.confidence ?? "n/a"}\`；**warningCodes**: \`${codeStr}\`${backend}`,
    "",
  ];
}

function toEvidenceBlock(section: PdfSectionBlock): string {
  const body = sanitizePhase2ExtractedText((section.content ?? "").trim() || "(空内容)");
  const conf = section.confidence ? `定位置信度：**${section.confidence}**` : "";
  const warnLines =
    section.extractionWarnings?.map((w) => `> ⚠️ [PHASE2B|medium] ${w}`).join("\n") ?? "";
  return [
    conf ? `${conf}（页码 ${section.pageFrom}-${section.pageTo}）` : `来源页码：${section.pageFrom}-${section.pageTo}`,
    "",
    "```text",
    body,
    "```",
    ...(warnLines ? ["", warnLines] : []),
  ].join("\n");
}

function resolveExtractQuality(sections: PdfSections): PdfExtractQualitySummary {
  return sections.metadata.extractQuality ?? computePdfExtractQuality(sections);
}

function renderPdfExtractQualityMachineComment(q: PdfExtractQualitySummary): string {
  const payload = JSON.stringify({
    gateVerdict: q.gateVerdict,
    missingCritical: q.missingCritical,
    lowConfidenceCritical: q.lowConfidenceCritical,
    sectionsFound: q.sectionsFound,
    sectionsTotal: q.sectionsTotal,
    allowsFinalNarrativeComplete: q.allowsFinalNarrativeComplete ?? (q.gateVerdict !== "CRITICAL"),
    humanReviewPriority: q.humanReviewPriority ?? [],
    pdfTextBackendsUsed: q.pdfTextBackendsUsed ?? [],
    aiVerifierApplied: q.aiVerifierApplied ?? false,
    aiVerifierNote: q.aiVerifierNote ?? null,
  });
  return `<!-- PDF_EXTRACT_QUALITY:${payload} -->`;
}

function missingSectionDiagnosticsLines(id: Phase2BSectionId, diag?: PdfSectionDiagnosticEntry): string[] {
  const lines: string[] = [
    "> **可能原因（启发式）**：",
  ];
  if (id === "P3") {
    lines.push(
      "> - 附注标题与关键词不一致（如「应收款项融资」「合同资产」分流，或账龄表并入「应收账款及应收票据」组合披露）；",
      "> - 目录页/交叉引用（详见/参见）触发惩罚导致得分偏低；",
      "> - 文本层表格列顺序被打乱，`pdf-parse` 与 `pdfjs-dist` 仍可能无法稳定拼出行。",
    );
  } else if (id === "P13") {
    lines.push(
      "> - 「补充资料」与附注多处出现相似词，候选页得分接近或并列；",
      "> - 表格数字与文字碎片导致关键词命中分散；",
      "> - 若主路径未命中，已尝试 `pdfjs-dist` 回退（见头部 `pdfTextBackendsUsed`）。",
    );
  } else {
    lines.push("> - 关键词未命中、目录干扰、或章节跨页边界被截断。");
  }
  if (diag?.bestPage != null) {
    const scoreStr =
      typeof diag.score === "number" && Number.isFinite(diag.score) ? diag.score.toFixed(1) : String(diag.score ?? "?");
    lines.push(
      `> - Phase2A 曾记录候选最佳页 **p.${diag.bestPage}**（score≈${scoreStr}，conf=\`${diag.confidence}\`），但未形成可落块正文。`,
    );
  }
  lines.push(
    "",
    "> **建议人工动作**：在 PDF 内全文检索该章核心词；核对是否为扫描件无文本层；必要时手工摘录表格再并入证据包。",
    "",
  );
  return lines;
}

function renderOneSection(
  id: Phase2BSectionId,
  section: PdfSectionBlock | undefined,
  diag?: PdfSectionDiagnosticEntry,
): string {
  const title = PHASE2B_TITLES[id];
  if (!section) {
    return [
      `## ${id} ${title}`,
      "",
      "> **sourcePageRange**: —；**confidence**: —；**warningCodes**: `SECTION_MISSING`",
      "",
      "> ⚠️ [PHASE2B|high] **章节缺失**：Phase2A 未定位到可靠命中，未静默占位正文。",
      "",
      ...missingSectionDiagnosticsLines(id, diag),
      "（空缺 — 请检查 PDF 是否含对应附注/章节标题，或启用更清晰的文本层 PDF。）",
    ].join("\n");
  }
  return [`## ${id} ${title}`, "", ...sectionMetaLines(section, diag), toEvidenceBlock(section)].join("\n");
}

export function renderPhase2BDataPackReport(input: Phase2BRenderInput): string {
  const includeMda = input.includeMda !== false;
  const reportKind = input.reportKind ?? "annual";
  const order = includeMda ? PHASE2B_ORDER_FULL : PHASE2B_ORDER_NO_MDA;
  const diag = input.sections.metadata.sectionDiagnostics;
  const lowConf = diag
    ? PHASE2B_ORDER_FULL.filter((id) => diag[id]?.confidence === "low")
    : [];
  const extractQ = resolveExtractQuality(input.sections);
  const defectLines = [
    "## PDF 抽取缺陷摘要（机器可读）",
    "",
    "```json",
    JSON.stringify(
      {
        gateVerdict: extractQ.gateVerdict,
        missingCritical: extractQ.missingCritical,
        lowConfidenceCritical: extractQ.lowConfidenceCritical,
        sectionsFound: extractQ.sectionsFound,
        sectionsTotal: extractQ.sectionsTotal,
        criticalSectionIds: extractQ.criticalSectionIds,
        allowsFinalNarrativeComplete: extractQ.allowsFinalNarrativeComplete ?? (extractQ.gateVerdict !== "CRITICAL"),
        humanReviewPriority: extractQ.humanReviewPriority ?? [],
        pdfTextBackendsUsed:
          extractQ.pdfTextBackendsUsed ?? input.sections.metadata.pdfTextBackendsUsed ?? [],
        aiVerifierApplied: extractQ.aiVerifierApplied ?? false,
        aiVerifierNote: extractQ.aiVerifierNote ?? null,
      },
      null,
      2,
    ),
    "```",
    "",
  ].join("\n");
  const header = [
    reportKind === "interim" ? "# data_pack_report_interim" : "# data_pack_report",
    "",
    renderPdfExtractQualityMachineComment(extractQ),
    "",
    `- **reportKind**: \`${reportKind}\`（${reportKind === "interim" ? "中期/季度报告契约，章节结构可能与年报不同" : "年度报告契约"}）`,
    includeMda
      ? "> 语义对齐 Turtle：P2/P3/P4/P6/P13 + **MDA** + SUB（7 章关键块）。"
      : "> 语义对齐 Turtle 5+1（P2/P3/P4/P6/P13/SUB，不含 MDA）。",
    "",
    `- pdfFile: ${input.sections.metadata.pdfFile}`,
    `- totalPages: ${input.sections.metadata.totalPages}`,
    `- sectionsFound: ${input.sections.metadata.sectionsFound}/${input.sections.metadata.sectionsTotal}`,
    `- annexStartPageEstimate: ${input.sections.metadata.annexStartPageEstimate ?? "（未估计）"}`,
    `- extractTime: ${input.sections.metadata.extractTime}`,
    `- **pdfTextBackendsUsed**: ${(extractQ.pdfTextBackendsUsed ?? input.sections.metadata.pdfTextBackendsUsed ?? []).map((s) => `\`${s}\``).join(", ") || "—"}`,
    `- **extractQuality.gateVerdict**: \`${extractQ.gateVerdict}\`（关键块缺失→**CRITICAL**（编排/终稿硬阻断）；关键块仅低置信→**DEGRADED**（允许在强制 PDF 声明下终稿标「完成」））`,
    `- **allowsFinalNarrativeComplete**: \`${String(extractQ.allowsFinalNarrativeComplete ?? (extractQ.gateVerdict !== "CRITICAL"))}\``,
    "",
    defectLines,
    ...(extractQ.humanReviewPriority && extractQ.humanReviewPriority.length > 0
      ? [
          "## 人工复核优先级（建议顺序）",
          "",
          ...extractQ.humanReviewPriority.map((id, i) => `> ${i + 1}. \`${id}\`（缺失或低置信关键块优先）`),
          "",
        ]
      : []),
    ...(lowConf.length > 0
      ? [
          "> ⚠️ [PHASE2B|high] **低置信度章节**（建议人工复核）：",
          ...lowConf.map((id) => {
            const d = diag?.[id];
            const scoreStr = d?.score != null ? d.score.toFixed(1) : "?";
            const tops =
              d?.topCandidates?.slice(0, 3).map((c) => `p.${c.page}(${c.score.toFixed(0)})`) ?? [];
            const topStr = tops.length > 0 ? `；候选 ${tops.join(", ")}` : "";
            const backend = d?.textBackend ? `；parser=\`${d.textBackend}\`` : "";
            return `> - \`${id}\`（最佳页 p.${d?.bestPage ?? "?"}，score≈${scoreStr}${topStr}${backend}）`;
          }),
          "",
        ]
      : []),
  ].join("\n");

  const sectionMap: Record<Phase2BSectionId, PdfSectionBlock | undefined> = {
    P2: input.sections.P2,
    P3: input.sections.P3,
    P4: input.sections.P4,
    P6: input.sections.P6,
    P13: input.sections.P13,
    MDA: input.sections.MDA,
    SUB: input.sections.SUB,
  };
  const body = order.map((id) => renderOneSection(id, sectionMap[id], diag?.[id])).join("\n\n");
  return `${header}${body}\n`;
}

export async function renderPhase2BDataPackReportFromPdf(
  input: Phase2BRenderFromPdfInput,
): Promise<{ markdown: string; sections: PdfSections }> {
  const sections = await runPhase2AExtractPdfSections({
    pdfPath: input.pdfPath,
    verbose: input.verbose,
  });
  const markdown = renderPhase2BDataPackReport({ sections, reportKind: input.reportKind });
  return { markdown, sections };
}
