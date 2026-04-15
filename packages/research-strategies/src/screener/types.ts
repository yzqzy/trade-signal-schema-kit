import type { AnalysisReport } from "@trade-signal/schema-core";

export type ScreenerMarket = "CN_A" | "HK";
export type ScreenerAnalysisMode = "standalone" | "composed";
export type ScreenerChannel = "main" | "observation";

/** Universe 行：市值等为研究层标准口径（A 股与 Python 对齐时 marketCap 为百万元）。 */
export interface ScreenerUniverseRow {
  code: string;
  name: string;
  market: ScreenerMarket;
  industry?: string;
  /** YYYYMMDD */
  listDate?: string;
  close?: number;
  pe?: number;
  pb?: number;
  /** 股息率 %（TTM，与上游 feed 字段对齐即可） */
  dv?: number;
  /** 总市值，百万元 */
  marketCap?: number;
  /** 换手率 % */
  turnover?: number;
  debtRatio?: number;
  grossMargin?: number;
  roe?: number;
  fcfYield?: number;
  floorPremium?: number;
  netProfit?: number;
  /** 经营活动现金流净额，百万元 */
  ocf?: number;
  capex?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  /** 近三年平均分红率 M（%，Factor2） */
  payoutRatio?: number;
  assetDispIncome?: number;
  nonOperIncome?: number;
  othIncome?: number;
  /** 无风险利率 %（Factor2 II/Rf） */
  riskFreeRatePct?: number;
  ebitda?: number;
  evEbitda?: number;
  /** 质押比例 %（硬否决） */
  pledgeRatio?: number;
  /** 最近年报审计意见（须含「标准无保留」） */
  auditResult?: string;
  /** 营业收入，百万元（观察通道 FCF 边际） */
  revenue?: number;
  /** 最近五年中 FCF>0 的年数（观察通道） */
  fcfPositiveYears?: number;
}

export interface ScreenerConfig {
  minListingYears: number;
  /** 最小总市值（亿元），对应 Python `min_market_cap_yi` */
  minMarketCapYi: number;
  minTurnoverPct: number;
  maxPb: number;
  maxPe: number;
  includeBank: boolean;
  obsChannelLimit: number;
  tier2MainLimit: number;
  dvWeight: number;
  peWeight: number;
  pbWeight: number;
  maxPledgePct: number;
  minRoe: number;
  minGrossMargin: number;
  maxDebtRatio: number;
  minRoeObs: number;
  minFcfMarginObs: number;
  minFcfPositiveYearsObs: number;
  obsRequireOcfPositive: boolean;
  weightRoe: number;
  weightFcfYield: number;
  weightPenetrationR: number;
  weightEvEbitda: number;
  weightFloorPremium: number;
  weightScreenerScore: number;
  weightReportScore: number;
  cacheDir: string;
  cacheStockBasicTtlDays: number;
  cacheDailyBasicTtlDays: number;
  cacheRfTtlDays: number;
  cacheTier2TtlHours: number;
  cacheTier2FinancialTtlHours: number;
  cacheTier2MarketTtlHours: number;
  cacheTier2GlobalTtlHours: number;
}

export interface ScreenerCandidate extends ScreenerUniverseRow {
  channel: ScreenerChannel;
  tier1Score: number;
}

export interface ScreenerFactorSummary {
  penetrationR?: number;
  thresholdII?: number;
  rf?: number;
  evEbitda?: number;
  floorPremium?: number;
  /** 底价溢价取值来源；与 Turtle 五法底价相比，`pe_over_3_heuristic` 为受控简化回退 */
  floorPremiumSource?: "universe_field" | "pe_over_3_heuristic" | "zero_fallback";
  rVsII?: "below_rf" | "fail" | "marginal" | "pass";
  payoutM?: number;
  aa?: number;
}

export interface ScreenerScoredResult extends ScreenerCandidate {
  passed: boolean;
  vetoReason?: string;
  qualityPassed: boolean;
  screenerScore: number;
  reportScore?: number;
  totalScore: number;
  decision: "buy" | "watch" | "avoid";
  confidence: "high" | "medium" | "low";
  factors: ScreenerFactorSummary;
  composedReport?: AnalysisReport;
}

/** 兼容旧 JSON：minMarketCap（百万元）、hardVetoDebtRatio */
export type ScreenerConfigOverrides = Partial<ScreenerConfig> & {
  minMarketCap?: number;
  hardVetoDebtRatio?: number;
};

export interface ScreenerRunInput {
  market: ScreenerMarket;
  mode: ScreenerAnalysisMode;
  universe: ScreenerUniverseRow[];
  config?: ScreenerConfigOverrides;
  /** 仅 Tier1（与 Python `--tier1-only` 一致） */
  tier1Only?: boolean;
  /** 进入 Tier2 前的最大条数（与 Python `tier2_limit` 一致） */
  tier2Limit?: number;
}

/** 与 buildUniverseCapability 对齐；供 JSON 输出与脚本解析 */
export type ScreenerUniverseCapabilityStatus =
  | "ok"
  | "hk_not_ready"
  | "blocked_missing_required_fields"
  | "degraded_tier2_fields";

export interface ScreenerCapabilityBlock {
  status: ScreenerUniverseCapabilityStatus;
  reasonCodes: string[];
  messages: string[];
  fieldTiers: {
    requiredForRun: {
      keys: string[];
      missingCountByField: Record<string, number>;
      allRowsMissingByField: Record<string, boolean>;
    };
    requiredForTier2Main: {
      keys: string[];
      missingCountByField: Record<string, number>;
      allRowsMissingByField: Record<string, boolean>;
    };
    optionalEnhancement: {
      keys: string[];
      missingCountByField: Record<string, number>;
    };
  };
}

export interface ScreenerRunOutput {
  market: ScreenerMarket;
  mode: ScreenerAnalysisMode;
  generatedAt: string;
  totalUniverse: number;
  tier1Count: number;
  passedCount: number;
  /** 为 true 时表示未跑 Tier2 深度逻辑 */
  tier1Only?: boolean;
  /** universe 能力评估、HK 未接入、字段分层缺口 */
  capability?: ScreenerCapabilityBlock;
  results: ScreenerScoredResult[];
}

export interface ScreenerComposedResolver {
  resolve(input: ScreenerCandidate): Promise<{
    marketMarkdown: string;
    reportMarkdown?: string;
    interimReportMarkdown?: string;
  }>;
}
