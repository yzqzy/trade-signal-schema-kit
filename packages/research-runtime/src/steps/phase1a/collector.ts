import type {
  CompanyOperationSignal,
  CompanyOperationsSnapshot,
  CorporateAction,
  DataPackMarket,
  FinancialSnapshot,
  IndustryProfileId,
  KlinePeriod,
  Market,
  MarketDataProvider,
} from "@trade-signal/schema-core";

import { loadFinancialHistory, normalizeFinancialHistory } from "./financial-history.js";
import { resolveIndustryProfileForDataPack } from "./industry-profile.js";

export interface CollectPhase1AInput {
  code: string;
  period?: KlinePeriod;
  from?: string;
  to?: string;
  adj?: "none" | "forward" | "backward";
  /** 财报锚定年（YYYY）；与 `financialPeriod` 二选一优先用显式 `financialPeriod` */
  year?: string;
  includeFinancialSnapshot?: boolean;
  /** A股默认 true：尝试填充 `financialHistory` 供市场包多年列真实回填 */
  includeFinancialHistory?: boolean;
  includeCorporateActions?: boolean;
  includeHistoricalPe?: boolean;
  includeFinancialQualityTrends?: boolean;
  includeTradingCalendar?: boolean;
  financialPeriod?: string;
  calendarMarket?: Market;
  optionalFailure?: "ignore" | "throw";
  /** 显式行业 profile 覆盖；默认按 instrument / 同业池 / F10 经营画像识别 */
  industryProfileId?: IndustryProfileId;
}

const DEFAULT_PERIOD: KlinePeriod = "day";

/**
 * 合并财报快照 `GET /stock/financial/snapshot` 要求 `reportDate` 为年报期末 `YYYY-12-31`，
 * 不能用运行当日或任意自然日，否则会空结果并回退到旧简表（缺 totalAssets）。
 */
export function resolveFinancialSnapshotPeriod(input: CollectPhase1AInput): string {
  const fp = input.financialPeriod?.trim();
  if (fp) return fp;
  const y = input.year?.trim();
  if (y && /^\d{4}$/.test(y)) return `${y}-12-31`;
  const fromY = input.from?.match(/^(\d{4})-\d{2}-\d{2}/)?.[1];
  if (fromY && /^\d{4}$/.test(fromY)) return `${fromY}-12-31`;
  const toY = input.to?.match(/^(\d{4})-\d{2}-\d{2}/)?.[1];
  if (toY && /^\d{4}$/.test(toY)) return `${toY}-12-31`;
  return input.to ?? new Date().toISOString().slice(0, 10);
}

function anchorFiscalYearFromSnapshot(fallback: number, fin?: { period?: string } | null): number {
  const m = fin?.period?.match(/20\d{2}/)?.[0];
  if (m) return Number(m);
  return fallback;
}

function resolveCorporateActionsFrom(input: CollectPhase1AInput, fallbackFrom: string): string {
  const y = input.year?.match(/^20\d{2}$/)?.[0] ?? input.financialPeriod?.match(/20\d{2}/)?.[0];
  if (!y) return fallbackFrom;
  return `${Number(y) - 4}-01-01`;
}

function safeNum(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function yearFromDate(value?: string): string | undefined {
  return value?.match(/^(20\d{2})/)?.[1];
}

function extractDividendPolicyText(snapshot: CompanyOperationsSnapshot | undefined): string | undefined {
  const rawItems = [
    ...(snapshot?.businessHighlights ?? []),
    ...(snapshot?.themeSignals ?? []),
  ];
  for (const item of rawItems) {
    const record = item as Record<string, unknown>;
    const text = String(record.mainPointContent ?? record.summary ?? record.content ?? "").trim();
    const keyword = String(record.keyword ?? record.label ?? record.keyClassif ?? "");
    if (!text) continue;
    if (/分红|派息|股利|股息|利润分配|现金方式分配/u.test(`${keyword}\n${text}`)) {
      return text.replace(/\s+/gu, " ").slice(0, 220);
    }
  }
  return undefined;
}

function summarizeRecentDividends(actions: CorporateAction[] | undefined, limit = 4): string | undefined {
  const byYear = new Map<string, number>();
  for (const action of actions ?? []) {
    if (action.actionType !== "dividend") continue;
    const cash = safeNum(action.cashDividendPerShare);
    if (!cash || cash <= 0) continue;
    const year = yearFromDate(action.exDate) ?? yearFromDate(action.recordDate);
    if (!year) continue;
    byYear.set(year, (byYear.get(year) ?? 0) + cash);
  }
  const rows = [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limit)
    .map(([year, cash]) => `${year}年DPS约${cash.toFixed(4)}`);
  return rows.length ? rows.join("；") : undefined;
}

function summarizePayoutRatio(history: FinancialSnapshot[] | undefined): string | undefined {
  const rows = (history ?? [])
    .map((row) => {
      const year = row.period?.match(/20\d{2}/)?.[0];
      const eps = safeNum(row.earningsPerShare);
      const dps = safeNum(row.dividendsPerShare);
      if (!year || !eps || !dps || eps <= 0 || dps <= 0) return undefined;
      return `${year}年DPS/EPS约${((dps / eps) * 100).toFixed(1)}%`;
    })
    .filter((x): x is string => Boolean(x))
    .slice(0, 3);
  return rows.length ? rows.join("；") : undefined;
}

function buildDividendPolicySignals(input: {
  snapshot?: CompanyOperationsSnapshot;
  corporateActions?: CorporateAction[];
  financialHistory?: FinancialSnapshot[];
}): CompanyOperationSignal[] {
  const signals: CompanyOperationSignal[] = [];
  const policy = extractDividendPolicyText(input.snapshot);
  if (policy) {
    signals.push({
      label: "分红政策",
      category: "shareholder_return",
      summary: policy,
      source: "company_operations_business_highlights",
      confidence: "medium",
    });
  }
  const dividends = summarizeRecentDividends(input.corporateActions);
  if (dividends) {
    signals.push({
      label: "历史分红",
      category: "shareholder_return",
      summary: dividends,
      source: "corporate_actions",
      confidence: "high",
    });
  }
  const payout = summarizePayoutRatio(input.financialHistory);
  if (payout) {
    signals.push({
      label: "派息率",
      category: "shareholder_return",
      summary: payout,
      source: "financial_history",
      confidence: "high",
    });
  }
  return signals;
}

function mergeCompanyOperationSignals(
  snapshot: CompanyOperationsSnapshot | undefined,
  signals: CompanyOperationSignal[],
): CompanyOperationsSnapshot | undefined {
  if (!snapshot || signals.length === 0) return snapshot;
  const existingSignals = snapshot.signals ?? [];
  const existingReturnSignals = snapshot.signalGroups?.shareholderReturns ?? [];
  const hasSame = (candidate: CompanyOperationSignal) =>
    [...existingSignals, ...existingReturnSignals].some(
      (s) => s.category === candidate.category && s.label === candidate.label && s.summary === candidate.summary,
    );
  const additions = signals.filter((s) => !hasSame(s));
  if (additions.length === 0) return snapshot;
  return {
    ...snapshot,
    signals: [...existingSignals, ...additions],
    signalGroups: {
      ...snapshot.signalGroups,
      shareholderReturns: [...existingReturnSignals, ...additions],
    },
  };
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
  const includeHistoricalPe = input.includeHistoricalPe ?? instrument.market === "CN_A";
  const includeFinancialQualityTrends = input.includeFinancialQualityTrends ?? instrument.market === "CN_A";
  const includeTradingCalendar = input.includeTradingCalendar ?? true;

  const financialSnapshotPeriod = resolveFinancialSnapshotPeriod(input);
  const corporateActionsFrom = resolveCorporateActionsFrom(input, from);

  const [financialSnapshot, corporateActions, tradingCalendar] = await Promise.all([
    loadOptional(includeFinancialSnapshot, optionalFailure, () =>
      provider.getFinancialSnapshot(input.code, financialSnapshotPeriod),
    ),
    loadOptional(includeCorporateActions, optionalFailure, () =>
      provider.getCorporateActions(input.code, corporateActionsFrom, to),
    ),
    loadOptional(includeTradingCalendar, optionalFailure, () =>
      provider.getTradingCalendar(input.calendarMarket ?? instrument.market, from, to),
    ),
  ]);
  const [industryCycleSnapshot, swIndustryClassification, peerComparablePool, governanceEventCollection, regulatoryEventCollection, companyOperationsSnapshot] = await Promise.all([
    loadOptional(
      typeof provider.getIndustryCycleSnapshot === "function",
      optionalFailure,
      () => provider.getIndustryCycleSnapshot!(input.code, input.year),
    ),
    loadOptional(
      typeof provider.getSwIndustryClassification === "function",
      optionalFailure,
      () => provider.getSwIndustryClassification!(input.code),
    ),
    loadOptional(
      typeof provider.getPeerComparablePool === "function",
      optionalFailure,
      () => provider.getPeerComparablePool!(input.code, { year: input.year, topN: 10 }),
    ),
    loadOptional(
      typeof provider.getGovernanceEvents === "function",
      optionalFailure,
      () => provider.getGovernanceEvents!(input.code, { year: input.year, limit: 10, timeRange: "3y" }),
    ),
    loadOptional(
      typeof provider.getRegulatoryEvents === "function",
      optionalFailure,
      () =>
        provider.getRegulatoryEvents!(input.code, {
          source: "aggregate",
          exchange: "auto",
          eventKinds: "inquiry,regulatory_measure,discipline",
          limit: 20,
        }),
    ),
    loadOptional(
      typeof provider.getCompanyOperations === "function",
      optionalFailure,
      () => provider.getCompanyOperations!(input.code, { year: input.year, topN: 10 }),
    ),
  ]);
  const historicalPeSeries = await loadOptional(
    includeHistoricalPe && typeof provider.getHistoricalPeSeries === "function",
    optionalFailure,
    () => provider.getHistoricalPeSeries!(input.code, 60),
  );
  const financialQualityTrends = await loadOptional(
    includeFinancialQualityTrends && typeof provider.getFinancialQualityTrends === "function",
    optionalFailure,
    () => provider.getFinancialQualityTrends!(input.code, { years: 5, reportType: "annual" }),
  );

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

  const enrichedCompanyOperationsSnapshot = mergeCompanyOperationSignals(
    companyOperationsSnapshot,
    buildDividendPolicySignals({
      snapshot: companyOperationsSnapshot,
      corporateActions,
      financialHistory,
    }),
  );
  const industryProfileBase = {
    instrument,
    swIndustryClassification,
    peerComparablePool,
    industryCycleSnapshot,
    companyOperationsSnapshot: enrichedCompanyOperationsSnapshot,
  };
  const industryProfileSnapshot = resolveIndustryProfileForDataPack(industryProfileBase, input.industryProfileId);

  return {
    instrument,
    quote,
    klines,
    financialSnapshot,
    financialHistory,
    corporateActions,
    historicalPeSeries,
    financialQualityTrends,
    tradingCalendar,
    industryCycleSnapshot,
    swIndustryClassification,
    peerComparablePool,
    governanceEventCollection,
    regulatoryEventCollection,
    companyOperationsSnapshot: enrichedCompanyOperationsSnapshot,
    industryProfileSnapshot,
  };
}
