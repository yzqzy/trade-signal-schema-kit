import type {
  CorporateAction,
  FinancialSnapshot,
  Instrument,
  KlineBar,
  Market,
  MarketDataProvider,
  Quote,
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

  async getInstrument(code: string): Promise<Instrument> {
    const payload = await this.request<StockDetailPayload>(`/stock/detail/${encodeURIComponent(code)}`);
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
    const payload = await this.request<StockQuotePayload>(
      `/stock/indicator/realtime/${encodeURIComponent(code)}`,
    );
    return {
      code: payload.code ?? payload.secucode ?? code,
      price: asNumber(payload.newPrice ?? payload.price ?? payload.latestPrice) ?? 0,
      changePct: asNumber(payload.changeRate ?? payload.changePct),
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
    const payload = await this.request<KlinePayload>("/stock/kline", {
      code: input.code,
      period: input.period,
      fqt: PERIOD_TO_FQT[input.adj ?? "forward"],
      from: input.from,
      to: input.to,
    });
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

  getConfig(): HttpProviderOptions {
    return this.options;
  }
}
