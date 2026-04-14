import type { FinancialSnapshot, MarketDataProvider } from "@trade-signal/schema-core";

function yearFromPeriod(period?: string): string | undefined {
  const matched = period?.match(/20\d{2}/)?.[0];
  return matched;
}

function snapshotYear(s: FinancialSnapshot): string | undefined {
  return yearFromPeriod(s.period);
}

/**
 * 去重、按年度降序；同一 API 多次返回相同期时只保留一条。
 */
export function normalizeFinancialHistory(rows: FinancialSnapshot[]): FinancialSnapshot[] {
  const byYear = new Map<string, FinancialSnapshot>();
  for (const row of rows) {
    const y = snapshotYear(row) ?? row.period;
    if (!y) continue;
    const existing = byYear.get(y);
    if (!existing) {
      byYear.set(y, row);
      continue;
    }
    const score = (s: FinancialSnapshot) =>
      [s.revenue, s.netProfit, s.totalAssets].filter((v) => v != null && Number.isFinite(v)).length;
    if (score(row) > score(existing)) byYear.set(y, row);
  }
  return [...byYear.values()].sort((a, b) => {
    const ya = snapshotYear(a) ?? "";
    const yb = snapshotYear(b) ?? "";
    return yb.localeCompare(ya);
  });
}

/**
 * 尝试拉取多年财报：优先 provider.getFinancialHistory，否则按年度多次 getFinancialSnapshot。
 */
export async function loadFinancialHistory(
  provider: MarketDataProvider,
  code: string,
  anchorYear: number,
  maxYears = 5,
): Promise<FinancialSnapshot[] | undefined> {
  const fiscalYears = [...Array(maxYears).keys()].map((i) => String(anchorYear - i));

  if (provider.getFinancialHistory) {
    try {
      const rows = await provider.getFinancialHistory(code, fiscalYears);
      const norm = normalizeFinancialHistory(rows ?? []);
      if (norm.length >= 1) return norm;
    } catch {
      /* fall through */
    }
  }

  const settled = await Promise.allSettled(
    fiscalYears.map((y) => provider.getFinancialSnapshot(code, `${y}-12-31`)),
  );
  const raw: FinancialSnapshot[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") raw.push(r.value);
  }
  const norm = normalizeFinancialHistory(raw);
  if (norm.length <= 1) {
    const uniq = new Set(norm.map((s) => `${s.revenue ?? ""}|${s.netProfit ?? ""}|${s.totalAssets ?? ""}`));
    if (uniq.size <= 1 && norm.length > 1) {
      return norm.slice(0, 1);
    }
  }
  return norm.length > 0 ? norm : undefined;
}
