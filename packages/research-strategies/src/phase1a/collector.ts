import type { DataPackMarket, KlinePeriod, Market, MarketDataProvider } from "@trade-signal/schema-core";

import { loadFinancialHistory, normalizeFinancialHistory } from "./financial-history.js";

export interface CollectPhase1AInput {
  code: string;
  period?: KlinePeriod;
  from?: string;
  to?: string;
  adj?: "none" | "forward" | "backward";
  includeFinancialSnapshot?: boolean;
  /** A股默认 true：尝试填充 `financialHistory` 供市场包多年列真实回填 */
  includeFinancialHistory?: boolean;
  includeCorporateActions?: boolean;
  includeTradingCalendar?: boolean;
  financialPeriod?: string;
  calendarMarket?: Market;
  optionalFailure?: "ignore" | "throw";
}

const DEFAULT_PERIOD: KlinePeriod = "day";

function anchorFiscalYearFromSnapshot(fallback: number, fin?: { period?: string } | null): number {
  const m = fin?.period?.match(/20\d{2}/)?.[0];
  if (m) return Number(m);
  return fallback;
}

async function loadOptional<T>(
  enabled: boolean,
  optionalFailure: "ignore" | "throw",
  task: () => Promise<T>,
): Promise<T | undefined> {
  if (!enabled) return undefined;
  try {
    return await task();
  } catch (error) {
    if (optionalFailure === "throw") throw error;
    return undefined;
  }
}

export async function collectPhase1ADataPack(
  provider: MarketDataProvider,
  input: CollectPhase1AInput,
): Promise<DataPackMarket> {
  const period = input.period ?? DEFAULT_PERIOD;
  const defaultDate = new Date().toISOString().slice(0, 10);
  const from = input.from ?? defaultDate;
  const to = input.to ?? defaultDate;

  const [instrument, quote, klines] = await Promise.all([
    provider.getInstrument(input.code),
    provider.getQuote(input.code),
    provider.getKlines({
      code: input.code,
      period,
      from,
      to,
      adj: input.adj,
    }),
  ]);

  const optionalFailure = input.optionalFailure ?? "ignore";
  const includeFinancialSnapshot = input.includeFinancialSnapshot ?? true;
  const includeFinancialHistory = input.includeFinancialHistory ?? instrument.market === "CN_A";
  const includeCorporateActions = input.includeCorporateActions ?? true;
  const includeTradingCalendar = input.includeTradingCalendar ?? true;

  const [financialSnapshot, corporateActions, tradingCalendar] = await Promise.all([
    loadOptional(includeFinancialSnapshot, optionalFailure, () =>
      provider.getFinancialSnapshot(input.code, input.financialPeriod ?? to),
    ),
    loadOptional(includeCorporateActions, optionalFailure, () =>
      provider.getCorporateActions(input.code, from, to),
    ),
    loadOptional(includeTradingCalendar, optionalFailure, () =>
      provider.getTradingCalendar(input.calendarMarket ?? instrument.market, from, to),
    ),
  ]);

  let financialHistory: DataPackMarket["financialHistory"];
  if (includeFinancialSnapshot && includeFinancialHistory && financialSnapshot) {
    const anchor = anchorFiscalYearFromSnapshot(new Date().getFullYear() - 1, financialSnapshot);
    financialHistory = await loadFinancialHistory(provider, input.code, anchor, 5);
    if (financialHistory && financialHistory.length > 0) {
      const latestY = financialHistory[0]?.period?.match(/20\d{2}/)?.[0];
      const snapY = financialSnapshot.period?.match(/20\d{2}/)?.[0];
      const already =
        latestY &&
        snapY &&
        latestY === snapY &&
        financialHistory[0]?.revenue === financialSnapshot.revenue &&
        financialHistory[0]?.netProfit === financialSnapshot.netProfit;
      if (!already) {
        financialHistory = normalizeFinancialHistory([financialSnapshot, ...financialHistory]);
      }
    } else if (financialSnapshot) {
      financialHistory = normalizeFinancialHistory([financialSnapshot]);
    }
  }

  return {
    instrument,
    quote,
    klines,
    financialSnapshot,
    financialHistory,
    corporateActions,
    tradingCalendar,
  };
}
