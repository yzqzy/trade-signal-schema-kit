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

export type McpToolCaller = (toolName: string, args: Record<string, unknown>) => Promise<unknown>;

export interface McpProviderOptions {
  serverName: string;
  transport?: "stdio" | "http";
  endpoint?: string;
  apiKey?: string;
  callTool: McpToolCaller;
}

export function createFeedMcpProviderFromEnv(
  callTool: McpToolCaller,
  overrides: Partial<Omit<McpProviderOptions, "callTool">> = {},
): FeedMcpProvider {
  const serverName = overrides.serverName ?? "trade-signal-feed";
  return new FeedMcpProvider({
    serverName,
    transport: overrides.transport,
    endpoint: overrides.endpoint ?? process.env.FEED_MCP_URL,
    apiKey: overrides.apiKey ?? process.env.FEED_API_KEY,
    callTool,
  });
}

type StockInfoPayload = {
  detail?: StockInfoDetail;
  code?: string;
  secucode?: string;
  name?: string;
};

type StockInfoDetail = {
  code?: string;
  secucode?: string;
  name?: string;
  currency?: string;
  lotSize?: number;
  lot_size?: number;
  tickSize?: number;
  tick_size?: number;
  industry?: string;
  sector?: string;
  hybk?: string;
};

type StockQuotePayload = {
  code?: string;
  secucode?: string;
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

type StockKlinePayload = {
  code?: string;
  secucode?: string;
  klines?: Array<string | { date?: string; time?: string; open?: number; high?: number; low?: number; close?: number; volume?: number }>;
  data?: Array<string | { date?: string; time?: string; open?: number; high?: number; low?: number; close?: number; volume?: number }>;
};

type StockFinancialPayload = {
  financial?: {
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
    parentRevenue?: number;
    parentOperatingRevenue?: number;
    parentOperatingCashFlow?: number;
    parentTotalAssets?: number;
    parentTotalLiabilities?: number;
  };
};

function fiscalYearToken(input: string): string {
  const m = input.match(/(20\d{2})/);
  return (m?.[1] ?? input.slice(0, 4)).trim();
}

function mapMcpFinancial(
  financial: NonNullable<StockFinancialPayload["financial"]>,
  code: string,
  period: string,
): FinancialSnapshot {
  return {
    code: financial.code ?? financial.secucode ?? code,
    period: financial.period ?? financial.reportDate ?? period,
    revenue: asNumber(financial.revenue ?? financial.operatingRevenue ?? financial.totalRevenue),
    netProfit: asNumber(financial.netProfit ?? financial.parentNetProfit),
    operatingCashFlow: asNumber(financial.operatingCashFlow ?? financial.netCashflowOper),
    totalAssets: asNumber(financial.totalAssets),
    totalLiabilities: asNumber(financial.totalLiabilities),
    capitalExpenditure: asNumber(financial.capex ?? financial.capitalExpenditure),
    interestBearingDebt: asNumber(financial.interestBearingDebt ?? financial.interestDebt),
    cashAndEquivalents: asNumber(
      financial.monetaryFunds ?? financial.cash ?? financial.cashAndEquivalents,
    ),
    minorityInterestPnL: asNumber(
      financial.minorityInterestPnL ?? financial.minorityPnL ?? financial.minorityInterest,
    ),
    earningsPerShare: asNumber(financial.earningsPerShare ?? financial.basicEps ?? financial.eps),
    dividendsPerShare: asNumber(
      financial.dividendsPerShare ?? financial.dps ?? financial.dividendPerShare,
    ),
    marketCapBaiWan: asNumber(financial.marketCapBaiWan ?? financial.totalMv ?? financial.marketCap),
    totalSharesOutstandingMm: asNumber(financial.totalSharesOutstandingMm ?? financial.totalShares),
    parentRevenue: asNumber(financial.parentRevenue ?? financial.parentOperatingRevenue),
    parentNetProfit: asNumber(financial.parentNetProfit),
    parentOperatingCashFlow: asNumber(financial.parentOperatingCashFlow),
    parentTotalAssets: asNumber(financial.parentTotalAssets),
    parentTotalLiabilities: asNumber(financial.parentTotalLiabilities),
  };
}

const ADJ_TO_FQT: Record<"none" | "forward" | "backward", "none" | "pre" | "after"> = {
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

const parseKline = (
  item:
    | string
    | { date?: string; time?: string; open?: number; high?: number; low?: number; close?: number; volume?: number },
) => {
  if (typeof item === "string") {
    const parts = item.split(",");
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
    ts: typeof item.date === "string" ? item.date : item.time,
    open: asNumber(item.open),
    close: asNumber(item.close),
    high: asNumber(item.high),
    low: asNumber(item.low),
    volume: asNumber(item.volume),
  };
};

export class FeedMcpProvider implements MarketDataProvider {
  constructor(private readonly options: McpProviderOptions) {}

  private async callTool<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
    return (await this.options.callTool(toolName, args)) as T;
  }

  async getInstrument(code: string): Promise<Instrument> {
    const payload = await this.callTool<StockInfoPayload>("get_stock_info", {
      code,
      include: "detail",
    });
    const detail: StockInfoDetail = payload.detail ?? {
      code: payload.code,
      secucode: payload.secucode,
      name: payload.name,
    };
    return {
      code: detail.code ?? detail.secucode ?? code,
      market: inferMarket(detail.code ?? detail.secucode ?? code),
      name: detail.name ?? code,
      currency: detail.currency,
      lotSize: asNumber(detail.lotSize ?? detail.lot_size),
      tickSize: asNumber(detail.tickSize ?? detail.tick_size),
      industry: detail.industry ?? detail.sector ?? detail.hybk,
    };
  }

  async getQuote(code: string): Promise<Quote> {
    const payload = await this.callTool<StockQuotePayload>("get_stock_quote", { code });
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
    const payload = await this.callTool<StockKlinePayload>("get_stock_kline", {
      code: input.code,
      period: input.period,
      fqt: ADJ_TO_FQT[input.adj ?? "forward"],
      from: input.from,
      to: input.to,
    });
    const records = payload.klines ?? payload.data ?? [];
    return records
      .map(parseKline)
      .filter((kline) => kline.ts && kline.open !== undefined && kline.close !== undefined)
      .map((kline) => ({
        code: payload.code ?? payload.secucode ?? input.code,
        period: input.period,
        ts: kline.ts as string,
        open: kline.open as number,
        high: kline.high ?? (kline.open as number),
        low: kline.low ?? (kline.close as number),
        close: kline.close as number,
        volume: kline.volume,
      }));
  }

  async getFinancialSnapshot(code: string, period: string): Promise<FinancialSnapshot> {
    const trimmed = period.trim();
    const reportDateArg = /^\d{4}$/.test(trimmed) ? `${trimmed}-12-31` : trimmed;
    const periodLabel = fiscalYearToken(trimmed);
    try {
      const payload = await this.callTool<{ snapshot?: Record<string, unknown> }>(
        "get_stock_financial_snapshot",
        { code, reportDate: reportDateArg },
      );
      if (payload?.snapshot && typeof payload.snapshot === "object") {
        return mapMcpFinancial(
          payload.snapshot as NonNullable<StockFinancialPayload["financial"]>,
          code,
          periodLabel,
        );
      }
    } catch {
      /* MCP 未注册 snapshot 工具或 feed 未升级 */
    }
    const payload = await this.callTool<StockFinancialPayload>("get_stock_financial", { code });
    let financial: unknown = payload.financial ?? {};
    if (Array.isArray(financial)) financial = financial[0] ?? {};
    return mapMcpFinancial(financial as NonNullable<StockFinancialPayload["financial"]>, code, periodLabel);
  }

  async getFinancialHistory(code: string, fiscalYears: string[]): Promise<FinancialSnapshot[]> {
    const yearSet = new Set(fiscalYears.map((y) => fiscalYearToken(y)).filter(Boolean));
    const span = Math.max(yearSet.size || fiscalYears.length, 5);
    const years = Math.min(15, Math.max(span + 2, 8));
    try {
      const payload = await this.callTool<{ items?: Record<string, unknown>[] }>(
        "get_stock_financial_history",
        { code, years, reportType: "annual" },
      );
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (items.length === 0) throw new Error("empty financial history");
      const mapped = items.map((row) =>
        mapMcpFinancial(
          (row ?? {}) as NonNullable<StockFinancialPayload["financial"]>,
          code,
          fiscalYearToken(String((row as { reportDate?: string; period?: string }).reportDate ?? (row as { period?: string }).period ?? "")),
        ),
      );
      const filtered = mapped.filter((snap) => {
        const y = snap.period.match(/^(\d{4})/)?.[1] ?? snap.period.slice(0, 4);
        return yearSet.size === 0 || yearSet.has(y);
      });
      return filtered.length > 0 ? filtered : mapped;
    } catch {
      /* MCP 工具未注册或 feed 未升级：回退 */
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
    const payload = await this.callTool<
      Array<{
        code?: string;
        actionType?: CorporateAction["actionType"];
        exDate?: string;
        recordDate?: string;
        cashDividendPerShare?: number;
        splitRatio?: number;
      }>
    >("get_stock_corporate_actions", { code, from, to });
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
    const payload = await this.callTool<
      Array<{
        market?: TradingCalendar["market"];
        date?: string;
        isTradingDay?: boolean;
        sessionType?: TradingCalendar["sessionType"];
      }>
    >("get_trading_calendar", { market, from, to });
    return (payload ?? []).map((item) => ({
      market: item.market ?? market,
      date: item.date ?? "",
      isTradingDay: Boolean(item.isTradingDay),
      sessionType: item.sessionType ?? (item.isTradingDay ? "full" : "closed"),
    }));
  }

  getConfig(): McpProviderOptions {
    return this.options;
  }
}
