import type { ValuationComputed, ValuationMethodResult } from "@trade-signal/schema-core";

import type {
  Phase3CompanyType,
  Phase3FinancialYear,
  Phase3MarketInput,
  WeightedMethodValue,
} from "./types.js";

const METHOD_WEIGHTS: Record<Phase3CompanyType, Record<string, number>> = {
  blue_chip_value: { DCF: 40, DDM: 30, PE_BAND: 30 },
  growth: { DCF: 35, PEG: 35, PS: 30 },
  hybrid: { DCF: 35, PE_BAND: 25, PEG: 25, DDM: 15 },
};

const MARKET_PARAMS = {
  CN_A: { erp: 6.0, rf: 2.5, tax: 25, gTerminal: 3.0 },
  HK: { erp: 5.5, rf: 4.0, tax: 16.5, gTerminal: 2.5 },
  US: { erp: 5.0, rf: 4.0, tax: 21.0, gTerminal: 2.5 },
} as const;

function avg(values: Array<number | undefined>): number | undefined {
  const clean = values.filter((v): v is number => Number.isFinite(v));
  if (clean.length === 0) return undefined;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function cagr(valuesDesc: Array<number | undefined>): number | undefined {
  const clean = valuesDesc.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  if (clean.length < 2) return undefined;
  const latest = clean[0];
  const oldest = clean[clean.length - 1];
  const n = clean.length - 1;
  return Math.pow(latest / oldest, 1 / n) - 1;
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const k = ((sortedValues.length - 1) * p) / 100;
  const f = Math.floor(k);
  const c = Math.ceil(k);
  if (f === c) return sortedValues[f] ?? sortedValues[0] ?? 0;
  const left = sortedValues[f] ?? sortedValues[0] ?? 0;
  const right = sortedValues[c] ?? sortedValues[sortedValues.length - 1] ?? left;
  return left * (c - k) + right * (k - f);
}

function std(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function normalizeFinancials(financials?: Phase3FinancialYear[]): Phase3FinancialYear[] {
  return [...(financials ?? [])].sort((a, b) => String(b.year).localeCompare(String(a.year)));
}

function inferMarket(input: Phase3MarketInput): "CN_A" | "HK" | "US" {
  if (input.market === "HK" || input.market === "US" || input.market === "CN_A") return input.market;
  return "CN_A";
}

function classifyCompany(financials: Phase3FinancialYear[]): Phase3CompanyType {
  const revenueCagr = cagr(financials.map((f) => f.revenue));
  const profitCagr = cagr(financials.map((f) => f.netProfit));
  const payoutAvg = avg(
    financials
      .map((f) => {
        if (!f.dividendPerShare || !f.basicEps || f.basicEps <= 0) return undefined;
        return (f.dividendPerShare / f.basicEps) * 100;
      })
      .slice(0, 3),
  );

  let blue = 0;
  let growth = 0;
  if ((payoutAvg ?? 0) > 30) blue += 1;
  if ((revenueCagr ?? 0) * 100 < 20) blue += 1;
  if ((revenueCagr ?? 0) * 100 > 20) growth += 1;
  if ((profitCagr ?? 0) * 100 > 25) growth += 1;

  if (blue >= 2 && growth === 0) return "blue_chip_value";
  if (growth >= 2 && blue <= 1) return "growth";
  return "hybrid";
}

function computeWacc(input: Phase3MarketInput, companyType: Phase3CompanyType): {
  wacc: number;
  ke: number;
  assumptions: Record<string, number | string>;
} {
  const market = inferMarket(input);
  const params = MARKET_PARAMS[market];
  const rf = input.riskFreeRate ?? params.rf;
  const beta = input.beta ?? (input.marketCap && input.marketCap > 1_000_000 ? 0.8 : input.marketCap && input.marketCap > 100_000 ? 1 : 1.2);
  const ke = rf + beta * params.erp;
  const debt = input.debt ?? 0;
  const equity = input.marketCap ?? 0;
  const total = debt + equity;
  const eWeight = total > 0 ? equity / total : 1;
  const dWeight = total > 0 ? debt / total : 0;
  const kdPre = rf + (companyType === "growth" ? 1.5 : 1.0);
  const taxRate = input.taxRate ?? params.tax;
  const wacc = debt > 0 ? ke * eWeight + kdPre * (1 - taxRate / 100) * dWeight : ke;
  return {
    wacc,
    ke,
    assumptions: {
      market,
      rf,
      beta,
      erp: params.erp,
      kdPre,
      taxRate,
      eWeight,
      dWeight,
      gTerminalDefault: params.gTerminal,
    },
  };
}

function dcfMethod(input: Phase3MarketInput, financials: Phase3FinancialYear[], wacc: number): ValuationMethodResult | undefined {
  const shares = input.totalShares;
  if (!shares || shares <= 0 || financials.length < 2) {
    return {
      method: "DCF",
      note: "insufficient data: totalShares/financials",
    };
  }
  const market = inferMarket(input);
  const gTerminal = Math.min(MARKET_PARAMS[market].gTerminal, wacc - 1);
  const fcfSeries = financials
    .map((f) => {
      const ocf = f.operatingCashFlow ?? (f.netProfit ?? 0) * 1.1;
      const capex = Math.abs(f.capex ?? (f.revenue ?? 0) * 0.04);
      return ocf - capex;
    })
    .filter((v) => Number.isFinite(v));
  if (fcfSeries.length < 2) {
    return {
      method: "DCF",
      note: "insufficient cash flow series",
    };
  }
  const base = avg(fcfSeries.slice(0, 3));
  if (base === undefined || base <= 0) {
    return {
      method: "DCF",
      note: "non-positive fcf base",
    };
  }
  const growth = Math.max(0, ((cagr(fcfSeries) ?? 0.05) * 100) * 0.8);
  const projected: number[] = [];
  let prev = base;
  for (let i = 0; i < 5; i += 1) {
    prev = prev * (1 + growth / 100);
    projected.push(prev);
  }
  const discount = 1 + wacc / 100;
  const pvFcf = projected.reduce((acc, f, idx) => acc + f / Math.pow(discount, idx + 1), 0);
  const terminal = (projected[4] * (1 + gTerminal / 100)) / ((wacc - gTerminal) / 100);
  const pvTerminal = terminal / Math.pow(discount, 5);
  const enterprise = pvFcf + pvTerminal;
  const equityValue = enterprise + (input.cash ?? 0) - (input.debt ?? 0);
  const perShare = equityValue / shares;
  return {
    method: "DCF",
    value: perShare,
    range: {
      conservative: perShare * 0.85,
      central: perShare,
      optimistic: perShare * 1.15,
    },
    assumptions: {
      gTerminal,
      growth,
      fcfBase: base,
      shares,
    },
  };
}

function ddmMethod(financials: Phase3FinancialYear[], ke: number): ValuationMethodResult | undefined {
  const dps = financials
    .map((f) => f.dividendPerShare)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (dps.length < 3) {
    return { method: "DDM", note: "insufficient dividend history" };
  }
  const latest = dps[0];
  const g = Math.min(((cagr(dps) ?? 0.03) * 100), ke - 1);
  if (g <= 0 || g >= ke) {
    return { method: "DDM", note: "invalid growth/ke relationship" };
  }
  const value = (latest * (1 + g / 100)) / ((ke - g) / 100);
  return {
    method: "DDM",
    value,
    range: { conservative: value * 0.9, central: value, optimistic: value * 1.1 },
    assumptions: { latestDps: latest, g, ke },
  };
}

function peBandMethod(input: Phase3MarketInput, financials: Phase3FinancialYear[]): ValuationMethodResult | undefined {
  const currentPe = input.peTtm;
  const eps = financials
    .map((f) => f.basicEps)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (!currentPe || currentPe <= 0 || eps.length === 0) {
    return { method: "PE_BAND", note: "insufficient pe/eps" };
  }
  const peSeries = [currentPe * 0.65, currentPe * 0.85, currentPe, currentPe * 1.15, currentPe * 1.35].sort(
    (a, b) => a - b,
  );
  const epsNorm = avg(eps.slice(0, 3)) ?? eps[0];
  const medianPe = percentile(peSeries, 50);
  const value = medianPe * epsNorm;
  return {
    method: "PE_BAND",
    value,
    range: {
      conservative: percentile(peSeries, 25) * epsNorm,
      central: value,
      optimistic: percentile(peSeries, 75) * epsNorm,
    },
    assumptions: {
      currentPe,
      epsNorm,
      peMedian: medianPe,
    },
  };
}

function pegMethod(input: Phase3MarketInput, financials: Phase3FinancialYear[]): ValuationMethodResult | undefined {
  const pe = input.peTtm;
  if (!pe || pe <= 0) return { method: "PEG", note: "missing pe" };
  const profitGrowthPct = (cagr(financials.map((f) => f.netProfit)) ?? 0) * 100;
  if (profitGrowthPct <= 0) return { method: "PEG", note: "non-positive profit growth" };
  const epsNow = financials[0]?.basicEps;
  if (!epsNow || epsNow <= 0) return { method: "PEG", note: "missing basic eps" };
  const fairPe = profitGrowthPct;
  const value = fairPe * epsNow;
  return {
    method: "PEG",
    value,
    range: { conservative: value * 0.85, central: value, optimistic: value * 1.2 },
    assumptions: {
      pe,
      profitGrowthPct,
      peg: pe / profitGrowthPct,
      epsNow,
    },
  };
}

function psMethod(input: Phase3MarketInput, financials: Phase3FinancialYear[]): ValuationMethodResult | undefined {
  if (!input.marketCap || input.marketCap <= 0 || !input.totalShares || input.totalShares <= 0) {
    return { method: "PS", note: "missing marketCap/totalShares" };
  }
  const revenueNow = financials[0]?.revenue;
  if (!revenueNow || revenueNow <= 0) return { method: "PS", note: "missing revenue" };
  const currentPs = input.marketCap / revenueNow;
  const psMedian = percentile([currentPs * 0.7, currentPs * 0.85, currentPs, currentPs * 1.2, currentPs * 1.35], 50);
  const equity = psMedian * revenueNow;
  const value = equity / input.totalShares;
  return {
    method: "PS",
    value,
    range: { conservative: value * 0.8, central: value, optimistic: value * 1.2 },
    assumptions: { currentPs, psMedian, revenueNow },
  };
}

function buildWeightedValues(methods: ValuationMethodResult[], weights: Record<string, number>): WeightedMethodValue[] {
  const available = methods.filter((m): m is ValuationMethodResult & { value: number } => typeof m.value === "number" && m.value > 0);
  const weightTotal = available.reduce((acc, item) => acc + (weights[item.method] ?? 0), 0);
  return available.map((item) => {
    const normalizedWeight = weightTotal > 0 ? (weights[item.method] ?? 0) / weightTotal : 1 / available.length;
    return {
      method: item.method,
      value: item.value,
      weight: normalizedWeight,
    };
  });
}

function crossValidate(methods: ValuationMethodResult[], weights: Record<string, number>) {
  const weighted = buildWeightedValues(methods, weights);
  if (weighted.length === 0) {
    return {
      weightedAverage: undefined,
      coefficientOfVariation: undefined,
      consistency: "n/a" as const,
      activeWeights: {},
      range: {},
    };
  }
  const values = weighted.map((w) => w.value);
  const weightedAverage = weighted.reduce((acc, row) => acc + row.value * row.weight, 0);
  const cv = weightedAverage > 0 ? (std(values) / weightedAverage) * 100 : 0;
  const consistency: "high" | "medium" | "low" = cv < 15 ? "high" : cv < 30 ? "medium" : "low";
  const activeWeights: Record<string, number> = {};
  for (const row of weighted) activeWeights[row.method] = row.weight;
  return {
    weightedAverage,
    coefficientOfVariation: cv,
    consistency,
    activeWeights,
    range: {
      conservative: Math.min(...values),
      central: weightedAverage,
      optimistic: Math.max(...values),
    },
  };
}

function reverseExpectation(input: Phase3MarketInput, financials: Phase3FinancialYear[], ke: number, wacc: number) {
  const pe = input.peTtm;
  const impliedGrowthFromPe = pe && pe > 0 ? ke - 100 / pe : undefined;
  const profitGrowth = (cagr(financials.map((f) => f.netProfit)) ?? 0) * 100;
  const fcf = avg(financials.map((f) => (f.operatingCashFlow ?? 0) - Math.abs(f.capex ?? 0)));
  const fcfYield = fcf && input.marketCap ? (fcf / input.marketCap) * 100 : undefined;
  return {
    impliedGrowthFromPe,
    historicalProfitCagr: profitGrowth || undefined,
    fcfYield,
    modelWacc: wacc,
    modelKe: ke,
  };
}

export function runPhase3ValuationEngine(input: Phase3MarketInput): ValuationComputed {
  const financials = normalizeFinancials(input.financials);
  const companyType = classifyCompany(financials);
  const weights = METHOD_WEIGHTS[companyType];
  const waccResult = computeWacc(input, companyType);

  const methods: ValuationMethodResult[] = [
    dcfMethod(input, financials, waccResult.wacc),
    ddmMethod(financials, waccResult.ke),
    peBandMethod(input, financials),
    pegMethod(input, financials),
    psMethod(input, financials),
  ].filter((m): m is ValuationMethodResult => Boolean(m));

  const cross = crossValidate(methods, weights);
  const implied = reverseExpectation(input, financials, waccResult.ke, waccResult.wacc);

  return {
    code: input.code,
    generatedAt: new Date().toISOString(),
    companyType,
    wacc: waccResult.wacc,
    ke: waccResult.ke,
    methods,
    crossValidation: cross,
    impliedExpectations: {
      ...implied,
      ...waccResult.assumptions,
    },
  };
}
