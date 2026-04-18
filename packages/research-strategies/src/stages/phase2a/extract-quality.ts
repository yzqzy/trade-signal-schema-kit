import type { PdfExtractGateVerdict, PdfExtractQualitySummary, PdfSectionBlock, PdfSections } from "@trade-signal/schema-core";

const CRITICAL_IDS = ["MDA", "P4", "P13"] as const;

function sectionBlock(sections: PdfSections, id: (typeof CRITICAL_IDS)[number]): PdfSectionBlock | undefined {
  const rec = sections as unknown as Record<string, PdfSectionBlock | undefined>;
  return rec[id];
}

/**
 * 聚合 PDF 章节抽取质量：关键块缺失 → CRITICAL；仅低置信关键块 → DEGRADED。
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

  return {
    gateVerdict,
    criticalSectionIds: CRITICAL_IDS,
    missingCritical,
    lowConfidenceCritical,
    sectionsFound: sections.metadata.sectionsFound,
    sectionsTotal: sections.metadata.sectionsTotal,
  };
}
