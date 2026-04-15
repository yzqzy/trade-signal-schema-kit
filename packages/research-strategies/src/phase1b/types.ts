export type Phase1BChannel = "http" | "mcp";

export interface Phase1BInput {
  stockCode: string;
  companyName: string;
  marketDataPackPath?: string;
  year?: string;
  channel?: Phase1BChannel;
  limitPerQuery?: number;
}

export type McpToolCaller = (toolName: string, args: Record<string, unknown>) => Promise<unknown>;

export interface Phase1BEvidence {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  snippet?: string;
}

export interface Phase1BItem {
  item: string;
  content: string;
  evidences: Phase1BEvidence[];
}

export interface Phase1BMdaSection {
  heading: string;
  points: string[];
  evidences: Phase1BEvidence[];
}

export interface Phase1BQualitativeSupplement {
  stockCode: string;
  companyName: string;
  year?: string;
  generatedAt: string;
  channel: Phase1BChannel;
  section7: Phase1BItem[];
  section8: Phase1BItem[];
  section10: Phase1BMdaSection[];
}

// --- Stage C：C1（通用证据）/ C2（策略投影）拆分（M2）---

/**
 * C1 单条证据：与 `Phase1BEvidence` 同形，强调「仅归一化事实与来源」，不含策略结论。
 * （别名便于语义区分；序列化 JSON 与历史字段一致。）
 */
export type ExternalEvidenceRecord = Phase1BEvidence;

/**
 * C1 检索主题分类：对应对外披露补全的 §7 / §8 / §10 区块，**不是** Turtle D1~D6 策略维度。
 */
export type ExternalEvidenceCatalog = "7" | "8" | "10";

/** C1：单次查询 + 证据列表（策略无关）。 */
export interface ExternalEvidenceC1Hit {
  catalog: ExternalEvidenceCatalog;
  promptItem: string;
  searchQuery: string;
  evidences: ExternalEvidenceRecord[];
}

/** C1：一次采集跑出的全部命中（未映射到 Phase1B 表结构）。 */
export interface ExternalEvidenceC1Result {
  stockCode: string;
  companyName: string;
  year?: string;
  channel: Phase1BChannel;
  collectedAt: string;
  hits: ExternalEvidenceC1Hit[];
}

/**
 * C2：映射到当前工作流所需的 Phase1B 外形（Turtle 路径下即 `Phase1BQualitativeSupplement`）。
 */
export type ExternalEvidenceC2Projection = Phase1BQualitativeSupplement;
