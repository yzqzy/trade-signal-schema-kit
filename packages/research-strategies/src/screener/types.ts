import type { AnalysisReport } from "@trade-signal/schema-core";

export type ScreenerMarket = "CN_A" | "HK";
export type ScreenerAnalysisMode = "standalone" | "composed";
export type ScreenerChannel = "main" | "observation";

export interface ScreenerUniverseRow {
  code: string;
  name: string;
  market: ScreenerMarket;
  industry?: string;
  listDate?: string;
  close?: number;
  pe?: number;
  pb?: number;
  dv?: number;
  marketCap?: number;
  turnover?: number;
  debtRatio?: number;
  grossMargin?: number;
  roe?: number;
  fcfYield?: number;
  floorPremium?: number;
  netProfit?: number;
  ocf?: number;
  capex?: number;
  totalAssets?: number;
  totalLiabilities?: number;
}

export interface ScreenerConfig {
  minListingYears: number;
  minMarketCap: number;
  minTurnover: number;
  maxPb: number;
  maxPe: number;
  obsChannelLimit: number;
  tier2MainLimit: number;
  minRoe: number;
  minGrossMargin: number;
  maxDebtRatio: number;
  hardVetoDebtRatio: number;
  weightRoe: number;
  weightFcfYield: number;
  weightPenetrationR: number;
  weightEvEbitda: number;
  weightFloorPremium: number;
  weightScreenerScore: number;
  weightReportScore: number;
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

export interface ScreenerRunInput {
  market: ScreenerMarket;
  mode: ScreenerAnalysisMode;
  universe: ScreenerUniverseRow[];
  config?: Partial<ScreenerConfig>;
}

export interface ScreenerRunOutput {
  market: ScreenerMarket;
  mode: ScreenerAnalysisMode;
  generatedAt: string;
  totalUniverse: number;
  tier1Count: number;
  passedCount: number;
  results: ScreenerScoredResult[];
}

export interface ScreenerComposedResolver {
  resolve(input: ScreenerCandidate): Promise<{
    marketMarkdown: string;
    reportMarkdown?: string;
    interimReportMarkdown?: string;
  }>;
}
