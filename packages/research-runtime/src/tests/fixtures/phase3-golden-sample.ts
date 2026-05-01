import type { DataPackMarket, PdfSections } from "@trade-signal/schema-core";

import { computePdfExtractQuality } from "../../steps/phase2a/extract-quality.js";

/** A 股黄金样例（与 linkage-smoke 一致，供契约/回归/插件烟测复用） */
export function sampleCnADataPack(): DataPackMarket {
  return {
    instrument: { code: "600887", market: "CN_A", name: "伊利股份", currency: "CNY", industry: "乳品与食品饮料" },
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
    financialQualityTrends: [
      {
        year: "2024",
        source: "fixture",
        revenue: 126_000,
        operatingCost: 78_000,
        netProfit: 11_800,
        operatingCashFlow: 15_400,
        capitalExpenditure: 4200,
        freeCashFlow: 11_200,
        grossMarginPct: 38.1,
        salesExpenseRatioPct: 18.5,
        adminExpenseRatioPct: 4.2,
        rdExpenseRatioPct: 0.8,
        financialExpenseRatioPct: -0.3,
        accountsReceivable: 6500,
        inventory: 9200,
        accountsPayable: 12_000,
        impairmentLoss: 120,
        accountsReceivableDays: 18.8,
        inventoryDays: 43.1,
        accountsPayableDays: 56.2,
        cashConversionCycleDays: 5.7,
        ocfToNetProfit: 1.31,
        fcfMarginPct: 8.89,
      },
    ],
    peerComparablePool: {
      source: "fixture",
      industryName: "乳品与食品饮料",
      sortColumn: "revenueAllYear",
      peerCodes: ["600597", "600872"],
      peers: [
        { code: "600597", name: "光明乳业", industryName: "乳品与食品饮料", year: "2024", revenueAllYear: 26_000 },
        { code: "600872", name: "中炬高新", industryName: "食品饮料", year: "2024", revenueAllYear: 5200 },
      ],
    },
    companyOperationsSnapshot: {
      source: "fixture",
      status: "pass",
      missingFields: [],
      degradeReasons: [],
      signals: [
        {
          category: "business_structure",
          label: "产品分部",
          summary: "液态奶、奶粉、冷饮等产品分部构成收入主线。",
          source: "fixture_f10",
          confidence: "medium",
        },
        {
          category: "operating_metric",
          label: "渠道库存",
          summary: "经销渠道和库存周转是食品饮料行业经营质量的核心跟踪变量。",
          source: "fixture_f10",
          confidence: "medium",
        },
      ],
      signalGroups: {
        businessStructure: [
          {
            category: "business_structure",
            label: "产品分部",
            summary: "液态奶、奶粉、冷饮等产品分部构成收入主线。",
            source: "fixture_f10",
            confidence: "medium",
          },
        ],
        operatingMetrics: [
          {
            category: "operating_metric",
            label: "渠道库存",
            summary: "经销渠道和库存周转是食品饮料行业经营质量的核心跟踪变量。",
            source: "fixture_f10",
            confidence: "medium",
          },
        ],
      },
    },
    industryProfileSnapshot: {
      profileId: "dairy_food",
      industryName: "乳品与食品饮料",
      confidence: "medium",
      matchedBy: "instrument",
      kpiSignals: [
        {
          key: "product_mix",
          label: "产品分部",
          summary: "液态奶、奶粉、冷饮等产品分部构成收入主线。",
          source: "fixture_f10",
          confidence: "medium",
        },
        {
          key: "inventory",
          label: "库存",
          summary: "经销渠道和库存周转是食品饮料行业经营质量的核心跟踪变量。",
          source: "fixture_f10",
          confidence: "medium",
        },
      ],
      missingKpis: ["channel_region", "dealer", "raw_material", "food_safety"],
      sourceRefs: ["instrument.industry", "fixture_f10"],
    },
    regulatoryEventCollection: {
      source: "fixture",
      exchange: "auto",
      eventKinds: ["inquiry"],
      total: 1,
      events: [
        {
          eventType: "inquiry",
          eventDate: "2024-05-01",
          sourceOrg: "交易所",
          title: "关于测试公司的年报问询函",
          companyCode: "600887",
          severity: "medium",
          source: "sse",
          sourceType: "exchange_inquiry",
          rawType: "年报问询函",
        },
      ],
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
      sectionsFound: 10,
      sectionsTotal: 12,
    },
    P2: { content: "受限资产摘录", pageFrom: 1, pageTo: 2, confidence: "high" },
    P4: { content: "关联方交易摘录", pageFrom: 3, pageTo: 3, confidence: "high" },
    P13: { content: "非经常性损益摘录", pageFrom: 4, pageTo: 4, confidence: "high" },
    MDA: { content: "MD&A 摘录", pageFrom: 5, pageTo: 6, confidence: "high" },
    BUSINESS: { content: "主营业务与业务模式摘录", pageFrom: 7, pageTo: 7, confidence: "medium" },
    SEGMENT: { content: "分部收入与业务构成摘录", pageFrom: 8, pageTo: 8, confidence: "medium" },
    OPERATING: { content: "经营指标摘录", pageFrom: 8, pageTo: 9, confidence: "low" },
    CAPEX: { content: "资本开支与重大投资摘录", pageFrom: 9, pageTo: 9, confidence: "medium" },
    DIVIDEND: { content: "分红政策与利润分配摘录", pageFrom: 10, pageTo: 10, confidence: "high" },
  };
  sections.metadata.extractQuality = computePdfExtractQuality(sections);
  return sections;
}
