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

export * from "./steps/phase0/downloader.js";
export * from "./steps/phase0/discover-report-url.js";
export * from "./steps/phase0/phase0-errors.js";
export * from "./steps/phase1a/collector.js";
export * from "./steps/phase1b/types.js";
export * from "./steps/phase1b/collector.js";
export * from "./steps/phase1b/renderer.js";
export {
  computePhase1bEvidenceQualityMetrics,
  topicPatternForPhase1bItem,
  type Phase1bEvidenceQualityMetrics,
  type Phase1bItemQualityRow,
  type Phase1bSectionEvidenceMetrics,
} from "./steps/phase1b/evidence-quality.js";
export * from "./steps/phase2a/extractor.js";
export * from "./steps/phase2b/renderer.js";
export * from "./steps/phase3/types.js";
export * from "./steps/phase3/valuation-engine.js";
export * from "./steps/phase3/analyzer.js";
export * from "./runtime/workflow/orchestrator.js";
export * from "./contracts/workflow-run-types.js";
export * from "./contracts/report-conflict-log.js";
export * from "./contracts/report-topic-contract.js";
export * from "./contracts/report-index-contract.js";
export * from "@trade-signal/research-contracts";
export * from "@trade-signal/research-feature";
export * from "@trade-signal/research-policy";
export * from "@trade-signal/research-topic";
export * from "@trade-signal/research-selection";
export { bootstrapV2PluginRegistry } from "./bootstrap/v2-plugin-registry.js";
export * from "./strategy/contracts.js";
export { createTurtleStrategyPlugin } from "./strategy/turtle/plugin.js";
export { createValueV1StrategyPlugin } from "./strategy/value-v1/plugin.js";
export { resolveWorkflowStrategyPlugin } from "./strategy/registry.js";
export {
  createDefaultWorkflowOrchestratorAdapter,
  type OrchestratorAdapter,
} from "./runtime/workflow/orchestrator-adapter.js";
export { buildMarketPackMarkdown } from "./runtime/workflow/build-market-pack.js";
export { runPreflightAfterPhase1A } from "./crosscut/preflight/preflight.js";
export { normalizeCodeForFeed } from "./crosscut/normalization/normalize-stock-code.js";
export * from "./crosscut/structured-inputs/qualitative-market-structured-snapshot.js";
export * from "./crosscut/normalization/evidence-index-table-normalizer.js";
export * from "./runtime/business-analysis/orchestrator.js";
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
