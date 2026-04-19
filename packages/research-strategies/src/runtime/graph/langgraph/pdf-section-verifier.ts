import type { PdfSections } from "@trade-signal/schema-core";

import { computePdfExtractQuality } from "../../../steps/phase2a/extract-quality.js";

/**
 * 确保 `metadata.extractQuality` 存在（确定性指标）。
 * 原 LLM 语义旁路已移除；如需人工复核请在 Claude Code 中对照 PDF。
 */
export async function tryApplyPdfSectionVerifier(sections: PdfSections): Promise<void> {
  sections.metadata.extractQuality = sections.metadata.extractQuality ?? computePdfExtractQuality(sections);
}
