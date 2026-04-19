import type { DataPackMarketParsed, Factor3Result, Factor4Result } from "../types.js";

function countTrapFeatures(market: DataPackMarketParsed): number {
  let count = 0;
  const f = market.financials;
  if (f.length >= 3) {
    const ff = f.slice(0, 3).map((x) => (x.ocf ?? 0) - Math.abs(x.capex ?? 0));
    if (ff[0]! < ff[1]! && ff[1]! < ff[2]!) count += 1;
  }
  if ((market.industry ?? "").includes("强周期")) count += 1;
  if (market.warnings.some((w) => w.level === "high")) count += 1;
  return count;
}

export function runFactor4(market: DataPackMarketParsed, factor3: Factor3Result): Factor4Result {
  const GG = factor3.GG ?? 0;
  const rf = market.rf ?? 2.5;
  const II = Math.max(3.5, rf + 2);
  const JJ = GG - II;
  const trapCount = countTrapFeatures(market);
  const trapRisk: Factor4Result["trapRisk"] = trapCount >= 2 ? "high" : trapCount === 1 ? "medium" : "low";

  const growthContribution = GG > 0 ? Math.min(100, (Math.max(0, GG - II) / Math.max(GG, 0.01)) * 100) : 0;
  if (GG < II && growthContribution < 30) {
    return {
      passed: false,
      reason: "因子4-S1：门槛不达标且成长性占比<30%",
      II,
      JJ,
      KK: JJ,
      trapCount,
      trapRisk,
      position: "排除",
    };
  }

  if (trapCount >= 2 && GG < II * 1.5) {
    return {
      passed: false,
      reason: "因子4-S2：价值陷阱特征>=2且GG<II×1.5",
      II,
      JJ,
      KK: JJ * 0.8,
      trapCount,
      trapRisk,
      position: "排除",
    };
  }

  const KK = JJ * (trapRisk === "low" ? 1 : trapRisk === "medium" ? 0.85 : 0.7);
  const position = KK >= 1.5 ? "标准仓位" : KK >= 0.5 ? "70%仓位" : KK >= 0 ? "50%仓位" : "观察";
  return {
    passed: true,
    II,
    JJ,
    KK,
    trapCount,
    trapRisk,
    position,
  };
}
