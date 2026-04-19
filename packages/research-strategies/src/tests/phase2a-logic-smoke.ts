#!/usr/bin/env node
/**
 * Phase2A 分区/关键词契约烟测（无需真实 PDF）。
 * `pnpm run build && pnpm --filter @trade-signal/research-strategies run test:phase2`
 */
import { initCliEnv } from "../lib/init-cli-env.js";
import assert from "node:assert/strict";

import { PHASE2A_SECTION_ORDER } from "../steps/phase2a/keywords.js";
import {
  detectPageZones,
  PHASE2A_SECTION_ZONE_PREFERENCES,
  PHASE2A_ZONE_MARKERS,
} from "../steps/phase2a/zones.js";
import { sanitizePhase2ExtractedText } from "../steps/phase2b/renderer.js";
import { computePdfExtractQuality } from "../steps/phase2a/extract-quality.js";
import type { PdfSections } from "@trade-signal/schema-core";

function main(): void {
  initCliEnv();
  for (const id of PHASE2A_SECTION_ORDER) {
    assert.ok(
      PHASE2A_SECTION_ZONE_PREFERENCES[id],
      `missing zone preferences for ${id}`,
    );
  }

  assert.ok(PHASE2A_ZONE_MARKERS.length >= 8, "zone markers should cover report skeleton");

  const pages = [
    { page: 1, text: "目录\n公司简介 ........................ 1" },
    { page: 8, text: "第三节 经营情况讨论与分析\n本公司主营业务发展良好。" },
    { page: 40, text: "第七节 财务报告\n合并资产负债表" },
    { page: 55, text: "七、合并财务报表项目注释\n（一）货币资金" },
  ];
  const zones = detectPageZones(pages);
  assert.equal(zones.get(8), "MDA_ZONE");
  assert.equal(zones.get(40), "FIN_ZONE");
  assert.equal(zones.get(55), "NOTES_ZONE");

  const cleaned = sanitizePhase2ExtractedText("a\n\n\n\n\n\nb");
  assert.ok(!cleaned.includes("\n\n\n\n\n"), "should collapse excessive newlines");

  const degradedSections = {
    metadata: {
      pdfFile: "mock.pdf",
      totalPages: 100,
      extractTime: new Date().toISOString(),
      sectionsFound: 3,
      sectionsTotal: 7,
      pdfTextBackendsUsed: ["pdf-parse", "pdfjs-dist"] as const,
    },
    MDA: { content: "x", confidence: "high" as const },
    P4: { content: "x", confidence: "high" as const },
    P13: { content: "x", confidence: "low" as const },
  } satisfies PdfSections;
  const q = computePdfExtractQuality(degradedSections);
  assert.equal(q.gateVerdict, "DEGRADED");
  assert.equal(q.allowsFinalNarrativeComplete, true);
  assert.ok(q.humanReviewPriority?.includes("P13"));

  const criticalSections: PdfSections = {
    metadata: { ...degradedSections.metadata, sectionsFound: 2 },
    MDA: degradedSections.MDA,
    P4: degradedSections.P4,
  };
  const q2 = computePdfExtractQuality(criticalSections);
  assert.equal(q2.gateVerdict, "CRITICAL");
  assert.equal(q2.allowsFinalNarrativeComplete, false);

  console.log("[test:phase2] ok");
}

main();
