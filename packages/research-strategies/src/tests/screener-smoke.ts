#!/usr/bin/env node
/**
 * 选股器契约烟测（内存 fixture，不依赖外部 feed）。
 * `pnpm run build && pnpm --filter @trade-signal/research-strategies run test:screener`
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ScreenerDiskCache } from "../screener/cache.js";
import { getDefaultScreenerConfig, resolveScreenerConfig, validateScreenerConfig } from "../screener/config.js";
import { parseScreenerUniversePayload } from "../screener/http-source.js";
import { tier1FilterCnA } from "../screener/cn-a.js";
import { exportScreenerResultsCsv } from "../screener/export-results.js";
import { buildUniverseCapability } from "../screener/capability.js";
import { computeFactorSummary, runScreenerPipeline } from "../screener/pipeline.js";
import type { ScreenerUniverseRow } from "../screener/types.js";

async function testDiskCache(): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "screener-cache-"));
  try {
    const c = new ScreenerDiskCache(dir);
    assert.equal(await c.get<{ a: number }>("k1", 3600), null);
    await c.put("k1", { a: 1 });
    const v = await c.get<{ a: number }>("k1", 3600);
    assert.deepEqual(v, { a: 1 });
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(await c.get<{ a: number }>("k1", 0), null);
    await c.put("tier2_X_income", { x: 1 });
    await c.put("stock_basic_all", { y: 2 });
    await c.invalidatePrefix("tier2_");
    assert.equal(await c.get("tier2_X_income", 3600), null);
    assert.deepEqual(await c.get<{ y: number }>("stock_basic_all", 3600), { y: 2 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function testConfig(): void {
  const cfg = getDefaultScreenerConfig("CN_A");
  assert.equal(cfg.minTurnoverPct, 0.1);
  assert.equal(cfg.obsChannelLimit, 50);
  assert.equal(cfg.tier2MainLimit, 150);
  assert.equal(cfg.minMarketCapYi, 5);
  assert.deepEqual(validateScreenerConfig(cfg), []);

  const bad = resolveScreenerConfig("CN_A", {
    weightRoe: 0.5,
    weightFcfYield: 0.5,
    weightPenetrationR: 0.5,
    weightEvEbitda: 0,
    weightFloorPremium: 0,
  });
  assert.ok(validateScreenerConfig(bad).length > 0);

  const legacy = resolveScreenerConfig("CN_A", { minMarketCap: 500 });
  assert.equal(legacy.minMarketCapYi, 5);
}

function testTier1Filter(): void {
  const cfg = getDefaultScreenerConfig("CN_A");
  const rows: ScreenerUniverseRow[] = [
    {
      code: "000001.SZ",
      name: "平安银行",
      market: "CN_A",
      industry: "银行",
      listDate: "19910403",
      marketCap: 2000,
      turnover: 1,
      pb: 1,
      pe: 8,
      dv: 3,
    },
    {
      code: "000002.SZ",
      name: "测试科技",
      market: "CN_A",
      industry: "软件",
      listDate: "20180101",
      marketCap: 2000,
      turnover: 1,
      pb: 2,
      pe: 12,
      dv: 2,
    },
    {
      code: "000003.SZ",
      name: "亏损观察",
      market: "CN_A",
      industry: "软件",
      listDate: "20150101",
      marketCap: 9000,
      turnover: 1,
      pb: 3,
      dv: 0,
    },
    {
      code: "000004.SZ",
      name: "PE零排除",
      market: "CN_A",
      industry: "软件",
      listDate: "20150101",
      marketCap: 8000,
      turnover: 1,
      pb: 2,
      pe: 0,
      dv: 1,
    },
  ];

  const out = tier1FilterCnA(rows, cfg);
  const codes = new Set(out.map((r) => r.code));
  assert.ok(!codes.has("000001.SZ"), "银行应被剔除");
  assert.ok(codes.has("000002.SZ"), "主通道应保留");
  assert.ok(codes.has("000003.SZ"), "缺失 PE 应进观察通道");
  assert.ok(!codes.has("000004.SZ"), "PE=0 既非主通道也非观察（与 Python NaN-only 观察一致）");
}

function testFactor2R(): void {
  const cfg = getDefaultScreenerConfig("CN_A");
  const row: ScreenerUniverseRow = {
    code: "T.SZ",
    name: "T",
    market: "CN_A",
    ocf: 100,
    capex: -20,
    marketCap: 1000,
    payoutRatio: 30,
  };
  const f = computeFactorSummary(row, cfg);
  assert.ok(f.penetrationR !== undefined);
  assert.ok(Math.abs((f.penetrationR ?? 0) - 2.4) < 1e-6, `R expected 2.4, got ${f.penetrationR}`);
}

function testFloorPremiumSource(): void {
  const cfg = getDefaultScreenerConfig("CN_A");
  const prev = process.env.SCREENER_FLOOR_PREMIUM_FALLBACK;
  try {
    delete process.env.SCREENER_FLOOR_PREMIUM_FALLBACK;
    const fromField = computeFactorSummary(
      { code: "A", name: "A", market: "CN_A", floorPremium: 5, pe: 9 } as ScreenerUniverseRow,
      cfg,
    );
    assert.equal(fromField.floorPremiumSource, "universe_field");
    assert.equal(fromField.floorPremium, 5);

    const peFallback = computeFactorSummary(
      { code: "B", name: "B", market: "CN_A", pe: 9 } as ScreenerUniverseRow,
      cfg,
    );
    assert.equal(peFallback.floorPremiumSource, "pe_over_3_heuristic");
    assert.ok(Math.abs((peFallback.floorPremium ?? 0) - 3) < 1e-9);

    process.env.SCREENER_FLOOR_PREMIUM_FALLBACK = "zero";
    const zeroFb = computeFactorSummary(
      { code: "C", name: "C", market: "CN_A", pe: 9 } as ScreenerUniverseRow,
      cfg,
    );
    assert.equal(zeroFb.floorPremiumSource, "zero_fallback");
    assert.equal(zeroFb.floorPremium, 0);
  } finally {
    if (prev === undefined) delete process.env.SCREENER_FLOOR_PREMIUM_FALLBACK;
    else process.env.SCREENER_FLOOR_PREMIUM_FALLBACK = prev;
  }
}

async function testUniverseCapabilityHkEmpty(): Promise<void> {
  const cap = buildUniverseCapability("HK", []);
  assert.equal(cap.status, "hk_not_ready");
  assert.ok(cap.reasonCodes.includes("hk_screener_universe_not_implemented"));

  const out = await runScreenerPipeline({
    market: "HK",
    mode: "standalone",
    universe: [],
    tier1Only: true,
  });
  assert.equal(out.capability?.status, "hk_not_ready");
  assert.equal(out.results.length, 0);
}

async function testUniverseCapabilityBlockedMissingMarketCap(): Promise<void> {
  const row: ScreenerUniverseRow = {
    code: "000001.SZ",
    name: "T",
    market: "CN_A",
    industry: "软件",
    listDate: "20180101",
    close: 10,
    pb: 2,
    dv: 2,
    turnover: 1,
  };
  const out = await runScreenerPipeline({
    market: "CN_A",
    mode: "standalone",
    universe: [row],
    tier1Only: true,
  });
  assert.equal(out.capability?.status, "blocked_missing_required_fields");
  assert.equal(out.results.length, 0);
}

async function testUniverseCapabilityDegradedTier2(): Promise<void> {
  const row: ScreenerUniverseRow = {
    code: "000002.SZ",
    name: "T",
    market: "CN_A",
    industry: "软件",
    listDate: "20180101",
    close: 10,
    pb: 2,
    dv: 2,
    marketCap: 2000,
    turnover: 1,
    pe: 12,
  };
  const out = await runScreenerPipeline({
    market: "CN_A",
    mode: "standalone",
    universe: [row],
    tier1Only: true,
  });
  assert.equal(out.capability?.status, "degraded_tier2_fields");
  assert.ok(out.results.length >= 1);
}

function testParseScreenerUniversePayload(): void {
  const url = "http://example/stock/screener/universe";
  assert.throws(() => parseScreenerUniversePayload([], url), /根须为 JSON 对象/);
  assert.throws(() => parseScreenerUniversePayload({ success: true, data: [] }, url), /data 须为对象/);
  assert.throws(
    () => parseScreenerUniversePayload({ success: true, data: { total: 0, page: 1, pageSize: 10 } }, url),
    /缺少 data.items/,
  );
  assert.throws(
    () =>
      parseScreenerUniversePayload(
        { success: true, data: { items: [], page: 1, pageSize: 10 } },
        url,
      ),
    /data.total/,
  );
  const parsed = parseScreenerUniversePayload(
    {
      success: true,
      data: {
        market: "CN_A",
        total: 2,
        page: 1,
        pageSize: 500,
        items: [{ code: "1", name: "A" }],
        capability: "partial",
        degradeReasons: ["x"],
        pagination: { mode: "offset_page" },
      },
    },
    url,
  );
  assert.equal(parsed.total, 2);
  assert.equal(parsed.items.length, 1);
}

async function testTier1OnlyPipeline(): Promise<void> {
  const universe: ScreenerUniverseRow[] = [
    {
      code: "000002.SZ",
      name: "测试科技",
      market: "CN_A",
      industry: "软件",
      listDate: "20180101",
      marketCap: 2000,
      turnover: 1,
      pb: 2,
      pe: 12,
      dv: 2,
    },
  ];
  const out = await runScreenerPipeline({
    market: "CN_A",
    mode: "standalone",
    universe,
    tier1Only: true,
  });
  assert.equal(out.tier1Only, true);
  assert.ok(out.results.length >= 1);
  const csv = exportScreenerResultsCsv(out);
  assert.ok(csv.includes("ts_code"));
}

async function main(): Promise<void> {
  testConfig();
  testTier1Filter();
  testFactor2R();
  testFloorPremiumSource();
  testParseScreenerUniversePayload();
  await testUniverseCapabilityHkEmpty();
  await testUniverseCapabilityBlockedMissingMarketCap();
  await testUniverseCapabilityDegradedTier2();
  await testDiskCache();
  await testTier1OnlyPipeline();
  console.log("[test:screener] ok");
}

void main();
