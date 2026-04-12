import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PDFParse } from "pdf-parse";

import type { PdfSectionBlock, PdfSections } from "@trade-signal/schema-core";

import {
  PHASE2A_SECTION_BUFFER_PAGES,
  PHASE2A_SECTION_KEYWORDS,
  PHASE2A_SECTION_MAX_CHARS,
  PHASE2A_SECTION_ORDER,
  PHASE2A_SECTION_TITLES,
  type Phase2ASectionId,
} from "./keywords.js";

type PageText = { page: number; text: string };

export interface Phase2AExtractInput {
  pdfPath: string;
  outputPath?: string;
  verbose?: boolean;
}

function truncateAroundKeyword(content: string, keywords: string[], maxChars: number): string {
  if (content.length <= maxChars) return content;

  let firstMatchIndex = -1;
  for (const keyword of keywords) {
    const index = content.indexOf(keyword);
    if (index >= 0 && (firstMatchIndex < 0 || index < firstMatchIndex)) {
      firstMatchIndex = index;
    }
  }

  if (firstMatchIndex < 0) return content.slice(0, maxChars);

  const start = Math.max(0, firstMatchIndex - Math.floor(maxChars * 0.35));
  const end = Math.min(content.length, start + maxChars);
  return content.slice(start, end);
}

async function extractPageTexts(pdfPath: string): Promise<PageText[]> {
  const raw = await readFile(pdfPath);
  const parser = new PDFParse({ data: new Uint8Array(raw) });
  try {
    const textResult = await parser.getText({
      lineEnforce: true,
      pageJoiner: "\n",
    });
    return textResult.pages.map((page) => ({
      page: page.num,
      text: page.text ?? "",
    }));
  } finally {
    await parser.destroy();
  }
}

function findBestPageForSection(sectionId: Phase2ASectionId, pages: PageText[]): number | undefined {
  const keywords = PHASE2A_SECTION_KEYWORDS[sectionId];
  for (const page of pages) {
    if (!page.text) continue;
    if (keywords.some((keyword) => page.text.includes(keyword))) {
      return page.page;
    }
  }
  return undefined;
}

function buildSectionBlock(
  sectionId: Phase2ASectionId,
  pages: PageText[],
  bestPage: number,
): PdfSectionBlock | undefined {
  const bufferPages = PHASE2A_SECTION_BUFFER_PAGES[sectionId];
  const start = Math.max(1, bestPage - bufferPages);
  const end = Math.min(pages.length, bestPage + bufferPages);

  const collected = pages
    .filter((page) => page.page >= start && page.page <= end)
    .map((page) => `--- p.${page.page} ---\n${page.text}`)
    .join("\n\n")
    .trim();

  if (!collected) return undefined;

  return {
    title: PHASE2A_SECTION_TITLES[sectionId],
    content: truncateAroundKeyword(
      collected,
      PHASE2A_SECTION_KEYWORDS[sectionId],
      PHASE2A_SECTION_MAX_CHARS[sectionId],
    ),
    pageFrom: start,
    pageTo: end,
  };
}

function writeSection(
  target: PdfSections,
  sectionId: Phase2ASectionId,
  value: PdfSectionBlock | undefined,
): void {
  if (!value) return;
  if (sectionId === "P2") target.P2 = value;
  if (sectionId === "P3") target.P3 = value;
  if (sectionId === "P4") target.P4 = value;
  if (sectionId === "P6") target.P6 = value;
  if (sectionId === "P13") target.P13 = value;
  if (sectionId === "MDA") target.MDA = value;
  if (sectionId === "SUB") target.SUB = value;
}

export async function runPhase2AExtractPdfSections(input: Phase2AExtractInput): Promise<PdfSections> {
  const pages = await extractPageTexts(input.pdfPath);
  const metadata = {
    pdfFile: path.basename(input.pdfPath),
    totalPages: pages.length,
    extractTime: new Date().toISOString(),
    sectionsFound: 0,
    sectionsTotal: PHASE2A_SECTION_ORDER.length,
  };

  const sections: PdfSections = { metadata };
  for (const sectionId of PHASE2A_SECTION_ORDER) {
    const bestPage = findBestPageForSection(sectionId, pages);
    if (!bestPage) continue;
    const block = buildSectionBlock(sectionId, pages, bestPage);
    if (!block) continue;
    writeSection(sections, sectionId, block);
    sections.metadata.sectionsFound += 1;
    if (input.verbose) {
      // Keep logs terse for CLI use.
      console.log(`[phase2a] ${sectionId} -> pages ${block.pageFrom}-${block.pageTo}`);
    }
  }

  if (input.outputPath) {
    const outDir = path.dirname(input.outputPath);
    await mkdir(outDir, { recursive: true });
    await writeFile(input.outputPath, JSON.stringify(sections, null, 2), "utf-8");
  }

  return sections;
}
