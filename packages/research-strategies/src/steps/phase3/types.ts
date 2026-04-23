import type { AnalysisReport, ValuationComputed, ValuationMethodResult } from "@trade-signal/schema-core";

export type Phase3Decision = "buy" | "watch" | "avoid";
export type Confidence = "high" | "medium" | "low";
export type Phase3CompanyType = "blue_chip_value" | "growth" | "hybrid";

export interface WarningEntry {
  level: "high" | "medium" | "low";
  type: string;
  text: string;
}

export interface FinancialYearData {
  year: string;
  revenue?: number;
  netProfit?: number;
  ocf?: number;
  capex?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  interestBearingDebt?: number;
  cash?: number;
  basicEps?: number;
  dps?: number;
  minorityPnL?: number;
}

export type Phase3FinancialYear = {
  year: string;
  revenue?: number;
  netProfit?: number;
  operatingCashFlow?: number;
  capex?: number;
  dividendPerShare?: number;
  basicEps?: number;
  minorityPnL?: number;
};

export interface DataPackMarketParsed {
  code: string;
  name?: string;
  market: "CN_A";
  currency: "CNY";
  rf?: number;
  price?: number;
  marketCap?: number;
  totalShares?: number;
  industry?: string;
  warnings: WarningEntry[];
  financials: FinancialYearData[];
  hasInterim: boolean;
  sourceText: string;
}

export interface Phase3MarketInput {
  code: string;
  name?: string;
  market?: "CN_A" | "HK" | "US";
  currency?: string;
  price?: number;
  marketCap?: number;
  totalShares?: number;
  peTtm?: number;
  pb?: number;
  beta?: number;
  riskFreeRate?: number;
  debt?: number;
  cash?: number;
  taxRate?: number;
  financials?: Phase3FinancialYear[];
}

export interface DataPackReportParsed {
  hasReportPack: boolean;
  sections: Partial<Record<"P2" | "P3" | "P4" | "P6" | "P13" | "SUB" | "MDA", string>>;
  warningHints: string[];
}

export interface FactorGateResult {
  passed: boolean;
  reason?: string;
}

export interface Factor1AResult extends FactorGateResult {
  checks: Array<{ id: number; item: string; hit: boolean; reason: string }>;
  profile: string;
}

export interface Factor1BResult extends FactorGateResult {
  module0: { profitAnchor: string; cashAnchor: string; unit: string };
  moduleRatings: Record<string, string>;
  module9Applied: boolean;
}

export interface Factor2Result extends FactorGateResult {
  A?: number;
  B?: number;
  C?: number;
  D?: number;
  E?: number;
  G?: number;
  I?: number;
  M?: number;
  O?: number;
  Q?: number;
  R?: number;
  II?: number;
  rejectType?: "S2" | "S4";
}

export interface Factor3Result extends FactorGateResult {
  AA?: number;
  FF?: number;
  GG?: number;
  HH?: number;
  extrapolationTrust?: "high" | "medium" | "low";
  mismatchWithFactor1?: boolean;
}

export interface Factor4Result extends FactorGateResult {
  II?: number;
  JJ?: number;
  KK?: number;
  trapCount: number;
  trapRisk: "low" | "medium" | "high";
  position: string;
}

export interface Phase3Context {
  marketPack: DataPackMarketParsed;
  reportPack?: DataPackReportParsed;
  interimReportPack?: DataPackReportParsed;
  checkpoints: string[];
}

export interface Phase3ExecutionResult {
  valuation: ValuationComputed;
  report: AnalysisReport;
  decision: Phase3Decision;
  confidence: Confidence;
  /** 前置筛选结束时使用精简报告模板，避免满篇占位符 */
  reportMode?: "full" | "reject";
  factor1A?: Factor1AResult;
  factor1B?: Factor1BResult;
  factor2?: Factor2Result;
  factor3?: Factor3Result;
  factor4?: Factor4Result;
  methods: ValuationMethodResult[];
}

export type WeightedMethodValue = {
  method: string;
  value: number;
  weight: number;
};
