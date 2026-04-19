import type { DataPackMarket, PdfSections } from "@trade-signal/schema-core";

import { computePdfExtractQuality } from "../../steps/phase2a/extract-quality.js";

/** A 股黄金样例（与 linkage-smoke 一致，供契约/回归/插件烟测复用） */
export function sampleCnADataPack(): DataPackMarket {
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

/** 港股黄金样例：结构对齐 cn_a，数值略调以便与 cn_a 回归哈希区分 */
export function sampleHkDataPack(): DataPackMarket {
  const cn = sampleCnADataPack();
  return {
    ...cn,
    instrument: { code: "00700", market: "HK", name: "腾讯控股", currency: "HKD" },
    quote: { ...cn.quote, code: "00700" },
    klines: cn.klines.map((k) => ({ ...k, code: "00700" })),
    financialSnapshot: cn.financialSnapshot
      ? {
          ...cn.financialSnapshot,
          code: "00700",
          revenue: 610_000,
          netProfit: 115_000,
          operatingCashFlow: 198_000,
        }
      : undefined,
    financialHistory: (cn.financialHistory ?? []).map((h) => ({
      ...h,
      code: "00700",
      revenue: (h.revenue ?? 0) + 50_000,
      netProfit: (h.netProfit ?? 0) + 8000,
    })),
    corporateActions: (cn.corporateActions ?? []).map((a) => ({ ...a, code: "00700" })),
    tradingCalendar: [{ market: "HK", date: "2024-01-02", isTradingDay: true }],
  };
}

export function samplePdfSections(): PdfSections {
  const sections: PdfSections = {
    metadata: {
      pdfFile: "fixture.pdf",
      totalPages: 10,
      extractTime: new Date().toISOString(),
      sectionsFound: 5,
      sectionsTotal: 7,
    },
    P2: { content: "受限资产摘录", pageFrom: 1, pageTo: 2, confidence: "high" },
    P4: { content: "关联方交易摘录", pageFrom: 3, pageTo: 3, confidence: "high" },
    P13: { content: "非经常性损益摘录", pageFrom: 4, pageTo: 4, confidence: "high" },
    MDA: { content: "MD&A 摘录", pageFrom: 5, pageTo: 6, confidence: "high" },
  };
  sections.metadata.extractQuality = computePdfExtractQuality(sections);
  return sections;
}
