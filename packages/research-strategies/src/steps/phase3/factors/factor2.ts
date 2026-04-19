import type { DataPackMarketParsed, Factor1BResult, Factor2Result } from "../types.js";

function avg(values: Array<number | undefined>): number {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function runFactor2(market: DataPackMarketParsed, factor1b: Factor1BResult): Factor2Result {
  const latest = market.financials[0];
  if (!latest) return { passed: false, reason: "因子2无法计算：缺少财务年度数据" };

  const A = latest.netProfit;
  const B = latest.minorityPnL ?? 0;
  const C = (latest.netProfit ?? 0) - B;
  const D = Math.max(0, (latest.ocf ?? 0) - (latest.netProfit ?? 0));
  const E = Math.abs(latest.capex ?? 0);
  const G = factor1b.moduleRatings["3.1资本消耗"] === "capital-hungry" ? 1.3 : 0.9;
  const I = C + D - E * G;
  const M = avg(market.financials.slice(0, 3).map((f) => (f.dps && f.basicEps && f.basicEps > 0 ? (f.dps / f.basicEps) * 100 : undefined)));
  const O = 0;
  const Q = 20;
  const price = market.price ?? 0;
  const shares = market.totalShares ?? 0;
  const marketCap = market.marketCap ?? (price && shares ? price * shares : 0);
  const R = marketCap > 0 ? (I / marketCap) * 100 : undefined;
  const rf = market.rf ?? 2.5;
  const II = Math.max(3.5, rf + 2);

  const debtSeries = market.financials.slice(0, 3).map((f) => f.interestBearingDebt ?? 0);
  const fcfSeries = market.financials.slice(0, 3).map((f) => (f.ocf ?? 0) - Math.abs(f.capex ?? 0));
  const longNegativeFcf = fcfSeries.length >= 2 && fcfSeries.every((v) => v < 0);
  const debtIncreasing = debtSeries.length >= 2 && debtSeries[0]! > debtSeries[1]!;
  if (longNegativeFcf && debtIncreasing) {
    return { passed: false, reason: "因子2-S2否决：FCF长期为负且借债上升", A, B, C, D, E, G, I, M, O, Q, R, II, rejectType: "S2" };
  }

  if (R !== undefined && (R < rf || R < II * 0.5)) {
    return { passed: false, reason: `因子2-S4否决：R=${R.toFixed(2)}% 低于阈值`, A, B, C, D, E, G, I, M, O, Q, R, II, rejectType: "S4" };
  }

  return { passed: true, A, B, C, D, E, G, I, M, O, Q, R, II };
}
