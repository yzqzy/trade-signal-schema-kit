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
  /** 资本性支出（百万元口径，与利润表/现金流量表对齐） */
  capitalExpenditure?: number;
  /** 有息负债（百万元） */
  interestBearingDebt?: number;
  /** 货币资金及等价物（百万元） */
  cashAndEquivalents?: number;
  /** 少数股东损益（百万元） */
  minorityInterestPnL?: number;
  /** 每股收益（元/股） */
  earningsPerShare?: number;
  /** 每股分红（元/股） */
  dividendsPerShare?: number;
  /** 总市值（百万元） */
  marketCapBaiWan?: number;
  /** 总股本（百万股） */
  totalSharesOutstandingMm?: number;
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
  /** 以 `isTradingDay` 为主；`half` 为扩展预留，常见公开「交易日列表」数据源不区分半日 */
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

export type CapabilityStatus = "supported" | "partial" | "unsupported";
export type CapabilityKey =
  | "instrument"
  | "quote"
  | "kline"
  | "financialSnapshot"
  | "corporateActions"
  | "tradingCalendar"
  | "news";
export type SupportedMarket = Market | "US";

export interface CapabilityEntry {
  market: SupportedMarket;
  capability: CapabilityKey;
  status: CapabilityStatus;
  note?: string;
}

export interface CapabilityMatrix {
  schemaVersion: string;
  entries: CapabilityEntry[];
}

export interface DataPackMarket {
  instrument: Instrument;
  quote: Quote;
  klines: KlineBar[];
  financialSnapshot?: FinancialSnapshot;
  tradingCalendar?: TradingCalendar[];
  corporateActions?: CorporateAction[];
  news?: NewsItem[];
}

export interface PdfSectionsMetadata {
  pdfFile: string;
  totalPages: number;
  extractTime: string;
  sectionsFound: number;
  sectionsTotal: number;
}

export interface PdfSectionBlock {
  title?: string;
  content?: string;
  pageFrom?: number;
  pageTo?: number;
}

export interface PdfSections {
  metadata: PdfSectionsMetadata;
  P2?: PdfSectionBlock;
  P3?: PdfSectionBlock;
  P4?: PdfSectionBlock;
  P6?: PdfSectionBlock;
  P13?: PdfSectionBlock;
  MDA?: PdfSectionBlock;
  SUB?: PdfSectionBlock;
}

export interface QualitativeReport {
  code: string;
  generatedAt: string;
  summary: string;
  evidence: string[];
  factorScores?: Record<string, number>;
}

export interface ValuationMethodResult {
  method: "DCF" | "DDM" | "PE_BAND" | "PEG" | "PS";
  value?: number;
  currency?: string;
  assumptions?: Record<string, number | string>;
  range?: {
    conservative?: number;
    central?: number;
    optimistic?: number;
  };
  diagnostics?: Record<string, number | string | null | undefined>;
  note?: string;
}

export interface ValuationCrossValidation {
  weightedAverage?: number;
  coefficientOfVariation?: number;
  consistency?: "high" | "medium" | "low" | "n/a";
  activeWeights?: Record<string, number>;
  range?: {
    conservative?: number;
    central?: number;
    optimistic?: number;
  };
}

export interface ValuationComputed {
  code: string;
  generatedAt: string;
  companyType?: "blue_chip_value" | "growth" | "hybrid";
  wacc?: number;
  ke?: number;
  methods: ValuationMethodResult[];
  crossValidation?: ValuationCrossValidation;
  impliedExpectations?: Record<string, number | string | null | undefined>;
}

export interface AnalysisReportMeta {
  code: string;
  schemaVersion: string;
  dataSource: string;
  generatedAt: string;
  capabilityFlags?: CapabilityEntry[];
}

export interface AnalysisReport {
  meta: AnalysisReportMeta;
  title: string;
  decision?: "buy" | "watch" | "avoid";
  confidence?: "high" | "medium" | "low";
  sections: Array<{ heading: string; content: string }>;
}
