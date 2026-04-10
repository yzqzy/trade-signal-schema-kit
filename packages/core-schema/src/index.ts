export type Market = "CN_A" | "HK";
export type KlinePeriod =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "60m"
  | "day"
  | "week"
  | "month";

export interface Instrument {
  code: string;
  market: Market;
  name: string;
  currency?: string;
  lotSize?: number;
  tickSize?: number;
}

export interface Quote {
  code: string;
  price: number;
  changePct?: number;
  volume?: number;
  timestamp: string;
}

export interface KlineBar {
  code: string;
  period: KlinePeriod;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface FinancialSnapshot {
  code: string;
  period: string;
  revenue?: number;
  netProfit?: number;
  operatingCashFlow?: number;
  totalAssets?: number;
  totalLiabilities?: number;
}

export interface CorporateAction {
  code: string;
  actionType: "dividend" | "split" | "rightsIssue" | "bonusShare" | "other";
  exDate?: string;
  recordDate?: string;
  cashDividendPerShare?: number;
  splitRatio?: number;
}

export interface TradingCalendar {
  market: Market;
  date: string;
  isTradingDay: boolean;
  sessionType?: "full" | "half" | "closed";
}

export interface NewsItem {
  id: string;
  title: string;
  publishedAt: string;
  summary?: string;
}

export interface MarketDataProvider {
  getInstrument(code: string): Promise<Instrument>;
  getQuote(code: string): Promise<Quote>;
  getKlines(input: {
    code: string;
    period: KlinePeriod;
    from?: string;
    to?: string;
    adj?: "none" | "forward" | "backward";
  }): Promise<KlineBar[]>;
  getFinancialSnapshot(code: string, period: string): Promise<FinancialSnapshot>;
  getCorporateActions(code: string, from?: string, to?: string): Promise<CorporateAction[]>;
  getTradingCalendar(market: Market, from: string, to: string): Promise<TradingCalendar[]>;
}
