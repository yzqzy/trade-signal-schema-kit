import type { DataPackMarket, KlinePeriod, Market, MarketDataProvider } from "@trade-signal/schema-core";

export interface CollectPhase1AInput {
  code: string;
  period?: KlinePeriod;
  from?: string;
  to?: string;
  adj?: "none" | "forward" | "backward";
  includeFinancialSnapshot?: boolean;
  includeCorporateActions?: boolean;
  includeTradingCalendar?: boolean;
  financialPeriod?: string;
  calendarMarket?: Market;
  optionalFailure?: "ignore" | "throw";
}

const DEFAULT_PERIOD: KlinePeriod = "day";

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

  return {
    instrument,
    quote,
    klines,
    financialSnapshot,
    corporateActions,
    tradingCalendar,
  };
}
