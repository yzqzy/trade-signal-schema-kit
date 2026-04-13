#!/usr/bin/env node
/**
 * 链路级烟测（不替代 quality:all）：市场包结构、2B 含 MDA、D1~D6 契约稿。
 * 运行：`pnpm run build && pnpm --filter @trade-signal/research-strategies run test:linkage`
 */
import assert from "node:assert/strict";

import type { DataPackMarket, PdfSections } from "@trade-signal/schema-core";

import { renderQualitativeD1D6Scaffold } from "../business-analysis/d1-d6-scaffold.js";
import { renderPhase2BDataPackReport } from "../phase2b/renderer.js";
import { buildMarketPackMarkdown } from "../workflow/build-market-pack.js";

function sampleDataPack(): DataPackMarket {
  return {
    instrument: { code: "600887", market: "CN_A", name: "伊利股份", currency: "CNY" },
    quote: { code: "600887", price: 28.5, timestamp: new Date().toISOString() },
    klines: [
      {
        code: "600887",
        period: "day",
        ts: "2024-12-31",
        open: 28,
        high: 29,
        low: 27.5,
        close: 28.5,
        volume: 1e6,
      },
    ],
    financialSnapshot: {
      code: "600887",
      period: "2024",
      revenue: 126_000,
      netProfit: 11_800,
      operatingCashFlow: 15_400,
      totalAssets: 168_000,
      totalLiabilities: 93_000,
      capitalExpenditure: 4200,
      interestBearingDebt: 12_000,
      cashAndEquivalents: 42_000,
      minorityInterestPnL: 300,
      marketCapBaiWan: 180_000,
      totalSharesOutstandingMm: 6315.2,
    },
    corporateActions: [
      {
        code: "600887",
        actionType: "dividend",
        cashDividendPerShare: 1.1,
      },
    ],
    tradingCalendar: [{ market: "CN_A", date: "2024-01-02", isTradingDay: true }],
  };
}

function samplePdfSections(): PdfSections {
  return {
    metadata: {
      pdfFile: "fixture.pdf",
      totalPages: 10,
      extractTime: new Date().toISOString(),
      sectionsFound: 3,
      sectionsTotal: 7,
    },
    P2: { content: "受限资产摘录", pageFrom: 1, pageTo: 2 },
    MDA: { content: "MD&A 摘录", pageFrom: 5, pageTo: 6 },
  };
}

function main(): void {
  const md = buildMarketPackMarkdown("600887", sampleDataPack());
  assert.match(md, /## §13 Warnings/);
  assert.match(md, /\| 指标 \| 2024 \| 2023 \|/);
  assert.match(md, /## §17 其他/);

  const report = renderPhase2BDataPackReport({ sections: samplePdfSections(), includeMda: true });
  assert.match(report, /## MDA /);
  assert.match(report, /管理层讨论与分析/);

  const reportNoMda = renderPhase2BDataPackReport({ sections: samplePdfSections(), includeMda: false });
  assert.ok(!reportNoMda.includes("## MDA "));

  const d1d6 = renderQualitativeD1D6Scaffold({
    phase1b: {
      stockCode: "600887",
      companyName: "测试公司",
      year: "2024",
      generatedAt: new Date().toISOString(),
      channel: "http",
      section7: [{ item: "竞争", content: "行业集中", evidences: [] }],
      section8: [],
      section10: [],
    },
    pdfPath: "/tmp/x.pdf",
  });
  assert.match(d1d6, /## D1 商业模式/);
  assert.match(d1d6, /## D6 控股结构/);

  console.log("[test:linkage] ok");
}

main();
