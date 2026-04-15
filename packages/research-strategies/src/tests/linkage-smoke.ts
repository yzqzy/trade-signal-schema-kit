#!/usr/bin/env node
/**
 * 链路级烟测（不替代 quality:all）：市场包结构、2B 含 MDA、D1~D6 契约稿。
 * 运行：`pnpm run build && pnpm --filter @trade-signal/research-strategies run test:linkage`
 */
import assert from "node:assert/strict";

import type { DataPackMarket, PdfSections } from "@trade-signal/schema-core";

import { renderQualitativeD1D6Scaffold } from "../business-analysis/d1-d6-scaffold.js";
import { evaluatePhase3Preflight } from "../pipeline/phase3-preflight.js";
import { projectEvidenceToC2 } from "../phase1b/collector.js";
import { renderPhase2BDataPackReport } from "../phase2b/renderer.js";
import { buildMarketPackMarkdown } from "../workflow/build-market-pack.js";
import { refreshMarketPackMarkdown } from "../workflow/refresh-market-pack.js";

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
      parentRevenue: 80_000,
      parentNetProfit: 9000,
      parentTotalAssets: 120_000,
      parentTotalLiabilities: 70_000,
    },
    financialHistory: [
      {
        code: "600887",
        period: "2023",
        revenue: 118_000,
        netProfit: 10_200,
        operatingCashFlow: 14_000,
        totalAssets: 162_000,
        totalLiabilities: 91_000,
        capitalExpenditure: 4100,
        interestBearingDebt: 11_500,
        cashAndEquivalents: 39_000,
        minorityInterestPnL: 280,
        earningsPerShare: 1.62,
        dividendsPerShare: 1.05,
      },
    ],
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
  assert.match(md, /## §17 衍生指标/);
  assert.match(md, /## §3P 母公司利润表/);
  assert.match(md, /母公司营业收入/);
  const refreshed = refreshMarketPackMarkdown("600887", md, {
    ...sampleDataPack(),
    quote: { code: "600887", price: 99, timestamp: new Date().toISOString() },
  });
  assert.match(refreshed, /99\.0000/);

  const pf = evaluatePhase3Preflight({
    companyName: "伊利股份",
    marketMarkdown: md,
    reportMarkdown: `# x\n\n## MDA 管理层讨论与分析\n${"摘录".repeat(40)}\n`,
  });
  assert.equal(pf.verdict, "PROCEED");

  const report = renderPhase2BDataPackReport({
    sections: samplePdfSections(),
    includeMda: true,
    reportKind: "annual",
  });
  assert.match(report, /reportKind.*annual/);
  assert.match(report, /## MDA /);
  assert.match(report, /管理层讨论与分析/);
  const interimRep = renderPhase2BDataPackReport({
    sections: samplePdfSections(),
    reportKind: "interim",
  });
  assert.match(interimRep, /# data_pack_report_interim/);

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
  assert.match(d1d6, /证据约束/);

  const c1 = {
    stockCode: "600887",
    companyName: "测试公司",
    year: "2024",
    channel: "http" as const,
    collectedAt: new Date().toISOString(),
    hits: [
      {
        catalog: "7" as const,
        promptItem: "控股股东及持股比例",
        searchQuery: "测试公司 大股东 控股 持股比例 2024",
        evidences: [{ title: "公告", url: "https://example.com/1", snippet: "控股股东持股 52%" }],
      },
      {
        catalog: "8" as const,
        promptItem: "主要竞争对手",
        searchQuery: "测试公司 竞争对手 市场份额 2024",
        evidences: [],
      },
      {
        catalog: "10" as const,
        promptItem: "经营回顾",
        searchQuery: "测试公司 管理层讨论 经营回顾 2024",
        evidences: [{ title: "年报", url: "https://example.com/2", snippet: "渠道拓展与成本优化" }],
      },
    ],
  };
  assert.ok(!("decision" in c1), "C1 数据不应包含策略决策字段");
  const c2 = projectEvidenceToC2(c1);
  assert.equal(c2.section7.length, 1);
  assert.equal(c2.section8.length, 1);
  assert.equal(c2.section10.length, 1);
  assert.match(c2.section8[0]?.content ?? "", /未搜索到相关信息/);

  console.log("[test:linkage] ok");
}

main();
