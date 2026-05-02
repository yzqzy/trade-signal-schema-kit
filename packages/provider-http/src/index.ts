import type {
  CorporateAction,
  CompanyOperationsSnapshot,
  FinancialQualityTrend,
  FinancialSnapshot,
  GovernanceEventCollection,
  GovernanceNegativeEvent,
  HistoricalPeSeries,
  Instrument,
  IndustryCycleSnapshot,
  KlineBar,
  Market,
  MarketDataProvider,
  OperationsInsightSnapshot,
  PeerComparableCollection,
  Quote,
  RegulatoryEvent,
  RegulatoryEventCollection,
  SwIndustryClassification,
  TradingCalendar,
} from "@trade-signal/schema-core";

export interface HttpProviderOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  apiBasePath?: string;
}

export function createFeedHttpProviderFromEnv(
  overrides: Partial<HttpProviderOptions> = {},
): FeedHttpProvider {
  const baseUrl = overrides.baseUrl ?? process.env.FEED_BASE_URL;
  if (!baseUrl) {
    throw new Error("Missing FEED_BASE_URL (or pass overrides.baseUrl)");
  }
  return new FeedHttpProvider({
    baseUrl,
    apiKey: overrides.apiKey ?? process.env.FEED_API_KEY,
    apiBasePath: overrides.apiBasePath ?? "/api/v1",
    timeoutMs: overrides.timeoutMs,
  });
}

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

type StockDetailPayload = {
  code?: string;
  secucode?: string;
  name?: string;
  currency?: string;
  lotSize?: number;
  lot_size?: number;
  tickSize?: number;
  tick_size?: number;
  market?: string | number;
  industry?: string;
  sector?: string;
  hybk?: string;
};

type SwIndustryClassificationPayload = SwIndustryClassification;

type StockQuotePayload = {
  code?: string;
  secucode?: string;
  name?: string;
  newPrice?: number;
  price?: number;
  latestPrice?: number;
  changeRate?: number;
  changePct?: number;
  volume?: number;
  amount?: number;
  quoteTime?: string;
  updateTime?: string;
  timestamp?: string;
};

type StockListPayload = {
  total?: number;
  diff?: Array<StockDetailPayload & StockQuotePayload & { f152?: number; marketId?: number }>;
  data?: Array<StockDetailPayload & StockQuotePayload & { f152?: number; marketId?: number }>;
  list?: Array<StockDetailPayload & StockQuotePayload & { f152?: number; marketId?: number }>;
};

type KlineRecord =
  | {
      date?: string;
      time?: string;
      open?: number;
      high?: number;
      low?: number;
      close?: number;
      volume?: number;
    }
  | string;

type KlinePayload = {
  code?: string;
  secucode?: string;
  klines?: KlineRecord[];
  data?: KlineRecord[];
  diagnostics?: {
    warnings?: string[];
    source?: string;
    browserError?: string;
    directError?: string;
  };
};

type HistoricalPePayload = {
  code?: string;
  source?: string;
  interval?: string | number;
  dates?: string[];
  date?: string[];
  peTtm?: number[];
  pe_ttm?: number[];
  prices?: number[];
  price?: number[];
  currentPe?: number;
  percentile?: number;
  mean?: number;
  median?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  min?: number;
  minDate?: string;
  max?: number;
  maxDate?: string;
  stats?: Partial<HistoricalPeSeries>;
};

type FinancialPayload = {
  code?: string;
  secucode?: string;
  reportDate?: string;
  period?: string;
  revenue?: number;
  operatingRevenue?: number;
  totalRevenue?: number;
  netProfit?: number;
  parentNetProfit?: number;
  roePct?: number;
  roe?: number;
  grossMarginPct?: number;
  grossMargin?: number;
  debtRatioPct?: number;
  debtRatio?: number;
  auditResult?: string;
  auditOpinion?: string;
  accountsReceivable?: number;
  accountReceivable?: number;
  ar?: number;
  contractLiabilities?: number;
  contractLiability?: number;
  contractDebt?: number;
  creditImpairmentLoss?: number;
  creditImpairLoss?: number;
  badDebtLoss?: number;
  ebitda?: number;
  ebitDa?: number;
  ebitdaTtm?: number;
  operatingCashFlow?: number;
  netCashflowOper?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  capex?: number;
  capitalExpenditure?: number;
  interestBearingDebt?: number;
  interestDebt?: number;
  monetaryFunds?: number;
  cash?: number;
  cashAndEquivalents?: number;
  minorityInterest?: number;
  minorityInterestPnL?: number;
  minorityPnL?: number;
  eps?: number;
  basicEps?: number;
  earningsPerShare?: number;
  dps?: number;
  dividendsPerShare?: number;
  dividendPerShare?: number;
  totalMv?: number;
  marketCap?: number;
  marketCapBaiWan?: number;
  totalShares?: number;
  totalSharesOutstandingMm?: number;
  floatShares?: number;
  parentRevenue?: number;
  parentOperatingRevenue?: number;
  parentOperatingCashFlow?: number;
  parentTotalAssets?: number;
  parentTotalLiabilities?: number;
};

type FeedIndustryCyclePayload = {
  industryName?: string;
  source?: string;
  cyclicality?: string;
  position?: string;
  confidence?: string;
  metrics?: {
    sampleSizeCurrent?: number;
    sampleSizePrevious?: number;
    revenueAllYearYoY?: number;
    parentNiAllYearYoY?: number;
  };
};

type FeedPeerPoolPayload = {
  industryName?: string;
  source?: string;
  sortColumn?: string;
  peers?: Array<{
    code?: string;
    name?: string;
    industryName?: string;
    year?: string | number;
    revenueAllYear?: number;
    parentNiAllYear?: number;
    parentNi3Q?: number;
    marketCap1Q?: number;
    marketCap4Q?: number;
  }>;
};

type FeedGovernanceEventsPayload = {
  source?: string;
  events?: Array<{
    category?: string;
    title?: string;
    summary?: string;
    severity?: string;
    publishedAt?: string;
    happenedAt?: string;
    eventDate?: string;
    sourceOrg?: string;
    url?: string;
  }>;
  highSeverityCount?: number;
};

type FeedRegulatoryEventsPayload = {
  source?: string;
  exchange?: string;
  eventKinds?: string[];
  total?: number;
  sources?: RegulatoryEventCollection["sources"];
  events?: RegulatoryEvent[];
};

type FeedOperationsInsightPayload = {
  source?: string;
  status?: "pass" | "degraded";
  missingFields?: string[];
  degradeReasons?: string[];
  data?: {
    industryCycle?: FeedIndustryCyclePayload;
    governanceTimeline?: FeedGovernanceEventsPayload["events"];
    earningsGuidance?: Array<Record<string, unknown>>;
    businessHighlights?: Array<Record<string, unknown>>;
    themeSignals?: Array<Record<string, unknown>>;
    companyOperations?: FeedCompanyOperationsPayload;
  };
};

type FeedCompanyOperationsPayload = CompanyOperationsSnapshot & {
  code?: string;
  secuCode?: string;
};

type FeedFinancialStatementsPayload = {
  code?: string;
  years?: number;
  balance?: Array<{ reportDate?: string; camel?: Record<string, unknown>; raw?: Record<string, unknown> }>;
  income?: Array<{ reportDate?: string; camel?: Record<string, unknown>; raw?: Record<string, unknown> }>;
  cashflow?: Array<{ reportDate?: string; camel?: Record<string, unknown>; raw?: Record<string, unknown> }>;
};

type FeedFinancialRatioPayload = {
  code?: string;
  years?: number;
  items?: Array<{
    reportDate?: string;
    absolute?: Record<string, unknown>;
    percentOfRevenue?: Record<string, unknown>;
  }>;
};
type FeedFinancialRatioItem = NonNullable<FeedFinancialRatioPayload["items"]>[number];

const PERIOD_TO_FQT: Record<"none" | "forward" | "backward", "none" | "pre" | "after"> = {
  none: "none",
  forward: "pre",
  backward: "after",
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const isTransientFeedError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /socket hang up|ECONNRESET|fetch failed/i.test(message);
};

const eastmoneyScaledNumber = (value: unknown, scale: unknown): number | undefined => {
  const n = asNumber(value);
  if (n === undefined) return undefined;
  const s = asNumber(scale);
  return s !== undefined && s > 0 && s < 10 ? n / 10 ** s : n;
};

const pickTimestamp = (...values: Array<unknown>): string => {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
    if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  }
  return new Date().toISOString();
};

const inferMarket = (input: string): Market => {
  const code = input.trim().toUpperCase();
  if (code.endsWith(".HK") || /^\d{5}$/.test(code)) return "HK";
  return "CN_A";
};

const toCyclicality = (value: unknown): IndustryCycleSnapshot["cyclicality"] => {
  const v = typeof value === "string" ? value.toLowerCase() : "";
  if (v === "strong") return "strong";
  if (v === "weak") return "weak";
  if (v === "non_cyclical") return "non_cyclical";
  return "unknown";
};

const toCyclePosition = (value: unknown): IndustryCycleSnapshot["position"] => {
  const v = typeof value === "string" ? value.toLowerCase() : "";
  if (v === "bottom") return "bottom";
  if (v === "middle") return "middle";
  if (v === "top") return "top";
  return "unknown";
};

const toConfidence = (value: unknown): IndustryCycleSnapshot["confidence"] => {
  const v = typeof value === "string" ? value.toLowerCase() : "";
  if (v === "high") return "high";
  if (v === "medium") return "medium";
  return "low";
};

const toGovSeverity = (value: unknown): GovernanceNegativeEvent["severity"] => {
  const v = typeof value === "string" ? value.toLowerCase() : "";
  if (v === "high") return "high";
  if (v === "medium") return "medium";
  return "low";
};

function firstNumber(row: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  if (!row) return undefined;
  for (const key of keys) {
    const value = asNumber(row[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function divide(numerator: number | undefined, denominator: number | undefined): number | undefined {
  if (numerator === undefined || denominator === undefined || denominator === 0) return undefined;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : undefined;
}

function ratioPct(
  numerator: number | undefined,
  denominator: number | undefined,
): number | undefined {
  const v = divide(numerator, denominator);
  return v === undefined ? undefined : v * 100;
}

function expenseRatioPct(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.abs(value);
}

function avg(a: number | undefined, b: number | undefined): number | undefined {
  if (a !== undefined && b !== undefined) return (a + b) / 2;
  return a ?? b;
}

function yuanToBaiWanMaybe(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Math.abs(value) > 10_000_000 ? value / 1_000_000 : value;
}

function yearFromReportDate(value: string | undefined): string | undefined {
  return value?.match(/^(20\d{2})/)?.[1];
}

function fiscalYearToken(input: string): string {
  const m = input.match(/(20\d{2})/);
  return (m?.[1] ?? input.slice(0, 4)).trim();
}

function mapFinancialPayload(payload: FinancialPayload, code: string, period: string): FinancialSnapshot {
  return {
    code: payload.code ?? payload.secucode ?? code,
    period: payload.period ?? payload.reportDate ?? period,
    revenue: asNumber(payload.revenue ?? payload.operatingRevenue ?? payload.totalRevenue),
    netProfit: asNumber(payload.netProfit ?? payload.parentNetProfit),
    roePct: asNumber(payload.roePct ?? payload.roe),
    grossMarginPct: asNumber(payload.grossMarginPct ?? payload.grossMargin),
    debtRatioPct: asNumber(payload.debtRatioPct ?? payload.debtRatio),
    auditResult:
      typeof payload.auditResult === "string"
        ? payload.auditResult
        : typeof payload.auditOpinion === "string"
          ? payload.auditOpinion
          : undefined,
    accountsReceivable: asNumber(payload.accountsReceivable ?? payload.accountReceivable ?? payload.ar),
    contractLiabilities: asNumber(
      payload.contractLiabilities ?? payload.contractLiability ?? payload.contractDebt,
    ),
    creditImpairmentLoss: asNumber(
      payload.creditImpairmentLoss ?? payload.creditImpairLoss ?? payload.badDebtLoss,
    ),
    ebitda: asNumber(payload.ebitda ?? payload.ebitDa ?? payload.ebitdaTtm),
    operatingCashFlow: asNumber(payload.operatingCashFlow ?? payload.netCashflowOper),
    totalAssets: asNumber(payload.totalAssets),
    totalLiabilities: asNumber(payload.totalLiabilities),
    capitalExpenditure: asNumber(payload.capex ?? payload.capitalExpenditure),
    interestBearingDebt: asNumber(payload.interestBearingDebt ?? payload.interestDebt),
    cashAndEquivalents: asNumber(payload.monetaryFunds ?? payload.cash ?? payload.cashAndEquivalents),
    minorityInterestPnL: asNumber(
      payload.minorityInterestPnL ?? payload.minorityPnL ?? payload.minorityInterest,
    ),
    earningsPerShare: asNumber(payload.earningsPerShare ?? payload.basicEps ?? payload.eps),
    dividendsPerShare: asNumber(payload.dividendsPerShare ?? payload.dps ?? payload.dividendPerShare),
    marketCapBaiWan: asNumber(payload.marketCapBaiWan ?? payload.totalMv ?? payload.marketCap),
    totalSharesOutstandingMm: asNumber(payload.totalSharesOutstandingMm ?? payload.totalShares),
    parentRevenue: asNumber(payload.parentRevenue ?? payload.parentOperatingRevenue),
    parentNetProfit: asNumber(payload.parentNetProfit),
    parentOperatingCashFlow: asNumber(payload.parentOperatingCashFlow),
    parentTotalAssets: asNumber(payload.parentTotalAssets),
    parentTotalLiabilities: asNumber(payload.parentTotalLiabilities),
  };
}

const parseKlineRecord = (record: KlineRecord): {
  ts?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
} => {
  if (typeof record === "string") {
    const parts = record.split(",");
    return {
      ts: parts[0]?.trim(),
      open: asNumber(parts[1]),
      close: asNumber(parts[2]),
      high: asNumber(parts[3]),
      low: asNumber(parts[4]),
      volume: asNumber(parts[5]),
    };
  }
  return {
    ts: typeof record.date === "string" ? record.date : record.time,
    open: asNumber(record.open),
    high: asNumber(record.high),
    low: asNumber(record.low),
    close: asNumber(record.close),
    volume: asNumber(record.volume),
  };
};

export class FeedHttpProvider implements MarketDataProvider {
  constructor(private readonly options: HttpProviderOptions) {}

  private get apiBase(): string {
    const trimmed = this.options.baseUrl.replace(/\/+$/, "");
    const apiBasePath = (this.options.apiBasePath ?? "/api/v1").replace(/\/+$/, "");
    return `${trimmed}${apiBasePath}`;
  }

  private async request<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
    const url = new URL(`${this.apiBase}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value);
        }
      }
    }

    const controller = new AbortController();
    const timeoutMs = this.options.timeoutMs ?? 10_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          ...(this.options.apiKey ? { "x-api-key": this.options.apiKey } : {}),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} when requesting ${path}`);
      }
      const payload = (await response.json()) as ApiEnvelope<T> | T;
      if (payload && typeof payload === "object" && "data" in payload) {
        const wrapped = payload as ApiEnvelope<T>;
        if (wrapped.success === false) {
          throw new Error(wrapped.message || `Feed responded with success=false for ${path}`);
        }
        if (wrapped.data !== undefined) {
          return wrapped.data;
        }
      }
      return payload as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getStockListFallback(code: string): Promise<(StockDetailPayload & StockQuotePayload & { f152?: number; marketId?: number }) | undefined> {
    const payload = await this.request<StockListPayload>("/stock/list", { codes: code });
    const rows = payload.diff ?? payload.data ?? payload.list ?? [];
    return rows[0];
  }

  async getInstrument(code: string): Promise<Instrument> {
    let payload: StockDetailPayload;
    try {
      payload = await this.request<StockDetailPayload>(`/stock/detail/${encodeURIComponent(code)}`);
    } catch (error) {
      if (!isTransientFeedError(error)) throw error;
      const fallback = await this.getStockListFallback(code);
      if (!fallback) throw error;
      payload = fallback;
    }
    return {
      code: payload.code ?? payload.secucode ?? code,
      market: inferMarket(payload.code ?? payload.secucode ?? code),
      name: payload.name ?? code,
      currency: payload.currency,
      lotSize: asNumber(payload.lotSize ?? payload.lot_size),
      tickSize: asNumber(payload.tickSize ?? payload.tick_size),
      industry: payload.industry ?? payload.sector ?? payload.hybk,
    };
  }

  async getQuote(code: string): Promise<Quote> {
    // 与 `getInstrument` 同源：`/stock/indicator/realtime` 为估值/市值类字段，不含最新价。
    let payload: StockDetailPayload & StockQuotePayload & { f152?: number };
    try {
      payload = await this.request<StockDetailPayload & StockQuotePayload>(
        `/stock/detail/${encodeURIComponent(code)}`,
      );
    } catch (error) {
      if (!isTransientFeedError(error)) throw error;
      const fallback = await this.getStockListFallback(code);
      if (!fallback) throw error;
      payload = fallback;
    }
    return {
      code: payload.code ?? payload.secucode ?? code,
      price: eastmoneyScaledNumber(payload.newPrice ?? payload.price ?? payload.latestPrice, payload.f152) ?? 0,
      changePct: eastmoneyScaledNumber(payload.changeRate ?? payload.changePct, payload.f152),
      volume: asNumber(payload.volume ?? payload.amount),
      timestamp: pickTimestamp(payload.quoteTime, payload.updateTime, payload.timestamp),
    };
  }

  async getKlines(input: {
    code: string;
    period: "1m" | "5m" | "15m" | "30m" | "60m" | "day" | "week" | "month";
    from?: string;
    to?: string;
    adj?: "none" | "forward" | "backward";
  }): Promise<KlineBar[]> {
    let payload: KlinePayload;
    try {
      payload = await this.request<KlinePayload>("/stock/kline", {
        code: input.code,
        period: input.period,
        fqt: PERIOD_TO_FQT[input.adj ?? "forward"],
        from: input.from,
        to: input.to,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/socket hang up|ECONNRESET|fetch failed/i.test(message)) {
        return [];
      }
      throw error;
    }
    const records = payload.klines ?? payload.data ?? [];
    return records
      .map((record) => parseKlineRecord(record))
      .filter((record) => record.ts && record.open !== undefined && record.close !== undefined)
      .map((record) => ({
        code: payload.code ?? payload.secucode ?? input.code,
        period: input.period,
        ts: record.ts as string,
        open: record.open as number,
        high: record.high ?? (record.open as number),
        low: record.low ?? (record.close as number),
        close: record.close as number,
        volume: record.volume,
      }));
  }

  async getHistoricalPeSeries(code: string, interval: string | number = 60): Promise<HistoricalPeSeries> {
    const payload = await this.request<HistoricalPePayload>("/stock/valuation/historical-pe", {
      code,
      interval: String(interval),
    });
    const stats = payload.stats ?? {};
    return {
      code: payload.code ?? code,
      source: payload.source ?? "eniu",
      interval: payload.interval ?? interval,
      dates: payload.dates ?? payload.date ?? [],
      peTtm: (payload.peTtm ?? payload.pe_ttm ?? []).map((v) => Number(v)).filter(Number.isFinite),
      prices: (payload.prices ?? payload.price ?? []).map((v) => Number(v)).filter(Number.isFinite),
      currentPe: asNumber(payload.currentPe ?? stats.currentPe),
      percentile: asNumber(payload.percentile ?? stats.percentile),
      mean: asNumber(payload.mean ?? stats.mean),
      median: asNumber(payload.median ?? stats.median),
      p25: asNumber(payload.p25 ?? stats.p25),
      p50: asNumber(payload.p50 ?? stats.p50),
      p75: asNumber(payload.p75 ?? stats.p75),
      min: asNumber(payload.min ?? stats.min),
      minDate: payload.minDate ?? stats.minDate,
      max: asNumber(payload.max ?? stats.max),
      maxDate: payload.maxDate ?? stats.maxDate,
    };
  }

  async getFinancialSnapshot(code: string, period: string): Promise<FinancialSnapshot> {
    const trimmed = period.trim();
    const reportDate = /^\d{4}$/.test(trimmed) ? `${trimmed}-12-31` : trimmed;
    const periodLabel = fiscalYearToken(trimmed);
    const loadLegacy = async (): Promise<FinancialSnapshot> => {
      const raw = await this.request<FinancialPayload | FinancialPayload[]>(
        `/stock/indicator/financial/${encodeURIComponent(code)}`,
      );
      const payload = (Array.isArray(raw) ? raw[0] : raw) as FinancialPayload;
      return mapFinancialPayload(payload, code, periodLabel);
    };
    try {
      const wrapped = await this.request<{ snapshot?: FinancialPayload }>(
        `/stock/financial/snapshot/${encodeURIComponent(code)}?reportDate=${encodeURIComponent(reportDate)}`,
      );
      if (wrapped?.snapshot && typeof wrapped.snapshot === "object") {
        return mapFinancialPayload(wrapped.snapshot as FinancialPayload, code, periodLabel);
      }
    } catch {
      /* feed 未升级或该期无数据：回退旧简表 */
    }
    return await loadLegacy();
  }

  async getFinancialHistory(code: string, fiscalYears: string[]): Promise<FinancialSnapshot[]> {
    const yearSet = new Set(fiscalYears.map((y) => fiscalYearToken(y)).filter(Boolean));
    const span = Math.max(yearSet.size || fiscalYears.length, 5);
    const years = Math.min(15, Math.max(span + 2, 8));
    try {
      const payload = await this.request<{ items?: FinancialPayload[] }>(
        `/stock/financial/history/${encodeURIComponent(code)}?reportType=annual&years=${years}`,
      );
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (items.length === 0) throw new Error("empty financial history");
      const mapped: FinancialSnapshot[] = items.map((row) => {
        const y =
          (typeof row.period === "string" && row.period.match(/^(\d{4})/)?.[1]) ||
          (typeof row.reportDate === "string" && row.reportDate.match(/^(\d{4})/)?.[1]) ||
          "";
        return mapFinancialPayload(row, code, y || fiscalYearToken(String(row.reportDate ?? row.period ?? "")));
      });
      const filtered = mapped.filter((snap) => {
        const y = snap.period.match(/^(\d{4})/)?.[1] ?? snap.period.slice(0, 4);
        return yearSet.size === 0 || yearSet.has(y);
      });
      return filtered.length > 0 ? filtered : mapped;
    } catch {
      /* feed 未升级或限流：回退按年拉快照 */
    }
    const settled = await Promise.allSettled(
      fiscalYears.map((y) => this.getFinancialSnapshot(code, `${fiscalYearToken(y)}-12-31`)),
    );
    const out: FinancialSnapshot[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled") out.push(r.value);
    }
    return out;
  }

  async getFinancialQualityTrends(
    code: string,
    input?: { years?: number; reportType?: "annual" | "quarter" },
  ): Promise<FinancialQualityTrend[]> {
    const years = Math.min(15, Math.max(1, input?.years ?? 5));
    const reportType = input?.reportType ?? "annual";
    const [historyPayload, statementsPayload, ratioPayload] = await Promise.all([
      this.request<{ items?: FinancialPayload[] }>(
        `/stock/financial/history/${encodeURIComponent(code)}`,
        { reportType, years: String(years) },
      ).catch(() => undefined),
      this.request<FeedFinancialStatementsPayload>(
        `/stock/financial/statements/${encodeURIComponent(code)}`,
        { reportType, years: String(years) },
      ).catch(() => undefined),
      this.request<FeedFinancialRatioPayload>(
        `/stock/financial/ratio/${encodeURIComponent(code)}`,
        { reportType, years: String(years) },
      ).catch(() => undefined),
    ]);

    const historyRows = Array.isArray(historyPayload?.items) ? historyPayload.items : [];
    const snapshots = historyRows.map((row) => {
      const y =
        (typeof row.period === "string" && row.period.match(/^(\d{4})/)?.[1]) ||
        (typeof row.reportDate === "string" && row.reportDate.match(/^(\d{4})/)?.[1]) ||
        fiscalYearToken(String(row.reportDate ?? row.period ?? ""));
      return mapFinancialPayload(row, code, y);
    });
    const snapshotByYear = new Map<string, FinancialSnapshot>();
    for (const snapshot of snapshots) {
      const y = fiscalYearToken(snapshot.period);
      if (y) snapshotByYear.set(y, snapshot);
    }

    const incomeByYear = new Map<string, Record<string, unknown>>();
    const balanceByYear = new Map<string, Record<string, unknown>>();
    for (const row of statementsPayload?.income ?? []) {
      const y = yearFromReportDate(row.reportDate);
      if (y) incomeByYear.set(y, { ...(row.camel ?? {}), ...(row.raw ?? {}) });
    }
    for (const row of statementsPayload?.balance ?? []) {
      const y = yearFromReportDate(row.reportDate);
      if (y) balanceByYear.set(y, { ...(row.camel ?? {}), ...(row.raw ?? {}) });
    }

    const ratioByYear = new Map<string, FeedFinancialRatioItem>();
    for (const item of ratioPayload?.items ?? []) {
      const y = yearFromReportDate(item.reportDate);
      if (y) ratioByYear.set(y, item);
    }

    const yearSet = new Set<string>([
      ...snapshotByYear.keys(),
      ...incomeByYear.keys(),
      ...balanceByYear.keys(),
      ...ratioByYear.keys(),
    ]);
    const sortedYears = [...yearSet].filter((y) => /^20\d{2}$/.test(y)).sort((a, b) => b.localeCompare(a)).slice(0, years);

    const trends: FinancialQualityTrend[] = [];
    for (let i = 0; i < sortedYears.length; i += 1) {
      const y = sortedYears[i] as string;
      const prevY = sortedYears[i + 1];
      const s = snapshotByYear.get(y);
      const prev = prevY ? snapshotByYear.get(prevY) : undefined;
      const income = incomeByYear.get(y);
      const balance = balanceByYear.get(y);
      const prevBalance = prevY ? balanceByYear.get(prevY) : undefined;
      const ratio = ratioByYear.get(y);
      const ratioPctRow = ratio?.percentOfRevenue;
      const ratioAbs = ratio?.absolute;

      const revenue = s?.revenue ?? yuanToBaiWanMaybe(firstNumber(income, ["totalOperateIncome", "TOTAL_OPERATE_INCOME", "totalRevenue"]));
      const operatingCost = yuanToBaiWanMaybe(firstNumber(income, ["operateCost", "operatingCost", "totalOperateCost", "OPERATE_COST", "TOTAL_OPERATE_COST"]));
      const netProfit = s?.netProfit ?? yuanToBaiWanMaybe(firstNumber(income, ["netprofit", "netProfit", "NETPROFIT"]));
      const ocf = s?.operatingCashFlow;
      const capex = s?.capitalExpenditure;
      const freeCashFlow = ocf !== undefined && capex !== undefined ? ocf - Math.abs(capex) : undefined;
      const ar = s?.accountsReceivable ?? yuanToBaiWanMaybe(firstNumber(balance, ["accountsRece", "accountsReceivable", "ACCOUNTS_RECE", "ACCOUNTS_RECEIVABLE"]));
      const inventory = yuanToBaiWanMaybe(firstNumber(balance, ["inventory", "inventories", "INVENTORY"]));
      const ap = yuanToBaiWanMaybe(firstNumber(balance, ["accountsPayable", "ACCOUNTS_PAYABLE", "acctPayable"]));
      const prevAr = prev?.accountsReceivable;
      const prevInventory = yuanToBaiWanMaybe(firstNumber(prevBalance, ["inventory", "inventories", "INVENTORY"]));
      const prevAp = yuanToBaiWanMaybe(firstNumber(prevBalance, ["accountsPayable", "ACCOUNTS_PAYABLE", "acctPayable"]));
      const avgAr = avg(ar, prevAr);
      const avgInv = avg(inventory, prevInventory);
      const avgAp = avg(ap, prevAp);
      const warnings: string[] = [];

      const salesExpenseRatioPct = expenseRatioPct(
        firstNumber(ratioPctRow, ["saleExpense", "salesExpense", "SELL_EXPENSE", "SALE_EXPENSE"]) ??
          ratioPct(
            yuanToBaiWanMaybe(firstNumber(income, ["saleExpense", "salesExpense", "SELL_EXPENSE", "SALE_EXPENSE"])),
            revenue,
          ),
      );
      const adminExpenseRatioPct = expenseRatioPct(
        firstNumber(ratioPctRow, ["manageExpense", "adminExpense", "MANAGE_EXPENSE"]) ??
          ratioPct(yuanToBaiWanMaybe(firstNumber(income, ["manageExpense", "adminExpense", "MANAGE_EXPENSE"])), revenue),
      );
      const rdExpenseRatioPct = expenseRatioPct(
        firstNumber(ratioPctRow, ["researchExpense", "rdExpense", "RESEARCH_EXPENSE"]) ??
          ratioPct(yuanToBaiWanMaybe(firstNumber(income, ["researchExpense", "rdExpense", "RESEARCH_EXPENSE"])), revenue),
      );
      const financialExpenseRatioPct =
        firstNumber(ratioPctRow, ["financeExpense", "financialExpense", "FINANCE_EXPENSE"]) ??
        ratioPct(yuanToBaiWanMaybe(firstNumber(income, ["financeExpense", "financialExpense", "FINANCE_EXPENSE"])), revenue);

      if (salesExpenseRatioPct === undefined && adminExpenseRatioPct === undefined) warnings.push("expense_ratio_unavailable");
      if (inventory === undefined) warnings.push("inventory_unavailable");
      if (ap === undefined) warnings.push("accounts_payable_unavailable");

      trends.push({
        year: y,
        reportDate: ratio?.reportDate ?? `${y}-12-31`,
        source: "feed_financial_history+statements+ratio",
        revenue,
        operatingCost,
        netProfit,
        operatingCashFlow: ocf,
        capitalExpenditure: capex,
        freeCashFlow,
        grossMarginPct: s?.grossMarginPct ?? firstNumber(ratioPctRow, ["grossMargin", "saleGpr", "XSMLL"]),
        salesExpenseRatioPct,
        adminExpenseRatioPct,
        rdExpenseRatioPct,
        financialExpenseRatioPct,
        accountsReceivable: ar,
        inventory,
        accountsPayable: ap,
        impairmentLoss:
          s?.creditImpairmentLoss ??
          yuanToBaiWanMaybe(firstNumber(ratioAbs, ["creditImpairmentLoss", "assetImpairmentLoss", "CREDIT_IMPAIRMENT_LOSS", "ASSET_IMPAIRMENT_LOSS"])),
        accountsReceivableDays: revenue && avgAr !== undefined ? (avgAr / revenue) * 365 : undefined,
        inventoryDays: operatingCost && avgInv !== undefined ? (avgInv / operatingCost) * 365 : undefined,
        accountsPayableDays: operatingCost && avgAp !== undefined ? (avgAp / operatingCost) * 365 : undefined,
        cashConversionCycleDays:
          revenue && operatingCost && avgAr !== undefined && avgInv !== undefined && avgAp !== undefined
            ? (avgAr / revenue) * 365 + (avgInv / operatingCost) * 365 - (avgAp / operatingCost) * 365
            : undefined,
        ocfToNetProfit: divide(ocf, netProfit),
        fcfMarginPct: ratioPct(freeCashFlow, revenue),
        warnings,
      });
    }

    return trends;
  }

  async getCorporateActions(
    code: string,
    from?: string,
    to?: string,
  ): Promise<CorporateAction[]> {
    const payload = await this.request<
      Array<{
        code?: string;
        actionType?: CorporateAction["actionType"];
        exDate?: string;
        recordDate?: string;
        cashDividendPerShare?: number;
        splitRatio?: number;
      }>
    >("/stock/corporate-actions", { code, from, to });
    return (payload ?? []).map((item) => ({
      code: item.code ?? code,
      actionType: item.actionType ?? "other",
      exDate: item.exDate,
      recordDate: item.recordDate,
      cashDividendPerShare: asNumber(item.cashDividendPerShare),
      splitRatio: asNumber(item.splitRatio),
    }));
  }

  async getTradingCalendar(
    market: Market,
    from: string,
    to: string,
  ): Promise<TradingCalendar[]> {
    const payload = await this.request<
      Array<{
        market?: Market;
        date?: string;
        isTradingDay?: boolean;
        sessionType?: TradingCalendar["sessionType"];
      }>
    >("/market/trading-calendar", { market, from, to });
    return (payload ?? []).map((item) => ({
      market: item.market ?? market,
      date: item.date ?? "",
      isTradingDay: Boolean(item.isTradingDay),
      sessionType: item.sessionType ?? (item.isTradingDay ? "full" : "closed"),
    }));
  }

  async getIndustryCycleSnapshot(code: string, year?: string): Promise<IndustryCycleSnapshot> {
    const payload = await this.request<FeedIndustryCyclePayload>(
      `/stock/industry/cycle/${encodeURIComponent(code)}`,
      { year },
    );
    return {
      industryName: payload.industryName ?? "未知行业",
      classification: payload.source ?? "feed_industry_cycle",
      cyclicality: toCyclicality(payload.cyclicality),
      position: toCyclePosition(payload.position),
      confidence: toConfidence(payload.confidence),
      signals: [
        {
          indicator: "sample_size_current",
          summary: String(payload.metrics?.sampleSizeCurrent ?? "—"),
        },
        {
          indicator: "revenue_all_year_yoy",
          summary: String(payload.metrics?.revenueAllYearYoY ?? "—"),
        },
        {
          indicator: "parent_ni_all_year_yoy",
          summary: String(payload.metrics?.parentNiAllYearYoY ?? "—"),
        },
      ],
    };
  }

  async getSwIndustryClassification(code: string): Promise<SwIndustryClassification> {
    const payload = await this.request<SwIndustryClassificationPayload>(
      `/stock/industry/sw-classification/${encodeURIComponent(code)}`,
    );
    return {
      code: payload.code ?? code,
      name: payload.name,
      provider: "sw",
      version: "2021",
      asOfDate: payload.asOfDate,
      source: payload.source,
      confidence: payload.confidence,
      industryCode: payload.industryCode,
      level1Code: payload.level1Code,
      level1Name: payload.level1Name,
      level2Code: payload.level2Code,
      level2Name: payload.level2Name,
      level3Code: payload.level3Code,
      level3Name: payload.level3Name,
    };
  }

  async getPeerComparablePool(
    code: string,
    input?: { year?: string; topN?: number; sortColumn?: string },
  ): Promise<PeerComparableCollection> {
    const payload = await this.request<FeedPeerPoolPayload>(`/stock/peers/${encodeURIComponent(code)}`, {
      year: input?.year,
      topN: input?.topN !== undefined ? String(input.topN) : undefined,
      sortColumn: input?.sortColumn,
    });
    const peers = Array.isArray(payload.peers) ? payload.peers : [];
    return {
      source: payload.source ?? "feed_peer_pool",
      industryName: payload.industryName ?? "未知行业",
      peerCodes: peers.map((p) => p.code).filter((c): c is string => Boolean(c)),
      sortColumn: payload.sortColumn,
      peers: peers
        .filter((p) => p.code)
        .map((p) => ({
          code: p.code as string,
          name: p.name,
          industryName: p.industryName,
          year: p.year !== undefined ? String(p.year) : undefined,
          revenueAllYear: asNumber(p.revenueAllYear),
          parentNiAllYear: asNumber(p.parentNiAllYear),
          parentNi3Q: asNumber(p.parentNi3Q),
          marketCap1Q: asNumber(p.marketCap1Q),
          marketCap4Q: asNumber(p.marketCap4Q),
        })),
      note:
        peers.length > 0
          ? `feed 同业池返回 ${peers.length} 条样本`
          : "feed 同业池暂未返回样本，需降级到文本兜底。",
    };
  }

  async getGovernanceEvents(
    code: string,
    input?: {
      year?: string;
      limit?: number;
      timeRange?: "3m" | "6m" | "1y" | "3y" | "5y";
      dedupe?: boolean;
      dropPlaceholders?: boolean;
      preferSeverity?: boolean;
      source?: "aggregate" | "cninfo" | "sse";
      startDate?: string;
      endDate?: string;
      sseExtType?: "1" | "2" | "3" | "inquiry" | "periodic_inquiry" | "reorg_review" | "all";
      sseBoardType?: "0" | "4" | "main" | "star" | "all";
      stockName?: string;
    },
  ): Promise<GovernanceEventCollection> {
    const payload = await this.request<FeedGovernanceEventsPayload>(
      `/stock/governance/events/${encodeURIComponent(code)}`,
      {
        year: input?.year,
        limit: input?.limit !== undefined ? String(input.limit) : undefined,
        timeRange: input?.timeRange,
        dedupe: input?.dedupe !== undefined ? String(input.dedupe) : undefined,
        dropPlaceholders:
          input?.dropPlaceholders !== undefined ? String(input.dropPlaceholders) : undefined,
        preferSeverity:
          input?.preferSeverity !== undefined ? String(input.preferSeverity) : undefined,
        source: input?.source,
        startDate: input?.startDate,
        endDate: input?.endDate,
        sseExtType: input?.sseExtType,
        sseBoardType: input?.sseBoardType,
        stockName: input?.stockName,
      },
    );
    const events = (payload.events ?? []).map<GovernanceNegativeEvent>((e) => ({
      category: e.category === "regulatory" ? "regulatory" : "governance_negative",
      summary: e.summary ?? e.title ?? "（无摘要）",
      severity: toGovSeverity(e.severity),
      happenedAt: e.happenedAt ?? e.eventDate ?? e.publishedAt,
      evidenceUrl: e.url,
      sourceLabel: e.sourceOrg ?? payload.source ?? "feed_governance",
    }));
    return {
      source: payload.source ?? "feed_governance",
      events,
      highSeverityCount:
        payload.highSeverityCount ??
        events.filter((event) => event.severity === "high").length,
    };
  }

  async getRegulatoryEvents(
    code: string,
    input?: {
      source?: "aggregate" | "cninfo" | "sse" | "szse" | "bse";
      exchange?: "auto" | "sse" | "szse" | "bse" | "all";
      eventKinds?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
      keyword?: string;
      stockName?: string;
    },
  ): Promise<RegulatoryEventCollection> {
    const payload = await this.request<FeedRegulatoryEventsPayload>("/stock/regulatory/events", {
      code,
      source: input?.source,
      exchange: input?.exchange,
      eventKinds: input?.eventKinds,
      startDate: input?.startDate,
      endDate: input?.endDate,
      page: input?.page !== undefined ? String(input.page) : undefined,
      limit: input?.limit !== undefined ? String(input.limit) : undefined,
      keyword: input?.keyword,
      stockName: input?.stockName,
    });
    return {
      source: payload.source ?? input?.source ?? "aggregate",
      exchange: payload.exchange ?? input?.exchange ?? "auto",
      eventKinds: Array.isArray(payload.eventKinds)
        ? payload.eventKinds
        : (input?.eventKinds?.split(",").map((item) => item.trim()).filter(Boolean) ?? []),
      total: payload.total ?? payload.events?.length ?? 0,
      events: Array.isArray(payload.events) ? payload.events : [],
      sources: payload.sources,
    };
  }

  async getOperationsInsight(
    code: string,
    input?: {
      year?: string;
      reportDate?: string;
      governanceLimit?: number;
      forecastPageSize?: number;
      timeRange?: "3m" | "6m" | "1y" | "3y" | "5y";
    },
  ): Promise<OperationsInsightSnapshot> {
    const payload = await this.request<FeedOperationsInsightPayload>(
      `/stock/topic/operations-insight/${encodeURIComponent(code)}`,
      {
        year: input?.year,
        reportDate: input?.reportDate,
        governanceLimit:
          input?.governanceLimit !== undefined ? String(input.governanceLimit) : undefined,
        forecastPageSize:
          input?.forecastPageSize !== undefined ? String(input.forecastPageSize) : undefined,
        timeRange: input?.timeRange,
      },
    );
    const governanceEvents = (payload.data?.governanceTimeline ?? []).map<GovernanceNegativeEvent>((e) => ({
      category: e.category === "regulatory" ? "regulatory" : "governance_negative",
      summary: e.summary ?? e.title ?? "（无摘要）",
      severity: toGovSeverity(e.severity),
      happenedAt: e.happenedAt ?? e.eventDate ?? e.publishedAt,
      evidenceUrl: e.url,
      sourceLabel: e.sourceOrg ?? payload.source ?? "feed_operations_insight",
    }));
    return {
      source: payload.source ?? "feed_operations_insight",
      status: payload.status === "degraded" ? "degraded" : "pass",
      missingFields: Array.isArray(payload.missingFields) ? payload.missingFields : [],
      degradeReasons: Array.isArray(payload.degradeReasons) ? payload.degradeReasons : [],
      industryCycle: payload.data?.industryCycle
        ? {
            industryName: payload.data.industryCycle.industryName ?? "未知行业",
            classification: payload.data.industryCycle.source ?? "feed_industry_cycle",
            cyclicality: toCyclicality(payload.data.industryCycle.cyclicality),
            position: toCyclePosition(payload.data.industryCycle.position),
            confidence: toConfidence(payload.data.industryCycle.confidence),
            signals: [
              {
                indicator: "sample_size_current",
                summary: String(payload.data.industryCycle.metrics?.sampleSizeCurrent ?? "—"),
              },
              {
                indicator: "revenue_all_year_yoy",
                summary: String(payload.data.industryCycle.metrics?.revenueAllYearYoY ?? "—"),
              },
              {
                indicator: "parent_ni_all_year_yoy",
                summary: String(payload.data.industryCycle.metrics?.parentNiAllYearYoY ?? "—"),
              },
            ],
          }
        : undefined,
      governanceEvents: {
        source: payload.source ?? "feed_operations_insight",
        events: governanceEvents,
        highSeverityCount: governanceEvents.filter((event) => event.severity === "high").length,
      },
      earningsGuidance: payload.data?.earningsGuidance ?? [],
      businessHighlights: payload.data?.businessHighlights ?? [],
      themeSignals: payload.data?.themeSignals ?? [],
      companyOperations: payload.data?.companyOperations
        ? this.normalizeCompanyOperations(payload.data.companyOperations)
        : undefined,
    };
  }

  async getCompanyOperations(
    code: string,
    input?: { year?: string; topN?: number },
  ): Promise<CompanyOperationsSnapshot> {
    const payload = await this.request<FeedCompanyOperationsPayload>(
      `/stock/company/operations/${encodeURIComponent(code)}`,
      {
        year: input?.year,
        topN: input?.topN !== undefined ? String(input.topN) : undefined,
      },
    );
    return this.normalizeCompanyOperations(payload);
  }

  private normalizeCompanyOperations(payload: FeedCompanyOperationsPayload): CompanyOperationsSnapshot {
    return {
      source: payload.source ?? "eastmoney_f10_company_operations_v1",
      status: payload.status === "pass" ? "pass" : "degraded",
      missingFields: Array.isArray(payload.missingFields) ? payload.missingFields : [],
      degradeReasons: Array.isArray(payload.degradeReasons) ? payload.degradeReasons : [],
      businessHighlights: Array.isArray(payload.businessHighlights) ? payload.businessHighlights : [],
      themeSignals: Array.isArray(payload.themeSignals) ? payload.themeSignals : [],
      industryInfo: payload.industryInfo,
      boardInfo: payload.boardInfo,
      peerComparablePool: payload.peerComparablePool,
      signals: Array.isArray(payload.signals) ? payload.signals : [],
      signalGroups: payload.signalGroups,
    };
  }

  getConfig(): HttpProviderOptions {
    return this.options;
  }
}
