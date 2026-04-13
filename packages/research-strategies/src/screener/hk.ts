import type { ScreenerCandidate, ScreenerConfig, ScreenerUniverseRow } from "./types.js";

function safe(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function yearsSinceList(listDate?: string): number {
  if (!listDate || listDate.length < 4) return 0;
  const y = Number(listDate.slice(0, 4));
  if (!Number.isFinite(y)) return 0;
  return new Date().getFullYear() - y;
}

export function tier1FilterHk(rows: ScreenerUniverseRow[], cfg: ScreenerConfig): ScreenerCandidate[] {
  const pre = rows.filter((row) => {
    if (row.market !== "HK") return false;
    if (yearsSinceList(row.listDate) < cfg.minListingYears) return false;
    if ((safe(row.marketCap) ?? 0) < cfg.minMarketCap) return false;
    if ((safe(row.turnover) ?? 0) < cfg.minTurnover) return false;
    const pb = safe(row.pb);
    if (pb === undefined || pb <= 0 || pb > cfg.maxPb) return false;
    return true;
  });

  const main = pre
    .filter((row) => {
      const pe = safe(row.pe);
      const dv = safe(row.dv);
      return pe !== undefined && pe > 0 && pe <= cfg.maxPe && dv !== undefined && dv > 0;
    })
    .map((row) => ({ ...row, channel: "main" as const }));

  const observation = pre
    .filter((row) => {
      const pe = safe(row.pe);
      return pe !== undefined && pe < 0;
    })
    .sort((a, b) => (safe(b.marketCap) ?? 0) - (safe(a.marketCap) ?? 0))
    .slice(0, cfg.obsChannelLimit)
    .map((row) => ({ ...row, channel: "observation" as const }));

  const dvMax = Math.max(...main.map((r) => safe(r.dv) ?? 0), 0.0001);
  const peInvMax = Math.max(...main.map((r) => 1 / Math.max(safe(r.pe) ?? Number.POSITIVE_INFINITY, 1e-6)), 0.0001);
  const pbInvMax = Math.max(...main.map((r) => 1 / Math.max(safe(r.pb) ?? Number.POSITIVE_INFINITY, 1e-6)), 0.0001);

  const rankedMain = main
    .map((row) => {
      const dvNorm = (safe(row.dv) ?? 0) / dvMax;
      const peNorm = (1 / Math.max(safe(row.pe) ?? Number.POSITIVE_INFINITY, 1e-6)) / peInvMax;
      const pbNorm = (1 / Math.max(safe(row.pb) ?? Number.POSITIVE_INFINITY, 1e-6)) / pbInvMax;
      const tier1Score = 0.4 * dvNorm + 0.3 * peNorm + 0.3 * pbNorm;
      return { ...row, tier1Score };
    })
    .sort((a, b) => b.tier1Score - a.tier1Score)
    .slice(0, cfg.tier2MainLimit);

  const rankedObs = observation.map((row) => ({ ...row, tier1Score: 0 }));
  return [...rankedMain, ...rankedObs];
}
