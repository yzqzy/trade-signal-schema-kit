#!/usr/bin/env node
/**
 * Phase1B 证据质量指标烟测（无需外网）。
 * `pnpm run build && pnpm --filter @trade-signal/research-strategies run test:phase1b-quality`
 */
import { initCliEnv } from "../lib/init-cli-env.js";
import assert from "node:assert/strict";

import { computePhase1bEvidenceQualityMetrics } from "../stages/phase1b/evidence-quality.js";
import type { Phase1BQualitativeSupplement } from "../stages/phase1b/types.js";

function main(): void {
  initCliEnv();
  const sample: Phase1BQualitativeSupplement = {
    stockCode: "002160",
    companyName: "常铝股份",
    year: "2024",
    generatedAt: new Date().toISOString(),
    channel: "http",
    section7: [
      {
        item: "违规/处罚记录",
        content: "问询函",
        evidences: [{ title: "关于收到监管问询函的公告", url: "https://static.cninfo.com.cn/a.pdf" }],
      },
      {
        item: "违规/处罚记录",
        content: "复制",
        evidences: [{ title: "关于收到监管问询函的公告", url: "https://static.cninfo.com.cn/a.pdf" }],
      },
    ],
    section8: [
      {
        item: "行业监管动态",
        content: "监管",
        evidences: [{ title: "某监管政策影响说明", url: "https://static.cninfo.com.cn/b.pdf" }],
      },
    ],
    section10: [],
  };

  const m = computePhase1bEvidenceQualityMetrics(sample);
  assert.equal(m.stockCode, "002160");
  assert.equal(m.byItem.length, 3, "byItem should list §7 + §8 rows (§10 empty)");
  assert.equal(m.byItem.filter((r) => r.catalog === "7").length, 2);
  assert.equal(m.byItem.filter((r) => r.catalog === "8").length, 1);
  assert.ok(m.section7.crossItemDuplicateUrlRatio > 0, "same URL in two §7 items should count as cross-item dup");
  assert.ok(m.section7.topicHitRatio >= 0 && m.section7.topicHitRatio <= 1);
  assert.ok(m.crossSectionSharedUrlRatio === 0, "no shared urls between §7 and §8");
  console.log("[test:phase1b-quality] ok");
}

main();
