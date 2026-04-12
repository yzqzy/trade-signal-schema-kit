import type { AnalysisReport, ValuationComputed } from "@trade-signal/schema-core";

export type Phase3CompanyType = "blue_chip_value" | "growth" | "hybrid";

export interface Phase3FinancialYear {
  year: string;
  revenue?: number;
  netProfit?: number;
  operatingCashFlow?: number;
  capex?: number;
  dividendPerShare?: number;
  basicEps?: number;
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

export interface Phase3RunInput {
  market: Phase3MarketInput;
  reportMarkdown?: string;
}

export interface Phase3EngineOutput {
  valuation: ValuationComputed;
  report: AnalysisReport;
}

export type WeightedMethodValue = {
  method: string;
  value: number;
  weight: number;
};
