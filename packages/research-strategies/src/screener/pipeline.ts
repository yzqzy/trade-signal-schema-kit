import { runPhase3Strict } from "../steps/phase3/analyzer.js";

import { buildUniverseCapability } from "./capability.js";
import { resolveScreenerConfig } from "./config.js";
import { tier1FilterCnA } from "./cn-a.js";
import { tier1FilterHk } from "./hk.js";
import type {
  ScreenerCandidate,
  ScreenerComposedResolver,
  ScreenerConfig,
  ScreenerConfigOverrides,
  ScreenerFactorSummary,
  ScreenerRunInput,
  ScreenerRunOutput,
  ScreenerScoredResult,
  ScreenerUniverseRow,
} from "./types.js";

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function checkHardVetoes(
  row: ScreenerUniverseRow,
  cfg: ScreenerConfig,
): { ok: boolean; reason?: string } {
  const pledge = row.pledgeRatio;
  if (typeof pledge === "number" && Number.isFinite(pledge) && pledge > cfg.maxPledgePct) {
    return { ok: false, reason: `pledge_ratio=${pledge.toFixed(1)}% > ${cfg.maxPledgePct}%` };
  }
  const audit = row.auditResult;
  if (audit !== undefined && audit.length > 0 && !audit.includes("标准无保留")) {
    return { ok: false, reason: `non_standard_audit: ${audit}` };
  }
  return { ok: true };
}

function validateMainQuality(row: ScreenerUniverseRow, cfg: ScreenerConfig): { passed: boolean; reason?: string } {
  if (num(row.roe, 0) < cfg.minRoe) return { passed: false, reason: "low_roe" };
  if (num(row.grossMargin, 0) < cfg.minGrossMargin) return { passed: false, reason: "low_gross_margin" };
  if (num(row.debtRatio, 0) > cfg.maxDebtRatio) return { passed: false, reason: "high_debt_ratio" };
  return { passed: true };
}

function validateObservationQuality(
  row: ScreenerUniverseRow,
  cfg: ScreenerConfig,
): { passed: boolean; reason?: string } {
  if (num(row.roe, 0) < cfg.minRoeObs) return { passed: false, reason: "low_roe_obs" };
  if (num(row.grossMargin, 0) < cfg.minGrossMargin) return { passed: false, reason: "low_gross_margin" };
  if (num(row.debtRatio, 0) > cfg.maxDebtRatio) return { passed: false, reason: "high_debt_ratio" };

  const ocf = num(row.ocf, NaN);
  if (cfg.obsRequireOcfPositive) {
    if (!Number.isFinite(ocf) || ocf <= 0) return { passed: false, reason: "ocf_non_positive" };
  }

  const rev = num(row.revenue, NaN);
  const capex = num(row.capex, 0);
  const ocfVal = Number.isFinite(ocf) ? ocf : 0;
  const fcf = ocfVal - Math.abs(capex);
  if (Number.isFinite(rev) && rev > 0) {
    const fcfMargin = (fcf / rev) * 100;
    if (fcfMargin < cfg.minFcfMarginObs) return { passed: false, reason: "low_fcf_margin_obs" };
  } else {
    return { passed: false, reason: "missing_revenue" };
  }

  const py = row.fcfPositiveYears;
  if (typeof py !== "number" || !Number.isFinite(py) || py < cfg.minFcfPositiveYearsObs) {
    return { passed: false, reason: "fcf_positive_years_obs" };
  }
  return { passed: true };
}

function validateQuality(
  row: ScreenerUniverseRow,
  cfg: ScreenerConfig,
  channel: "main" | "observation",
): { passed: boolean; reason?: string } {
  return channel === "observation" ? validateObservationQuality(row, cfg) : validateMainQuality(row, cfg);
}

export function computeFactorSummary(row: ScreenerUniverseRow, _cfg: ScreenerConfig): ScreenerFactorSummary {
  const rf = num(row.riskFreeRatePct, 2.5);
  const thresholdII = Number.isFinite(rf) ? Math.max(3.5, rf + 2) : undefined;

  const ocf = num(row.ocf, 0);
  const capex = num(row.capex, 0);
  const v1 = num(row.assetDispIncome, 0);
  const vDeduct = num(row.nonOperIncome, 0) + num(row.othIncome, 0);
  const aa = ocf + v1 - vDeduct - Math.abs(capex);

  let M = num(row.payoutRatio, NaN);
  if (!Number.isFinite(M) || M <= 0) {
    const dv = num(row.dv, 0);
    M = Math.min(100, dv * 5);
  }
  const mktCap = Math.max(1e-6, num(row.marketCap, 0));
  const penetrationR = mktCap > 0 && Number.isFinite(M) ? (aa * (M / 100) / mktCap) * 100 : 0;

  let evEbitda = num(row.evEbitda, NaN);
  if (!Number.isFinite(evEbitda)) {
    const debt = Math.max(0, num(row.totalLiabilities, 0));
    const cash = Math.max(0, num(row.totalAssets, 0) * 0.15);
    const ebitdaRaw = num(row.ebitda, NaN);
    const ebitda =
      Number.isFinite(ebitdaRaw) && ebitdaRaw > 0 ? ebitdaRaw : Math.max(1e-6, num(row.netProfit, 0));
    evEbitda = (mktCap + debt - cash) / ebitda;
  }

  const pe = num(row.pe, 0);
  const floorRaw = num(row.floorPremium, NaN);
  const fallbackMode = (process.env.SCREENER_FLOOR_PREMIUM_FALLBACK ?? "pe_over_3").trim().toLowerCase();
  let floorPremium: number;
  let floorPremiumSource: NonNullable<ScreenerFactorSummary["floorPremiumSource"]>;
  if (Number.isFinite(floorRaw)) {
    floorPremium = floorRaw;
    floorPremiumSource = "universe_field";
  } else if (fallbackMode === "zero") {
    floorPremium = 0;
    floorPremiumSource = "zero_fallback";
  } else {
    floorPremium = pe > 0 ? pe / 3 : 0;
    floorPremiumSource = "pe_over_3_heuristic";
  }

  let rVsII: ScreenerFactorSummary["rVsII"];
  if (Number.isFinite(penetrationR) && thresholdII !== undefined && Number.isFinite(rf)) {
    if (penetrationR < rf) rVsII = "below_rf";
    else if (penetrationR < thresholdII * 0.5) rVsII = "fail";
    else if (penetrationR < thresholdII) rVsII = "marginal";
    else rVsII = "pass";
  }

  return {
    penetrationR,
    thresholdII,
    rf,
    evEbitda,
    floorPremium,
    floorPremiumSource,
    rVsII,
    payoutM: M,
    aa,
  };
}

function percentile(values: number[], current: number, asc: boolean): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => (asc ? a - b : b - a));
  const idx = sorted.findIndex((v) => (asc ? current <= v : current >= v));
  const rank = idx < 0 ? sorted.length - 1 : idx;
  return rank / Math.max(1, sorted.length - 1);
}

function computeStandaloneScore(row: ScreenerUniverseRow, rows: ScreenerUniverseRow[], cfg: ScreenerConfig): number {
  const roePct = percentile(
    rows.map((r) => num(r.roe, 0)),
    num(row.roe, 0),
    false,
  );
  const fcfPct = percentile(
    rows.map((r) => num(r.fcfYield, 0)),
    num(row.fcfYield, 0),
    false,
  );
  const factor = computeFactorSummary(row, cfg);
  const rPct = percentile(
    rows.map((r) => computeFactorSummary(r, cfg).penetrationR ?? 0),
    factor.penetrationR ?? 0,
    false,
  );
  const evPct = percentile(
    rows.map((r) => computeFactorSummary(r, cfg).evEbitda ?? 0),
    factor.evEbitda ?? 0,
    true,
  );
  const floorPct = percentile(
    rows.map((r) => computeFactorSummary(r, cfg).floorPremium ?? 0),
    factor.floorPremium ?? 0,
    true,
  );

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
): Promise<{
  reportScore: number;
  decision: "buy" | "watch" | "avoid";
  confidence: "high" | "medium" | "low";
  composedReason?: string;
  composedReport?: ScreenerScoredResult["composedReport"];
}> {
  const resolved = resolver
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

function readLegacyHardVetoDebt(overrides: ScreenerConfigOverrides | undefined): number | undefined {
  const v = overrides?.hardVetoDebtRatio;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export async function runScreenerPipeline(
  input: ScreenerRunInput,
  resolver?: ScreenerComposedResolver,
): Promise<ScreenerRunOutput> {
  const capability = buildUniverseCapability(input.market, input.universe);
  const now = new Date().toISOString();

  if (capability.status === "hk_not_ready" || capability.status === "blocked_missing_required_fields") {
    return {
      market: input.market,
      mode: input.mode,
      generatedAt: now,
      totalUniverse: input.universe.length,
      tier1Count: 0,
      passedCount: 0,
      tier1Only: input.tier1Only,
      results: [],
      capability,
    };
  }

  const cfg = resolveScreenerConfig(input.market, input.config);
  const legacyDebtVeto = readLegacyHardVetoDebt(input.config);

  const tier1Candidates =
    input.market === "CN_A"
      ? tier1FilterCnA(input.universe, cfg)
      : tier1FilterHk(input.universe, cfg);

  if (input.tier1Only) {
    const sorted = [...tier1Candidates].sort((a, b) => b.tier1Score - a.tier1Score);
    return {
      market: input.market,
      mode: input.mode,
      generatedAt: now,
      totalUniverse: input.universe.length,
      tier1Count: tier1Candidates.length,
      passedCount: sorted.length,
      tier1Only: true,
      capability,
      results: sorted.map((c) => ({
        ...c,
        passed: true,
        qualityPassed: true,
        screenerScore: c.tier1Score,
        totalScore: c.tier1Score,
        decision: "watch",
        confidence: "medium",
        factors: {},
      })),
    };
  }

  let candidates: ScreenerCandidate[] = tier1Candidates;
  if (input.tier2Limit !== undefined && input.tier2Limit >= 0) {
    candidates = tier1Candidates.slice(0, input.tier2Limit);
  }

  type Gate = { candidate: ScreenerCandidate; ok: boolean; vetoReason?: string };
  const gates: Gate[] = [];
  for (const candidate of candidates) {
    if (legacyDebtVeto !== undefined && num(candidate.debtRatio, 0) > legacyDebtVeto) {
      gates.push({ candidate, ok: false, vetoReason: "hard_veto_debt_ratio" });
      continue;
    }
    const hv = checkHardVetoes(candidate, cfg);
    if (!hv.ok) {
      gates.push({ candidate, ok: false, vetoReason: hv.reason });
      continue;
    }
    const quality = validateQuality(candidate, cfg, candidate.channel);
    if (!quality.passed) {
      gates.push({ candidate, ok: false, vetoReason: quality.reason ?? "financial_quality" });
      continue;
    }
    gates.push({ candidate, ok: true });
  }

  const passedForRanking = gates.filter((g) => g.ok).map((g) => g.candidate);

  const scored: ScreenerScoredResult[] = [];
  for (const g of gates) {
    const { candidate } = g;
    const factors = computeFactorSummary(candidate, cfg);

    if (!g.ok) {
      scored.push({
        ...candidate,
        passed: false,
        vetoReason: g.vetoReason,
        qualityPassed: false,
        screenerScore: 0,
        totalScore: 0,
        decision: "avoid",
        confidence: "low",
        factors,
      });
      continue;
    }

    const standaloneScore = computeStandaloneScore(candidate, passedForRanking, cfg);
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
        factors,
      });
      continue;
    }

    const composed = await composeReportScore(candidate, resolver);
    const totalScore = cfg.weightScreenerScore * standaloneScore + cfg.weightReportScore * composed.reportScore;
    const finalDecision =
      composed.decision === "avoid" ? "avoid" : totalScore >= 0.65 ? "buy" : totalScore >= 0.45 ? "watch" : "avoid";

    scored.push({
      ...candidate,
      passed: true,
      qualityPassed: true,
      screenerScore: standaloneScore,
      reportScore: composed.reportScore,
      totalScore,
      decision: finalDecision,
      confidence: composed.confidence,
      factors,
      vetoReason: composed.composedReason,
      composedReport: composed.composedReport,
    });
  }

  const sorted = [...scored].sort((a, b) => b.totalScore - a.totalScore);
  return {
    market: input.market,
    mode: input.mode,
    generatedAt: now,
    totalUniverse: input.universe.length,
    tier1Count: tier1Candidates.length,
    passedCount: sorted.filter((r) => r.passed && r.decision !== "avoid").length,
    capability,
    results: sorted,
  };
}
