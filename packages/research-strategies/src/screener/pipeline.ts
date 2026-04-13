import { runPhase3Strict } from "../phase3/analyzer.js";

import { resolveScreenerConfig } from "./config.js";
import { tier1FilterCnA } from "./cn-a.js";
import { tier1FilterHk } from "./hk.js";
import type {
  ScreenerCandidate,
  ScreenerComposedResolver,
  ScreenerConfig,
  ScreenerRunInput,
  ScreenerRunOutput,
  ScreenerScoredResult,
  ScreenerUniverseRow,
} from "./types.js";

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function validateQuality(row: ScreenerUniverseRow, cfg: ScreenerConfig): { passed: boolean; reason?: string } {
  if (num(row.debtRatio, 0) > cfg.hardVetoDebtRatio) return { passed: false, reason: "hard_veto_debt_ratio" };
  if (num(row.roe, 0) < cfg.minRoe) return { passed: false, reason: "low_roe" };
  if (num(row.grossMargin, 0) < cfg.minGrossMargin) return { passed: false, reason: "low_gross_margin" };
  if (num(row.debtRatio, 0) > cfg.maxDebtRatio) return { passed: false, reason: "high_debt_ratio" };
  return { passed: true };
}

function computeFactorSummary(row: ScreenerUniverseRow): {
  penetrationR: number;
  thresholdII: number;
  rf: number;
  evEbitda: number;
  floorPremium: number;
} {
  const rf = 2.5;
  const thresholdII = Math.max(3.5, rf + 2);
  const aa = Math.max(0, num(row.ocf, 0) - Math.abs(num(row.capex, 0)));
  const m = clamp01((num(row.dv, 0) / 100) || 0.2);
  const marketCap = Math.max(1e-6, num(row.marketCap, 0));
  const penetrationR = (aa * m / marketCap) * 100;

  const debt = Math.max(0, num(row.totalLiabilities, 0));
  const cash = Math.max(0, num(row.totalAssets, 0) * 0.15);
  const ebitda = Math.max(1e-6, num(row.netProfit, 0) + Math.max(0, num(row.ocf, 0) - num(row.netProfit, 0)));
  const evEbitda = (marketCap + debt - cash) / ebitda;
  const floorPremium = num(row.floorPremium, num(row.pe, 0) > 0 ? num(row.pe, 0) / 3 : 0);

  return { penetrationR, thresholdII, rf, evEbitda, floorPremium };
}

function percentile(values: number[], current: number, asc: boolean): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => (asc ? a - b : b - a));
  const idx = sorted.findIndex((v) => (asc ? current <= v : current >= v));
  const rank = idx < 0 ? sorted.length - 1 : idx;
  return rank / Math.max(1, sorted.length - 1);
}

function computeStandaloneScore(row: ScreenerUniverseRow, rows: ScreenerUniverseRow[], cfg: ScreenerConfig): number {
  const roePct = percentile(rows.map((r) => num(r.roe, 0)), num(row.roe, 0), false);
  const fcfPct = percentile(rows.map((r) => num(r.fcfYield, 0)), num(row.fcfYield, 0), false);
  const factor = computeFactorSummary(row);
  const rPct = percentile(rows.map((r) => computeFactorSummary(r).penetrationR), factor.penetrationR, false);
  const evPct = percentile(rows.map((r) => computeFactorSummary(r).evEbitda), factor.evEbitda, true);
  const floorPct = percentile(rows.map((r) => computeFactorSummary(r).floorPremium), factor.floorPremium, true);

  return (
    cfg.weightRoe * roePct +
    cfg.weightFcfYield * fcfPct +
    cfg.weightPenetrationR * rPct +
    cfg.weightEvEbitda * evPct +
    cfg.weightFloorPremium * floorPct
  );
}

function buildMinimalMarketPack(row: ScreenerUniverseRow): string {
  const y = new Date().getFullYear();
  const normalizedCode = row.code.toUpperCase().endsWith(".HK")
    ? row.code.replace(".HK", "").padStart(6, "0")
    : row.code.replace(/\D/g, "").slice(-6).padStart(6, "0");
  return [
    `# ${row.name}（${row.code}）`,
    "",
    "## §1 基础信息",
    `- 股票代码：${normalizedCode}`,
    `- 行业：${row.industry ?? "未提供"}`,
    `- 最新股价：${num(row.close, 0).toFixed(2)}`,
    `- 最新市值：${num(row.marketCap, 0).toFixed(2)} 百万元`,
    "",
    "## §3 利润表（百万元）",
    `| 指标 | ${y} |`,
    "|---|---:|",
    `| 营业收入 | ${Math.max(1, num(row.netProfit, 0) * 6).toFixed(2)} |`,
    `| 归母净利润 | ${num(row.netProfit, 0).toFixed(2)} |`,
    "",
    "## §5 现金流量表（百万元）",
    `| 指标 | ${y} |`,
    "|---|---:|",
    `| 经营活动现金流OCF | ${num(row.ocf, 0).toFixed(2)} |`,
    `| 资本开支Capex | ${Math.abs(num(row.capex, 0)).toFixed(2)} |`,
  ].join("\n");
}

async function composeReportScore(
  candidate: ScreenerCandidate,
  resolver?: ScreenerComposedResolver,
): Promise<{ reportScore: number; decision: "buy" | "watch" | "avoid"; confidence: "high" | "medium" | "low"; composedReason?: string; composedReport?: ScreenerScoredResult["composedReport"] }> {
  const resolved =
    resolver
      ? await resolver.resolve(candidate)
      : {
          marketMarkdown: buildMinimalMarketPack(candidate),
          reportMarkdown: undefined,
          interimReportMarkdown: undefined,
        };

  const out = runPhase3Strict({
    marketMarkdown: resolved.marketMarkdown,
    reportMarkdown: resolved.reportMarkdown,
    interimReportMarkdown: resolved.interimReportMarkdown,
  });
  const decision = out.report.decision ?? "watch";
  const confidence = out.report.confidence ?? "medium";
  const reportScore = decision === "buy" ? 1 : decision === "watch" ? 0.5 : 0;
  const composedReason = out.report.sections[0]?.content;
  return { reportScore, decision, confidence, composedReason, composedReport: out.report };
}

export async function runScreenerPipeline(
  input: ScreenerRunInput,
  resolver?: ScreenerComposedResolver,
): Promise<ScreenerRunOutput> {
  const cfg = resolveScreenerConfig(input.market, input.config);
  const tier1Candidates =
    input.market === "CN_A"
      ? tier1FilterCnA(input.universe, cfg)
      : tier1FilterHk(input.universe, cfg);

  const scored: ScreenerScoredResult[] = [];
  for (const candidate of tier1Candidates) {
    const quality = validateQuality(candidate, cfg);
    if (!quality.passed) {
      scored.push({
        ...candidate,
        passed: false,
        vetoReason: quality.reason,
        qualityPassed: false,
        screenerScore: 0,
        totalScore: 0,
        decision: "avoid",
        confidence: "low",
        factors: computeFactorSummary(candidate),
      });
      continue;
    }

    const standaloneScore = computeStandaloneScore(candidate, tier1Candidates, cfg);
    if (input.mode === "standalone") {
      const decision = standaloneScore >= 0.65 ? "buy" : standaloneScore >= 0.45 ? "watch" : "avoid";
      scored.push({
        ...candidate,
        passed: true,
        qualityPassed: true,
        screenerScore: standaloneScore,
        totalScore: standaloneScore,
        decision,
        confidence: standaloneScore >= 0.75 ? "high" : standaloneScore >= 0.5 ? "medium" : "low",
        factors: computeFactorSummary(candidate),
      });
      continue;
    }

    const composed = await composeReportScore(candidate, resolver);
    const totalScore = cfg.weightScreenerScore * standaloneScore + cfg.weightReportScore * composed.reportScore;
    const finalDecision = composed.decision === "avoid" ? "avoid" : totalScore >= 0.65 ? "buy" : totalScore >= 0.45 ? "watch" : "avoid";

    scored.push({
      ...candidate,
      passed: true,
      qualityPassed: true,
      screenerScore: standaloneScore,
      reportScore: composed.reportScore,
      totalScore,
      decision: finalDecision,
      confidence: composed.confidence,
      factors: computeFactorSummary(candidate),
      vetoReason: composed.composedReason,
      composedReport: composed.composedReport,
    });
  }

  const sorted = [...scored].sort((a, b) => b.totalScore - a.totalScore);
  return {
    market: input.market,
    mode: input.mode,
    generatedAt: new Date().toISOString(),
    totalUniverse: input.universe.length,
    tier1Count: tier1Candidates.length,
    passedCount: sorted.filter((r) => r.passed && r.decision !== "avoid").length,
    results: sorted,
  };
}
