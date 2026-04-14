#!/usr/bin/env node
/**
 * Phase2A 分区/关键词契约烟测（无需真实 PDF）。
 * `pnpm run build && pnpm --filter @trade-signal/research-strategies run test:phase2`
 */
import assert from "node:assert/strict";

import { PHASE2A_SECTION_ORDER } from "../phase2a/keywords.js";
import {
  detectPageZones,
  PHASE2A_SECTION_ZONE_PREFERENCES,
  PHASE2A_ZONE_MARKERS,
} from "../phase2a/zones.js";
import { sanitizePhase2ExtractedText } from "../phase2b/renderer.js";

function main(): void {
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

  console.log("[test:phase2] ok");
}

main();
