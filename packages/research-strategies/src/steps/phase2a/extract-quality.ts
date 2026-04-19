import type { PdfExtractGateVerdict, PdfExtractQualitySummary, PdfSectionBlock, PdfSections } from "@trade-signal/schema-core";

const CRITICAL_IDS = ["MDA", "P4", "P13"] as const;

const REVIEW_PRIORITY_ORDER = ["P13", "P4", "P3", "MDA", "P2", "P6", "SUB"] as const;

function sectionBlock(sections: PdfSections, id: (typeof CRITICAL_IDS)[number]): PdfSectionBlock | undefined {
  const rec = sections as unknown as Record<string, PdfSectionBlock | undefined>;
  return rec[id];
}

function buildHumanReviewPriority(missingCritical: string[], lowConfidenceCritical: string[]): string[] {
  const set = new Set<string>([...missingCritical, ...lowConfidenceCritical]);
  const ordered: string[] = [];
  for (const id of REVIEW_PRIORITY_ORDER) {
    if (set.has(id)) ordered.push(id);
  }
  for (const id of set) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

/**
 * 聚合 PDF 章节抽取质量：关键块缺失 → CRITICAL；仅低置信关键块 → DEGRADED。
 * DEGRADED 仍允许终稿标「完成」但须强制 PDF 质量声明（见 `allowsFinalNarrativeComplete`）。
 */
export function computePdfExtractQuality(sections: PdfSections): PdfExtractQualitySummary {
  const missingCritical = CRITICAL_IDS.filter((id) => !sectionBlock(sections, id)).map(String);
  const lowConfidenceCritical = CRITICAL_IDS.filter((id) => {
    const b = sectionBlock(sections, id);
    return Boolean(b && b.confidence === "low");
  }).map(String);

  let gateVerdict: PdfExtractGateVerdict = "OK";
  if (missingCritical.length > 0) gateVerdict = "CRITICAL";
  else if (lowConfidenceCritical.length > 0) gateVerdict = "DEGRADED";

  const allowsFinalNarrativeComplete = gateVerdict !== "CRITICAL";
  const humanReviewPriority = buildHumanReviewPriority(missingCritical, lowConfidenceCritical);
  const pdfTextBackendsUsed = sections.metadata.pdfTextBackendsUsed;

  return {
    gateVerdict,
    criticalSectionIds: CRITICAL_IDS,
    missingCritical,
    lowConfidenceCritical,
    sectionsFound: sections.metadata.sectionsFound,
    sectionsTotal: sections.metadata.sectionsTotal,
    allowsFinalNarrativeComplete,
    humanReviewPriority: humanReviewPriority.length > 0 ? humanReviewPriority : undefined,
    pdfTextBackendsUsed: pdfTextBackendsUsed && pdfTextBackendsUsed.length > 0 ? pdfTextBackendsUsed : undefined,
  };
}
