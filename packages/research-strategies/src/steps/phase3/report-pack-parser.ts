import type { DataPackReportParsed } from "./types.js";

const SECTION_IDS = ["P2", "P3", "P4", "P6", "P13", "SUB", "MDA"] as const;

export function parseDataPackReport(markdown?: string): DataPackReportParsed {
  if (!markdown) {
    return { hasReportPack: false, sections: {}, warningHints: [] };
  }
  const sections: DataPackReportParsed["sections"] = {};
  for (const id of SECTION_IDS) {
    const regex = new RegExp(`##\\s*${id}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s*[A-Z0-9]+\\s|$)`, "m");
    const m = markdown.match(regex);
    if (m?.[1]) sections[id] = m[1].trim();
  }
  const warningHints = (markdown.match(/⚠️[^\n]*/g) ?? []).map((s) => s.trim());
  return {
    hasReportPack: true,
    sections,
    warningHints,
  };
}
