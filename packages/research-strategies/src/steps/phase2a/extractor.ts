import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PDFParse } from "pdf-parse";

import type {
  PdfSectionBlock,
  PdfSectionDiagnosticEntry,
  PdfSections,
  Phase2SectionConfidence,
} from "@trade-signal/schema-core";

import {
  PHASE2A_SECTION_BUFFER_PAGES,
  PHASE2A_SECTION_KEYWORDS,
  PHASE2A_SECTION_MAX_CHARS,
  PHASE2A_SECTION_MAX_SPAN_PAGES,
  PHASE2A_SECTION_PHASE2B_TARGETS,
  PHASE2A_SECTION_ORDER,
  PHASE2A_SECTION_TITLES,
  type Phase2ASectionId,
} from "./keywords.js";
import {
  detectPageZones,
  PHASE2A_SECTION_ZONE_PREFERENCES,
  type PageText,
} from "./zones.js";
import { computePdfExtractQuality } from "./extract-quality.js";
import { extractPageTextsPdfjs } from "./pdf-text-pdfjs.js";

type PageCandidate = { page: number; score: number };

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

function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  let from = 0;
  let count = 0;
  while (from < text.length) {
    const index = text.indexOf(needle, from);
    if (index < 0) break;
    count += 1;
    from = index + needle.length;
  }
  return count;
}

function detectAnnexStartPage(pages: PageText[]): number {
  const total = pages.length;
  for (const page of pages) {
    if (!page.text) continue;
    if (/第[十0-9一二三四五六七八九百]+节\s*财务报告/.test(page.text)) {
      return page.page;
    }
  }

  const financeLowerBound = Math.max(5, Math.floor(total * 0.15));
  for (const page of pages) {
    if (!page.text || page.page < financeLowerBound) continue;
    if (/财务报告/.test(page.text)) return page.page;
  }

  const noteLowerBound = Math.max(20, Math.floor(total * 0.25));
  for (const page of pages) {
    if (!page.text || page.page < noteLowerBound) continue;
    if (/附注/.test(page.text)) return page.page;
  }

  return Math.max(1, Math.floor(total * 0.35));
}

function isLikelyTocPage(text: string): boolean {
  if (!text) return false;
  const tocHit = /目\s*录/.test(text);
  const dotLineHits = (text.match(/\.{6,}/g) ?? []).length;
  return tocHit || dotLineHits >= 3;
}

function isPhase2BTarget(sectionId: Phase2ASectionId): boolean {
  return (PHASE2A_SECTION_PHASE2B_TARGETS as readonly string[]).includes(sectionId);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function headingBonusForKeyword(text: string, keyword: string): number {
  const esc = escapeRegExp(keyword);
  const pats = [new RegExp(`\\d+[、.．]\\s*${esc}`), new RegExp(`[一二三四五六七八九十百]+[、.．]\\s*${esc}`)];
  return pats.some((p) => p.test(text)) ? 12 : 0;
}

function crossReferencePenalty(text: string, keyword: string): number {
  const idx = text.indexOf(keyword);
  if (idx < 0) return 0;
  const before = text.slice(Math.max(0, idx - 40), idx);
  return /详见|参见|参照/.test(before) ? -28 : 0;
}

function subContextAdjustment(text: string, keyword: string): number {
  const idx = text.indexOf(keyword);
  if (idx < 0) return 0;
  const win = text.slice(Math.max(0, idx - 200), Math.min(text.length, idx + 200));
  const acct = ["权益法", "账面余额", "减值准备", "成本法", "账面价值"];
  const subs = ["主营业务", "营业收入", "净利润", "注册资本", "持股比例"];
  let adj = 0;
  if (acct.filter((a) => win.includes(a)).length >= 2) adj -= 20;
  if (subs.filter((s) => win.includes(s)).length >= 2) adj += 14;
  return adj;
}

function p3ContextAdjustment(text: string, keyword: string): number {
  const idx = text.indexOf(keyword);
  if (idx < 0) return 0;
  const win = text.slice(Math.max(0, idx - 200), Math.min(text.length, idx + 200));
  const nonAr = ["预付款项", "预付账款", "预付", "应付账款", "应付票据", "其他应付"];
  return nonAr.some((t) => win.includes(t)) ? -24 : 0;
}

function zoneAdjustment(
  sectionId: Phase2ASectionId,
  zone: string | undefined,
  pageNo: number,
  annexStartPage: number,
  totalPages: number,
): number {
  const prefs = PHASE2A_SECTION_ZONE_PREFERENCES[sectionId];
  if (zone && prefs) {
    if (prefs.prefer.includes(zone)) return 24;
    if (prefs.avoid.includes(zone)) return -24;
  }
  if (isPhase2BTarget(sectionId)) {
    if (pageNo >= annexStartPage) return zone ? 8 : 20;
    return -18;
  }
  if (sectionId === "MDA") {
    if (zone === "MDA_ZONE") return 24;
    if (zone && prefs && prefs.avoid.includes(zone)) return -14;
    return pageNo < annexStartPage ? 16 : -10;
  }
  if (!zone && totalPages > 0 && pageNo / totalPages > 0.32) return 4;
  return 0;
}

function scoreSectionCandidate(
  sectionId: Phase2ASectionId,
  page: PageText,
  annexStartPage: number,
  totalPages: number,
  pageZones: Map<number, string>,
): number {
  const keywords = PHASE2A_SECTION_KEYWORDS[sectionId];
  if (!page.text) return 0;
  let score = 0;
  let matched = false;
  for (const keyword of keywords) {
    const hits = countOccurrences(page.text, keyword);
    if (hits <= 0) continue;
    matched = true;
    score += 22;
    score += hits * 3;
    const lineHit = page.text
      .split("\n")
      .some((line) => line.length <= 72 && line.includes(keyword));
    if (lineHit) score += 12;
    score += headingBonusForKeyword(page.text, keyword);
    score += crossReferencePenalty(page.text, keyword);
    if (sectionId === "SUB") score += subContextAdjustment(page.text, keyword);
    if (sectionId === "P3") score += p3ContextAdjustment(page.text, keyword);
    break;
  }
  if (!matched) return 0;
  if (isLikelyTocPage(page.text)) score -= 55;
  const zone = pageZones.get(page.page);
  score += zoneAdjustment(sectionId, zone, page.page, annexStartPage, totalPages);
  return score;
}

function confidenceFromScores(top: number, runnerUp: number | undefined): Phase2SectionConfidence {
  if (top < 22) return "low";
  if (runnerUp === undefined || top - runnerUp >= 12) return "high";
  if (top - runnerUp >= 6) return "medium";
  return "low";
}

function buildSectionBoundaryMatchers(sectionId: Phase2ASectionId): RegExp[] {
  const others = PHASE2A_SECTION_ORDER.filter((id) => id !== sectionId);
  const titles = others.map((id) => PHASE2A_SECTION_TITLES[id]);
  const keywords = others.flatMap((id) => PHASE2A_SECTION_KEYWORDS[id].slice(0, 2));
  return [...titles, ...keywords].map((token) => new RegExp(escapeRegExp(token)));
}

function findSectionEndPage(
  sectionId: Phase2ASectionId,
  bestPage: number,
  startPage: number,
  pages: PageText[],
  annexStartPage: number,
): number {
  const buffer = PHASE2A_SECTION_BUFFER_PAGES[sectionId];
  const boundaryMatchers = buildSectionBoundaryMatchers(sectionId);
  const maxPage = Math.min(pages.length, bestPage + Math.max(buffer + 3, 6));
  for (let pageNo = bestPage + 1; pageNo <= maxPage; pageNo += 1) {
    const page = pages[pageNo - 1];
    if (!page?.text) continue;
    const hitBoundary = boundaryMatchers.some((matcher) => matcher.test(page.text));
    if (hitBoundary) return Math.max(bestPage, pageNo - 1);
  }
  if (isPhase2BTarget(sectionId)) {
    return Math.min(pages.length, Math.max(bestPage, bestPage + buffer));
  }
  if (sectionId === "MDA" && bestPage < annexStartPage) {
    return Math.min(pages.length, Math.max(bestPage + 1, annexStartPage - 1));
  }
  return Math.min(pages.length, bestPage + buffer);
}

function clampEndToMaxSpan(
  sectionId: Phase2ASectionId,
  startPage: number,
  endPage: number,
  totalPages: number,
): { end: number; clamped: boolean } {
  const maxSpan = PHASE2A_SECTION_MAX_SPAN_PAGES[sectionId];
  const maxEnd = Math.min(totalPages, startPage + maxSpan - 1);
  if (endPage <= maxEnd) return { end: endPage, clamped: false };
  return { end: maxEnd, clamped: true };
}

function listCandidatesForSection(
  sectionId: Phase2ASectionId,
  pages: PageText[],
  annexStartPage: number,
  pageZones: Map<number, string>,
): PageCandidate[] {
  const total = pages.length;
  const scored: PageCandidate[] = [];
  for (const page of pages) {
    const score = scoreSectionCandidate(sectionId, page, annexStartPage, total, pageZones);
    if (score > 0) scored.push({ page: page.page, score });
  }
  scored.sort((a, b) => b.score - a.score || a.page - b.page);
  const bestByPage = new Map<number, number>();
  for (const c of scored) {
    bestByPage.set(c.page, Math.max(bestByPage.get(c.page) ?? 0, c.score));
  }
  return [...bestByPage.entries()]
    .map(([p, s]) => ({ page: p, score: s }))
    .sort((a, b) => b.score - a.score || a.page - b.page);
}

function buildSectionBlock(
  sectionId: Phase2ASectionId,
  pages: PageText[],
  bestPage: number,
  annexStartPage: number,
  confidence: Phase2SectionConfidence,
  runnerUp?: PageCandidate,
  opts?: { scoreTieApplied?: boolean },
): PdfSectionBlock | undefined {
  const bufferPages = PHASE2A_SECTION_BUFFER_PAGES[sectionId];
  let start = Math.max(1, bestPage - bufferPages);
  if (isPhase2BTarget(sectionId)) {
    start = Math.max(start, annexStartPage);
  }
  let end = findSectionEndPage(sectionId, bestPage, start, pages, annexStartPage);
  if (end < start) end = start;

  const { end: endClamped, clamped } = clampEndToMaxSpan(sectionId, start, end, pages.length);
  end = endClamped;

  const warnings: string[] = [];
  if (opts?.scoreTieApplied) {
    warnings.push(
      "候选页得分并列：已按启发式缩小分差用于定位置信度计算，边界仍为启发式截断，建议人工核对页码范围。",
    );
  }
  if (confidence === "low") {
    warnings.push("定位置信度低：存在相近候选页或关键词上下文弱，建议人工核对页码范围。");
  } else if (confidence === "medium" && runnerUp) {
    warnings.push(
      `存在备选命中页 p.${runnerUp.page}（得分 ${runnerUp.score.toFixed(0)}），边界为启发式截断。`,
    );
  }
  if (clamped) {
    warnings.push(
      `已达章节最大跨度上限（${PHASE2A_SECTION_MAX_SPAN_PAGES[sectionId]} 页），后续内容可能被截断。`,
    );
  }

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
    confidence,
    extractionWarnings: warnings.length > 0 ? warnings : undefined,
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

function readSection(sections: PdfSections, sectionId: Phase2ASectionId): PdfSectionBlock | undefined {
  if (sectionId === "P2") return sections.P2;
  if (sectionId === "P3") return sections.P3;
  if (sectionId === "P4") return sections.P4;
  if (sectionId === "P6") return sections.P6;
  if (sectionId === "P13") return sections.P13;
  if (sectionId === "MDA") return sections.MDA;
  if (sectionId === "SUB") return sections.SUB;
  return undefined;
}

function confidenceRank(c: Phase2SectionConfidence | undefined): number {
  if (c === "high") return 3;
  if (c === "medium") return 2;
  if (c === "low") return 1;
  return 0;
}

function diagnosticEntry(
  best: PageCandidate,
  runnerUp: PageCandidate | undefined,
  ranked: PageCandidate[],
  textBackend: "pdf-parse" | "pdfjs-dist",
): { entry: PdfSectionDiagnosticEntry; scoreTieApplied: boolean } {
  const scoreTie = Boolean(runnerUp && runnerUp.score === best.score);
  const runnerScoreForConfidence = scoreTie ? runnerUp!.score - 8 : runnerUp?.score;
  const rawConfidence = confidenceFromScores(best.score, runnerUp?.score);
  const confidence = confidenceFromScores(best.score, runnerScoreForConfidence);
  const scoreTieApplied = scoreTie && rawConfidence === "low" && confidence !== rawConfidence;
  const topCandidates = ranked.slice(0, 5).map((c) => ({ page: c.page, score: c.score }));
  const entry: PdfSectionDiagnosticEntry = {
    bestPage: best.page,
    score: best.score,
    confidence,
    runnerUpPage: runnerUp?.page,
    runnerUpScore: runnerUp?.score,
    topCandidates: topCandidates.length > 0 ? topCandidates : undefined,
    textBackend,
  };
  return { entry, scoreTieApplied };
}

function recountSectionsFound(sections: PdfSections): void {
  let n = 0;
  for (const sectionId of PHASE2A_SECTION_ORDER) {
    if (readSection(sections, sectionId)) n += 1;
  }
  sections.metadata.sectionsFound = n;
}

const PDFJS_FALLBACK_SECTIONS: Phase2ASectionId[] = ["P3", "P13"];

function shouldAttemptPdfjsFallback(sections: PdfSections): boolean {
  for (const id of PDFJS_FALLBACK_SECTIONS) {
    const block = readSection(sections, id);
    const diag = sections.metadata.sectionDiagnostics?.[id];
    if (!block) return true;
    if (diag?.confidence === "low") return true;
  }
  return false;
}

function mergePdfjsFallbackSections(primary: PdfSections, alt: PdfSections, ids: readonly Phase2ASectionId[]): void {
  for (const id of ids) {
    const primaryBlock = readSection(primary, id);
    const altBlock = readSection(alt, id);
    const altDiag = alt.metadata.sectionDiagnostics?.[id];
    if (!altBlock || !altDiag) continue;

    const useAlt =
      !primaryBlock ||
      confidenceRank(altBlock.confidence) > confidenceRank(primaryBlock.confidence) ||
      (primaryBlock.confidence === "low" && altBlock.confidence !== "low");

    if (!useAlt) continue;

    altBlock.extractionWarnings = [
      ...(altBlock.extractionWarnings ?? []),
      !primaryBlock
        ? "本块文本由 pdfjs-dist 二次抽取融合得到（主路径未命中该块），仍建议对照原 PDF 复核。"
        : "本块经 pdfjs-dist 二次抽取融合相对主路径提升定位置信度，仍建议对照原 PDF 复核。",
    ];
    writeSection(primary, id, altBlock);
    primary.metadata.sectionDiagnostics![id] = { ...altDiag, textBackend: "pdfjs-dist" };
  }
}

function buildPdfSectionsFromPages(
  pages: PageText[],
  input: Pick<Phase2AExtractInput, "pdfPath" | "verbose">,
  textBackend: "pdf-parse" | "pdfjs-dist",
): PdfSections {
  const annexStartPage = detectAnnexStartPage(pages);
  const pageZones = detectPageZones(pages);

  const metadata: PdfSections["metadata"] = {
    pdfFile: path.basename(input.pdfPath),
    totalPages: pages.length,
    extractTime: new Date().toISOString(),
    sectionsFound: 0,
    sectionsTotal: PHASE2A_SECTION_ORDER.length,
    annexStartPageEstimate: annexStartPage,
    sectionDiagnostics: {},
  };

  const sections: PdfSections = { metadata };
  for (const sectionId of PHASE2A_SECTION_ORDER) {
    const ranked = listCandidatesForSection(sectionId, pages, annexStartPage, pageZones);
    const best = ranked[0];
    if (!best) continue;
    const runnerUp = ranked[1];
    const { entry: diag, scoreTieApplied } = diagnosticEntry(best, runnerUp, ranked, textBackend);
    metadata.sectionDiagnostics![sectionId] = diag;

    const block = buildSectionBlock(
      sectionId,
      pages,
      best.page,
      annexStartPage,
      diag.confidence,
      runnerUp,
      { scoreTieApplied },
    );
    if (!block) continue;
    writeSection(sections, sectionId, block);
    sections.metadata.sectionsFound += 1;
    if (input.verbose) {
      console.log(
        `[phase2a] ${sectionId} [${textBackend}] -> pages ${block.pageFrom}-${block.pageTo} (score=${best.score.toFixed(1)}, conf=${diag.confidence}, annex≈${annexStartPage})`,
      );
    }
  }

  return sections;
}

export async function runPhase2AExtractPdfSections(input: Phase2AExtractInput): Promise<PdfSections> {
  const pagesPrimary = await extractPageTexts(input.pdfPath);
  const sections = buildPdfSectionsFromPages(pagesPrimary, input, "pdf-parse");

  let usedPdfjs = false;
  if (shouldAttemptPdfjsFallback(sections)) {
    try {
      const pagesPdfjs = await extractPageTextsPdfjs(input.pdfPath);
      if (pagesPdfjs.length > 0) {
        const alt = buildPdfSectionsFromPages(pagesPdfjs, input, "pdfjs-dist");
        mergePdfjsFallbackSections(sections, alt, PDFJS_FALLBACK_SECTIONS);
        usedPdfjs = true;
      }
    } catch (err) {
      if (input.verbose) {
        console.warn("[phase2a] pdfjs-dist fallback failed:", err);
      }
    }
  }

  sections.metadata.pdfTextBackendsUsed = usedPdfjs ? (["pdf-parse", "pdfjs-dist"] as const) : (["pdf-parse"] as const);
  recountSectionsFound(sections);
  sections.metadata.extractQuality = computePdfExtractQuality(sections);

  if (input.outputPath) {
    const outDir = path.dirname(input.outputPath);
    await mkdir(outDir, { recursive: true });
    await writeFile(input.outputPath, JSON.stringify(sections, null, 2), "utf-8");
  }

  return sections;
}
