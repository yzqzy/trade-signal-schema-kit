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
  /** 行业/板块（若 feed 提供），用于 §9 等章节 */
  industry?: string;
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
  /** 母公司营业收入（百万元），用于 §3P */
  parentRevenue?: number;
  /** 母公司净利润（百万元） */
  parentNetProfit?: number;
  /** 母公司经营活动现金流（百万元） */
  parentOperatingCashFlow?: number;
  /** 母公司总资产（百万元），用于 §4P */
  parentTotalAssets?: number;
  /** 母公司总负债（百万元） */
  parentTotalLiabilities?: number;
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
  /**
   * 可选：按财报年度拉取多年快照（降序或无序均可；由编排层去重排序）。
   * 用于 `data_pack_market` 多年列真实回填，避免单期外推复制。
   */
  getFinancialHistory?(code: string, fiscalYears: string[]): Promise<FinancialSnapshot[]>;
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
  /** 多年财报快照（优先于单期外推）；通常按报告期年度降序 */
  financialHistory?: FinancialSnapshot[];
  tradingCalendar?: TradingCalendar[];
  corporateActions?: CorporateAction[];
  news?: NewsItem[];
}

export type Phase2SectionConfidence = "high" | "medium" | "low";

export interface PdfSectionDiagnosticEntry {
  bestPage: number;
  score: number;
  confidence: Phase2SectionConfidence;
  runnerUpPage?: number;
  runnerUpScore?: number;
}

export interface PdfSectionsMetadata {
  pdfFile: string;
  totalPages: number;
  extractTime: string;
  sectionsFound: number;
  sectionsTotal: number;
  /** Phase2A：估计的财报「附注/财务报告」起始页（启发式） */
  annexStartPageEstimate?: number;
  /** Phase2A：各章节定位得分与置信度（可解释性 / 回归对照） */
  sectionDiagnostics?: Partial<Record<string, PdfSectionDiagnosticEntry>>;
}

export interface PdfSectionBlock {
  title?: string;
  content?: string;
  pageFrom?: number;
  pageTo?: number;
  /** Phase2A：本块定位置信度 */
  confidence?: Phase2SectionConfidence;
  /** Phase2A/2B：抽取告警（边界可疑、低置信度等） */
  extractionWarnings?: string[];
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
