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
  /** 净资产收益率（%） */
  roePct?: number;
  /** 毛利率（%） */
  grossMarginPct?: number;
  /** 资产负债率（%） */
  debtRatioPct?: number;
  /** 审计意见（原文/标准化标签） */
  auditResult?: string;
  /** 应收类核心口径（百万元） */
  accountsReceivable?: number;
  /** 合同负债（百万元） */
  contractLiabilities?: number;
  /** 信用减值损失（百万元） */
  creditImpairmentLoss?: number;
  /** EBITDA（百万元） */
  ebitda?: number;
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
  /** P2：行业周期快照（feed 优先，可选能力） */
  getIndustryCycleSnapshot?(code: string, year?: string): Promise<IndustryCycleSnapshot>;
  /** P3：同业可比池（feed 优先，可选能力） */
  getPeerComparablePool?(
    code: string,
    input?: { year?: string; topN?: number; sortColumn?: string },
  ): Promise<PeerComparableCollection>;
  /** P4：治理负面事件（feed 优先，可选能力） */
  getGovernanceEvents?(
    code: string,
    input?: {
      year?: string;
      limit?: number;
      timeRange?: "3m" | "6m" | "1y" | "3y" | "5y";
      dedupe?: boolean;
      dropPlaceholders?: boolean;
      preferSeverity?: boolean;
    },
  ): Promise<GovernanceEventCollection>;
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
  /** P2：行业周期快照（若 provider 支持） */
  industryCycleSnapshot?: IndustryCycleSnapshot;
  /** P3：同业可比池（若 provider 支持） */
  peerComparablePool?: PeerComparableCollection;
  /** P4：治理负面事件（若 provider 支持） */
  governanceEventCollection?: GovernanceEventCollection;
}

export type Phase2SectionConfidence = "high" | "medium" | "low";

export interface PdfSectionDiagnosticEntry {
  bestPage: number;
  score: number;
  confidence: Phase2SectionConfidence;
  runnerUpPage?: number;
  runnerUpScore?: number;
  /** Phase2A：除最佳页外保留的 top-k 候选（页码+得分），供重排 / AI 校验 */
  topCandidates?: Array<{ page: number; score: number }>;
  /** Phase2A：用于生成该诊断得分的文本后端（多解析器融合） */
  textBackend?: "pdf-parse" | "pdfjs-dist";
}

/** Phase2A/2B 抽取质量摘要（门禁与报告嵌入用） */
export type PdfExtractGateVerdict = "OK" | "DEGRADED" | "CRITICAL";

export interface PdfExtractQualitySummary {
  gateVerdict: PdfExtractGateVerdict;
  /** 至少应存在的 Turtle 关键块：MDA + P4 + P13 */
  criticalSectionIds: readonly string[];
  missingCritical: string[];
  lowConfidenceCritical: string[];
  sectionsFound: number;
  sectionsTotal: number;
  /**
   * 终稿叙事是否允许标 `[终稿状态: 完成]`（仍须满足 skill 硬约束与 PDF 质量声明）。
   * CRITICAL（关键块缺失）为 false；DEGRADED（仅低置信）为 true。
   */
  allowsFinalNarrativeComplete?: boolean;
  /** 建议人工复核顺序（高优先级在前） */
  humanReviewPriority?: readonly string[];
  /** 本 run 曾启用的 PDF 文本后端（去重有序） */
  pdfTextBackendsUsed?: readonly string[];
  /** 可选：AI 语义校验摘要（不替代原始文本） */
  aiVerifierApplied?: boolean;
  aiVerifierNote?: string;
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
  /** Phase2A：关键章节缺失 / 低置信度聚合（供 Phase3 preflight 与报告引用） */
  extractQuality?: PdfExtractQualitySummary;
  /** Phase2A：本 PDF 解析用过的文本后端列表（如 pdf-parse、pdfjs-dist） */
  pdfTextBackendsUsed?: readonly string[];
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

/** Feed-first：缺口分级（写入 `## 数据缺口与补齐建议` 等产物） */
export type FeedDataGapSeverity = "blocking" | "degraded" | "hint";

export interface FeedDataGap {
  id: string;
  severity: FeedDataGapSeverity;
  /** 缺口所指向的章节、字段或文件 */
  target: string;
  /** 对分析结论的影响（中文短句） */
  impact: string;
  /** 人类可执行的补齐方式（中文） */
  remediation: string;
  /** 可选：建议的 pnpm 命令模板 */
  suggestedCommand?: string;
}

export type IndustryCyclicality = "strong" | "weak" | "non_cyclical" | "unknown";
export type IndustryCyclePosition = "bottom" | "middle" | "top" | "unknown";
export type SnapshotConfidence = "high" | "medium" | "low";

export interface IndustryCycleSignal {
  indicator: string;
  summary: string;
  publishedAt?: string;
  evidenceUrl?: string;
}

export interface IndustryCycleSnapshot {
  industryName: string;
  classification: string;
  cyclicality: IndustryCyclicality;
  position: IndustryCyclePosition;
  confidence: SnapshotConfidence;
  signals: IndustryCycleSignal[];
}

export interface PeerComparableCollection {
  source: string;
  industryName: string;
  peerCodes: string[];
  note?: string;
}

export type GovernanceEventSeverity = "high" | "medium" | "low";

export interface GovernanceNegativeEvent {
  category: "governance_negative" | "regulatory" | "audit" | "ownership" | "other";
  summary: string;
  severity: GovernanceEventSeverity;
  happenedAt?: string;
  evidenceUrl?: string;
  sourceLabel?: string;
}

export interface GovernanceEventCollection {
  source: string;
  events: GovernanceNegativeEvent[];
  highSeverityCount: number;
}
