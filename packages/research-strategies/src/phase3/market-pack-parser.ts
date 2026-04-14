import type { DataPackMarketParsed, FinancialYearData, WarningEntry } from "./types.js";

function toNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replaceAll(",", "").replace(/[\s ]/g, "");
  const matched = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!matched) return undefined;
  const value = Number(matched[0]);
  return Number.isFinite(value) ? value : undefined;
}

function parseWarnings(text: string): WarningEntry[] {
  const lines = text.split(/\r?\n/);
  const warnings: WarningEntry[] = [];
  for (const line of lines) {
    const m = line.match(/\[(.*?)\|(.*?)\]\s*(.*)/);
    if (!m) continue;
    const type = (m[1] || "").trim() || "未知";
    const levelRaw = (m[2] || "").trim();
    const level: WarningEntry["level"] = levelRaw.includes("高") ? "high" : levelRaw.includes("中") ? "medium" : "low";
    warnings.push({ type, level, text: (m[3] || "").trim() || line.trim() });
  }
  return warnings;
}

function parseFinancialRows(text: string): FinancialYearData[] {
  const lines = text.split(/\r?\n/);
  const byYear = new Map<string, FinancialYearData>();

  const update = (year: string, key: keyof FinancialYearData, value: number | undefined) => {
    if (!value && value !== 0) return;
    const row = byYear.get(year) ?? { year };
    row[key] = value as never;
    byYear.set(year, row);
  };

  let activeYears: string[] = [];
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 2) continue;

    const headerYears = cells.filter((c) => /^20\d{2}$/.test(c));
    if (headerYears.length > 0) {
      activeYears = headerYears;
      continue;
    }

    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (activeYears.length === 0) continue;

    const rowName = cells[0] ?? "";
    if (rowName.includes("母公司")) continue;
    const values = cells
      .slice(1, activeYears.length + 1)
      .map((v) => toNumber(v))
      .filter((v): v is number => typeof v === "number");
    for (let i = 0; i < activeYears.length && i < values.length; i += 1) {
      const year = activeYears[i] as string;
      const val = values[i];
      if (rowName.includes("营业收入")) update(year, "revenue", val);
      if (rowName.includes("归母净利润") || rowName.includes("归属于母公司")) update(year, "netProfit", val);
      if (rowName.includes("经营活动现金流") || rowName.includes("OCF")) update(year, "ocf", val);
      if (rowName.includes("资本开支") || rowName.includes("Capex")) update(year, "capex", val);
      if (rowName.includes("总资产")) update(year, "totalAssets", val);
      if (rowName.includes("总负债")) update(year, "totalLiabilities", val);
      if (rowName.includes("有息负债")) update(year, "interestBearingDebt", val);
      if (rowName.includes("货币资金") || rowName.includes("现金")) update(year, "cash", val);
      if (rowName.includes("每股收益") || rowName.includes("EPS")) update(year, "basicEps", val);
      if (rowName.includes("DPS") || rowName.includes("每股分红")) update(year, "dps", val);
      if (rowName.includes("少数股东损益")) update(year, "minorityPnL", val);
    }
  }

  return [...byYear.values()].sort((a, b) => String(b.year).localeCompare(String(a.year)));
}

export function parseDataPackMarket(markdown: string): DataPackMarketParsed {
  const code = markdown.match(/(\d{6})/)?.[1] ?? "UNKNOWN";
  const name = markdown.match(/#\s*(.+?)(?:\(|（|\n)/)?.[1]?.trim();
  const rf = toNumber(markdown.match(/无风险利率[^\d-]*(-?\d+(?:\.\d+)?)/)?.[1]);
  const price = toNumber(markdown.match(/(?:最新股价|收盘价)[^\d-]*(-?\d+(?:\.\d+)?)/)?.[1]);
  const marketCap = toNumber(markdown.match(/(?:最新市值|总市值)[^\d-]*(-?\d[\d,]*(?:\.\d+)?)/)?.[1]);
  const totalShares = toNumber(markdown.match(/(?:总股本|股本)[^\d-]*(-?\d[\d,]*(?:\.\d+)?)/)?.[1]);
  const industry = markdown.match(/行业[:：]\s*(.+)/)?.[1]?.trim();
  const warnings = parseWarnings(markdown);
  const financials = parseFinancialRows(markdown);
  const hasInterim = /Q3|H1|Q1|中报/.test(markdown);

  return {
    code,
    name,
    market: "CN_A",
    currency: "CNY",
    rf,
    price,
    marketCap,
    totalShares,
    industry,
    warnings,
    financials,
    hasInterim,
    sourceText: markdown,
  };
}
