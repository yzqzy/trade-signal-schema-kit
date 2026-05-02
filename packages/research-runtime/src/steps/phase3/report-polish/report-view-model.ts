/**
 * `report_view_model.json` 契约：聚合 Phase1A / market / Phase1B / data_pack_report / Phase3 / 估值，
 * 供 Markdown-first 研报整形与研报站映射；**不含**全文证据（全文在同 run 各 `.md` / `.json`）。
 */
import type { Phase3Decision } from "../types.js";
import type { PolicyResult, TopicReport } from "@trade-signal/research-contracts";

export type ReportEvidenceRefsV1 = {
  phase1aJsonRelative: string;
  dataPackMarketMdRelative: string;
  phase1bQualitativeMdRelative: string;
  dataPackReportMdRelative?: string;
  dataPackReportInterimMdRelative?: string;
  valuationComputedJsonRelative: string;
  analysisReportMdRelative: string;
  phase3PreflightMdRelative?: string;
};

/** Phase1A JSON 摘要（仅稳定字段；缺项为 undefined） */
export type Phase1aInstrumentSummary = {
  code?: string;
  name?: string;
  market?: string;
  currency?: string;
};

export type PeerComparableSummaryV1 = {
  code: string;
  name?: string;
  industryName?: string;
  year?: string;
  revenueAllYear?: number;
  parentNiAllYear?: number;
  parentNi3Q?: number;
  marketCap1Q?: number;
  marketCap4Q?: number;
};

export type IndustryProfileSummaryV1 = {
  profileId: string;
  industryName?: string;
  confidence?: string;
  matchedBy?: string;
  classificationProvider?: string;
  swLevel1Name?: string;
  swLevel2Name?: string;
  swLevel3Name?: string;
  kpiSignals: Array<{
    key: string;
    label: string;
    summary: string;
    source?: string;
    confidence?: string;
  }>;
  missingKpis: string[];
  sourceRefs: string[];
};

export type Phase1aSummaryV1 = {
  instrument?: Phase1aInstrumentSummary;
  peerComparablePool?: {
    source?: string;
    industryName?: string;
    sortColumn?: string;
    peerCodes: string[];
    peers: PeerComparableSummaryV1[];
    note?: string;
  };
  industryProfile?: IndustryProfileSummaryV1;
  /** 其它数值型摘要可逐步扩展；未知保持空 */
  notes?: string[];
};

/** 来自 `parseDataPackMarket` 的可序列化子集 */
export type MarketPackSummaryV1 = {
  code: string;
  name?: string;
  market: string;
  currency?: string;
  price?: number;
  marketCap?: number;
  totalShares?: number;
  peTtm?: number;
  pePercentile?: number;
  peP25?: number;
  peP50?: number;
  peP75?: number;
  /** 来自市场包中的无风险利率（若解析到） */
  riskFreeRate?: number;
  warningsCount: number;
};

export type DataPackReportMetaV1 = {
  present: boolean;
  /** 从 Markdown 中解析的 PDF 抽取门禁，若未匹配则为 undefined */
  pdfGateVerdict?: "OK" | "DEGRADED" | "CRITICAL";
  charCount: number;
};

export type Phase1bMetaV1 = {
  present: boolean;
  charCount: number;
  /** 首段非空行，便于总览展示 */
  leadLine?: string;
};

export type ValuationSummaryV1 = {
  code: string;
  generatedAt?: string;
  companyType?: string;
  wacc?: number;
  ke?: number;
  methodCount: number;
  weightedAverage?: number;
  coefficientOfVariation?: number;
  consistency?: string;
};

export type Factor2SummaryV1 = {
  passed?: boolean;
  A?: number;
  C?: number;
  D?: number;
  I?: number;
  R?: number;
  II?: number;
  rejectType?: string;
  reason?: string;
};

export type Factor3SummaryV1 = {
  passed?: boolean;
  GG?: number;
  HH?: number;
  extrapolationTrust?: string;
  reason?: string;
};

export type Factor4SummaryV1 = {
  passed?: boolean;
  trapRisk?: string;
  position?: string;
};

export type Phase3RollupV1 = {
  decision: Phase3Decision;
  confidence: string;
  reportMode?: "full" | "reject";
  reportTitle?: string;
  factor2?: Factor2SummaryV1;
  factor3?: Factor3SummaryV1;
  factor4?: Factor4SummaryV1;
};

export type ReportViewModelTodoV1 = {
  id: string;
  message: string;
  /** 建议补齐的证据文件（相对 run 根或标准文件名） */
  suggestedSource?: string;
};

/**
 * @version 与编排 `manifestVersion` 独立；仅描述 view-model 形状演进。
 */
export type ReportViewModelV1 = {
  schema: "report_view_model";
  version: "1.0";
  generatedAt: string;
  runId?: string;
  normalizedCode: string;
  displayCompanyName?: string;
  evidence: ReportEvidenceRefsV1;
  phase1a: Phase1aSummaryV1;
  market: MarketPackSummaryV1;
  dataPackReport: DataPackReportMetaV1;
  phase1b: Phase1bMetaV1;
  phase3: Phase3RollupV1;
  valuation: ValuationSummaryV1;
  policyResult: PolicyResult;
  topicReports: TopicReport[];
  /** 显式缺口，禁止静默造数 */
  todos: ReportViewModelTodoV1[];
};

export type ReportPolishComposeBuffers = {
  phase1bMarkdown: string;
  dataPackReportMarkdown: string;
  /** 中报 `data_pack_report_interim.md`（若存在） */
  interimDataPackMarkdown: string;
  marketPackMarkdown: string;
  analysisReportMarkdown: string;
  valuationRawJson: string;
};

export type ReportPolishComposeResult = {
  viewModel: ReportViewModelV1;
  buffers: ReportPolishComposeBuffers;
};
