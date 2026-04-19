#!/usr/bin/env node
/**
 * Phase1A：财务快照锚定日期 + strict preflight 烟测（无需外网）。
 * `pnpm run build && pnpm --filter @trade-signal/research-strategies run test:phase1a-strict`
 */
import assert from "node:assert/strict";

import { initCliEnv } from "../lib/init-cli-env.js";
import { runPreflightAfterPhase1A } from "../crosscut/preflight/preflight.js";
import { resolveFinancialSnapshotPeriod } from "../steps/phase1a/collector.js";
import type { DataPackMarket } from "@trade-signal/schema-core";

function main(): void {
  initCliEnv();

  assert.equal(resolveFinancialSnapshotPeriod({ code: "x", year: "2024" }), "2024-12-31");
  assert.equal(
    resolveFinancialSnapshotPeriod({ code: "x", from: "2023-06-01", to: "2026-04-18" }),
    "2023-12-31",
    "from 年份优先于 to",
  );
  assert.equal(
    resolveFinancialSnapshotPeriod({ code: "x", to: "2025-01-05" }),
    "2025-12-31",
    "无 year/from 时从 to 取年",
  );
  assert.equal(
    resolveFinancialSnapshotPeriod({ code: "x", financialPeriod: "2024-09-30" }),
    "2024-09-30",
    "显式 financialPeriod 优先",
  );

  const basePack: DataPackMarket = {
    instrument: { code: "600887", market: "CN_A", name: "伊利股份" },
    quote: { code: "600887", price: 25.5, timestamp: "2026-01-01T10:00:00.000Z" },
    klines: [],
    financialSnapshot: {
      code: "600887",
      period: "2024",
      revenue: 100_000,
      netProfit: 10_000,
      totalAssets: 150_000,
    },
  };

  runPreflightAfterPhase1A({
    dataPack: basePack,
    marketPackMarkdown: "## §13 Warnings\n- ok\n",
    level: "strict",
  });

  assert.throws(
    () =>
      runPreflightAfterPhase1A({
        dataPack: {
          ...basePack,
          quote: { ...basePack.quote, price: 0 },
        },
        marketPackMarkdown: "## §13 Warnings\n- ok\n",
        level: "strict",
      }),
    /quote\.price=/,
    "失败信息应带 quote 诊断",
  );

  assert.throws(
    () =>
      runPreflightAfterPhase1A({
        dataPack: {
          ...basePack,
          financialSnapshot: { ...basePack.financialSnapshot!, totalAssets: undefined },
        },
        marketPackMarkdown: "## §13 Warnings\n- ok\n",
        level: "strict",
      }),
    /totalAssets=/,
    "失败信息应带财务诊断",
  );

  console.log("[test:phase1a-strict] ok");
}

main();
