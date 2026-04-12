import type { MarketDataProvider } from "@trade-signal/schema-core";

export interface AnalysisContext {
  code: string;
  provider: MarketDataProvider;
}

export interface AnalysisResult {
  score: number;
  recommendation: "buy" | "watch" | "avoid";
  notes: string[];
}

export * from "./phase0/downloader.js";
export * from "./phase1a/collector.js";
export * from "./phase1b/types.js";
export * from "./phase1b/collector.js";
export * from "./phase1b/renderer.js";
export * from "./phase2a/extractor.js";
export * from "./phase2b/renderer.js";
export * from "./phase3/types.js";
export * from "./phase3/valuation-engine.js";
export * from "./phase3/analyzer.js";

export async function runBaselineAnalysis(
  context: AnalysisContext,
): Promise<AnalysisResult> {
  const quote = await context.provider.getQuote(context.code);
  const recommendation: AnalysisResult["recommendation"] =
    quote.changePct !== undefined && quote.changePct > 0 ? "watch" : "avoid";

  return {
    score: 50,
    recommendation,
    notes: ["Scaffold implementation. Replace with real factor model."],
  };
}
