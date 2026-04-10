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
}

export class FeedHttpProvider implements MarketDataProvider {
  constructor(private readonly options: HttpProviderOptions) {}

  async getInstrument(_code: string): Promise<Instrument> {
    throw new Error("Not implemented: map feed HTTP response to Instrument");
  }

  async getQuote(_code: string): Promise<Quote> {
    throw new Error("Not implemented: map feed HTTP response to Quote");
  }

  async getKlines(_input: {
    code: string;
    period: "1m" | "5m" | "15m" | "30m" | "60m" | "day" | "week" | "month";
    from?: string;
    to?: string;
    adj?: "none" | "forward" | "backward";
  }): Promise<KlineBar[]> {
    throw new Error("Not implemented: map feed HTTP response to KlineBar[]");
  }

  async getFinancialSnapshot(_code: string, _period: string): Promise<FinancialSnapshot> {
    throw new Error("Not implemented: map feed HTTP response to FinancialSnapshot");
  }

  async getCorporateActions(
    _code: string,
    _from?: string,
    _to?: string,
  ): Promise<CorporateAction[]> {
    throw new Error("Not implemented: map feed HTTP response to CorporateAction[]");
  }

  async getTradingCalendar(
    _market: Market,
    _from: string,
    _to: string,
  ): Promise<TradingCalendar[]> {
    throw new Error("Not implemented: map feed HTTP response to TradingCalendar[]");
  }

  getConfig(): HttpProviderOptions {
    return this.options;
  }
}
