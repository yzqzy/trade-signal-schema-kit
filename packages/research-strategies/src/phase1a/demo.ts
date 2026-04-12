import type { CorporateAction, FinancialSnapshot, Instrument, KlineBar, MarketDataProvider, Quote, TradingCalendar } from "@trade-signal/schema-core";

import { collectPhase1ADataPack } from "./collector.js";

class MockMarketDataProvider implements MarketDataProvider {
  async getInstrument(code: string): Promise<Instrument> {
    return {
      code,
      market: "CN_A",
      name: "Mock Instrument",
      currency: "CNY",
    };
  }

  async getQuote(code: string): Promise<Quote> {
    return {
      code,
      price: 100,
      changePct: 1.2,
      volume: 10_000,
      timestamp: new Date().toISOString(),
    };
  }

  async getKlines(input: {
    code: string;
    period: "1m" | "5m" | "15m" | "30m" | "60m" | "day" | "week" | "month";
    from?: string;
    to?: string;
    adj?: "none" | "forward" | "backward";
  }): Promise<KlineBar[]> {
    return [
      {
        code: input.code,
        period: input.period,
        ts: input.to ?? new Date().toISOString(),
        open: 98,
        high: 101,
        low: 97,
        close: 100,
        volume: 9_800,
      },
    ];
  }

  async getFinancialSnapshot(code: string, period: string): Promise<FinancialSnapshot> {
    return {
      code,
      period,
      revenue: 1_000_000,
      netProfit: 250_000,
      operatingCashFlow: 200_000,
      totalAssets: 10_000_000,
      totalLiabilities: 4_000_000,
    };
  }

  async getCorporateActions(
    code: string,
    _from?: string,
    _to?: string,
  ): Promise<CorporateAction[]> {
    return [
      {
        code,
        actionType: "dividend",
        exDate: "2024-07-01",
        cashDividendPerShare: 1.5,
      },
    ];
  }

  async getTradingCalendar(
    market: "CN_A" | "HK",
    from: string,
    _to: string,
  ): Promise<TradingCalendar[]> {
    return [
      {
        market,
        date: from || "2024-01-01",
        isTradingDay: true,
        sessionType: "full",
      },
    ];
  }
}

async function main(): Promise<void> {
  const provider = new MockMarketDataProvider();
  const dataPack = await collectPhase1ADataPack(provider, {
    code: "SH600519",
    period: "day",
    from: "2024-01-01",
    to: "2024-12-31",
  });
  console.log(JSON.stringify(dataPack, null, 2));
}

void main();
