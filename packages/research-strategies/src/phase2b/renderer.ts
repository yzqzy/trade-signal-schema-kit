import type { PdfSectionBlock, PdfSections } from "@trade-signal/schema-core";

import { runPhase2AExtractPdfSections } from "../phase2a/extractor.js";

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

export interface Phase2BRenderInput {
  sections: PdfSections;
  /** 默认 true：与 Turtle 7 章口径对齐，输出 MDA 区块 */
  includeMda?: boolean;
}

export interface Phase2BRenderFromPdfInput {
  pdfPath: string;
  verbose?: boolean;
}

function toEvidenceBlock(section: PdfSectionBlock): string {
  return [
    `来源页码：${section.pageFrom}-${section.pageTo}`,
    "",
    "```text",
    (section.content ?? "").trim() || "(空内容)",
    "```",
  ].join("\n");
}

function renderOneSection(id: Phase2BSectionId, section: PdfSectionBlock | undefined): string {
  const title = PHASE2B_TITLES[id];
  if (!section) {
    return [`## ${id} ${title}`, "", "⚠️ 未从 PDF 提取到该章节，保持空缺。"].join("\n");
  }
  return [`## ${id} ${title}`, "", toEvidenceBlock(section)].join("\n");
}

export function renderPhase2BDataPackReport(input: Phase2BRenderInput): string {
  const includeMda = input.includeMda !== false;
  const order = includeMda ? PHASE2B_ORDER_FULL : PHASE2B_ORDER_NO_MDA;
  const header = [
    "# data_pack_report",
    "",
    includeMda
      ? "> 语义对齐 Turtle：P2/P3/P4/P6/P13 + **MDA** + SUB（7 章关键块）。"
      : "> 语义对齐 Turtle 5+1（P2/P3/P4/P6/P13/SUB，不含 MDA）。",
    "",
    `- pdfFile: ${input.sections.metadata.pdfFile}`,
    `- totalPages: ${input.sections.metadata.totalPages}`,
    `- sectionsFound: ${input.sections.metadata.sectionsFound}/${input.sections.metadata.sectionsTotal}`,
    `- extractTime: ${input.sections.metadata.extractTime}`,
    "",
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
  const body = order.map((id) => renderOneSection(id, sectionMap[id])).join("\n\n");
  return `${header}${body}\n`;
}

export async function renderPhase2BDataPackReportFromPdf(
  input: Phase2BRenderFromPdfInput,
): Promise<{ markdown: string; sections: PdfSections }> {
  const sections = await runPhase2AExtractPdfSections({
    pdfPath: input.pdfPath,
    verbose: input.verbose,
  });
  const markdown = renderPhase2BDataPackReport({ sections });
  return { markdown, sections };
}
