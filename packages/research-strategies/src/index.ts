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

export * from "./stages/phase0/downloader.js";
export * from "./stages/phase0/discover-report-url.js";
export * from "./stages/phase0/phase0-errors.js";
export * from "./stages/phase1a/collector.js";
export * from "./stages/phase1b/types.js";
export * from "./stages/phase1b/collector.js";
export * from "./stages/phase1b/renderer.js";
export {
  computePhase1bEvidenceQualityMetrics,
  topicPatternForPhase1bItem,
  type Phase1bEvidenceQualityMetrics,
  type Phase1bItemQualityRow,
  type Phase1bSectionEvidenceMetrics,
} from "./stages/phase1b/evidence-quality.js";
export * from "./stages/phase2a/extractor.js";
export * from "./stages/phase2b/renderer.js";
export * from "./stages/phase3/types.js";
export * from "./stages/phase3/valuation-engine.js";
export * from "./stages/phase3/analyzer.js";
export * from "./app/workflow/orchestrator.js";
export * from "./contracts/workflow-run-types.js";
export * from "./strategies/contracts.js";
export { createTurtleStrategyPlugin } from "./strategies/turtle/plugin.js";
export { createValueV1StrategyPlugin } from "./strategies/value-v1/plugin.js";
export { resolveWorkflowStrategyPlugin } from "./strategies/registry.js";
export {
  createDefaultWorkflowOrchestratorAdapter,
  type OrchestratorAdapter,
} from "./orchestrator/workflow-orchestrator-adapter.js";
export { buildMarketPackMarkdown } from "./app/workflow/build-market-pack.js";
export { runPreflightAfterPhase1A } from "./pipeline/preflight.js";
export { normalizeCodeForFeed } from "./pipeline/normalize-stock-code.js";
export * from "./pipeline/p2p4-structured-contract.js";
export * from "./pipeline/evidence-index-normalizer.js";
export * from "./app/business-analysis/orchestrator.js";
export * from "./screener/index.js";

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
