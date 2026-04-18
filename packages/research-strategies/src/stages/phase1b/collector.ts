import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

import { initCliEnv } from "../../lib/init-cli-env.js";
import { buildProxiedFetch, parseTsLlmEnv } from "../../orchestrator/langgraph/agent-llm-config.js";

import { topicPatternForPhase1bItem } from "./evidence-quality.js";
import type {
  ExternalEvidenceC1Hit,
  ExternalEvidenceC1Result,
  ExternalEvidenceCatalog,
  McpToolCaller,
  Phase1BChannel,
  Phase1BEvidence,
  Phase1BInput,
  Phase1BItem,
  Phase1BMdaSection,
  Phase1BQualitativeSupplement,
  Phase1BRetrievalDiagnostics,
} from "./types.js";

type Section8RetrievalDiag = Phase1BRetrievalDiagnostics;

type FeedSearchHit = {
  title?: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  snippet?: string;
  summary?: string;
  content?: string;
};

type FeedSearchResponse = {
  success?: boolean;
  data?:
    | FeedSearchHit[]
    | { items?: FeedSearchHit[]; results?: FeedSearchHit[]; list?: FeedSearchHit[]; candidates?: FeedSearchHit[] };
  items?: FeedSearchHit[];
  results?: FeedSearchHit[];
  list?: FeedSearchHit[];
  candidates?: FeedSearchHit[];
  message?: string;
};

type FeedSearchQuery = {
  catalog: ExternalEvidenceCatalog;
  item: string;
  /** 写入 C1 命中，便于追溯检索意图 */
  query: string;
  /** 透传 feed `category`：中文分号多值 */
  reportCategory: string;
  /** 透传 feed `keyword`：标题子串过滤（可选） */
  reportKeyword?: string;
  /** §8：在主 keyword 无命中时依次尝试的意图子串（仍配合 category） */
  intentKeywords?: string[];
};

export interface FeedSearchClientOptions {
  baseUrl: string;
  apiBasePath?: string;
  apiKey?: string;
  endpointPath?: string;
}

export interface Phase1BCollectOptions extends Partial<FeedSearchClientOptions> {
  mcpCallTool?: McpToolCaller;
  mcpToolName?: string;
}

const NOT_FOUND_TEXT = "⚠️ 未搜索到相关信息";
const DEFAULT_ENDPOINT_PATH = "/stock/report/search";

/** §7 管理层与治理：默认宽分类 */
const PHASE1B_CATEGORY_7 = "公司治理;董事会;监事会;股东会;股权变动;风险提示";
/** §7 高敏条目：收窄召回，减少制度类误命中 */
const PHASE1B_CATEGORY_7_VIOLATION = "风险提示;日常经营;中介报告";
const PHASE1B_CATEGORY_7_PLEDGE = "股权变动;风险提示";
const PHASE1B_CATEGORY_7_BUYBACK = "股权变动;董事会";
/** §8 行业与竞争（宽分类，仅作默认；各条目优先用下方细分） */
const PHASE1B_CATEGORY_8 = "日常经营;风险提示;中介报告";
/** §8：竞争对手 — 偏年报/经营叙述，避免担保类日常公告占满 */
const PHASE1B_CATEGORY_8_COMPETITOR = "年报;日常经营";
/** §8：监管 — 风险提示与中介报告更易命中监管问询类 */
const PHASE1B_CATEGORY_8_REGULATION = "风险提示;中介报告;公司治理";
/** §8：周期 — 定期报告中的行业与经营环境 */
const PHASE1B_CATEGORY_8_CYCLE = "年报;半年报;日常经营";
/** §10 MD&A 类 */
const PHASE1B_CATEGORY_10 = "年报;半年报;一季报;三季报";

function reportCategoryForCatalog(catalog: ExternalEvidenceCatalog): string {
  if (catalog === "7") return PHASE1B_CATEGORY_7;
  if (catalog === "8") return PHASE1B_CATEGORY_8;
  return PHASE1B_CATEGORY_10;
}

function resolveFeedSearchClientOptionsFromEnv(
  overrides: Partial<FeedSearchClientOptions> = {},
): FeedSearchClientOptions {
  const baseUrl = overrides.baseUrl ?? process.env.FEED_BASE_URL;
  if (!baseUrl) throw new Error("Missing FEED_BASE_URL for Phase1B collector");

  const apiBasePath = (overrides.apiBasePath ?? (process.env.FEED_API_BASE_PATH ?? "/api/v1")).replace(/\/+$/, "");

  return {
    baseUrl,
    apiKey: overrides.apiKey ?? process.env.FEED_API_KEY,
    apiBasePath,
    endpointPath: overrides.endpointPath ?? DEFAULT_ENDPOINT_PATH,
  };
}

function resolvePhase1BReportYear(input: Phase1BInput): string {
  const y = input.year?.trim();
  if (y && /^\d{4}$/.test(y)) return y;
  return String(new Date().getFullYear() - 1);
}

function normalizeHits(payload: FeedSearchResponse): FeedSearchHit[] {
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && typeof payload.data === "object") {
    const nested =
      payload.data.items ??
      payload.data.results ??
      payload.data.list ??
      payload.data.candidates;
    if (Array.isArray(nested)) return nested;
  }
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.candidates)) return payload.candidates;
  return [];
}

function normalizeHitsFromUnknown(payload: unknown): FeedSearchHit[] {
  if (!payload || typeof payload !== "object") return [];
  return normalizeHits(payload as FeedSearchResponse);
}

function toEvidence(hit: FeedSearchHit): Phase1BEvidence | undefined {
  if (!hit.url) return undefined;
  return {
    title: hit.title ?? "未命名来源",
    url: hit.url,
    source: hit.source,
    publishedAt: hit.publishedAt,
    snippet: hit.snippet ?? hit.summary ?? hit.content,
  };
}

function summarize(evidences: Phase1BEvidence[]): string {
  if (evidences.length === 0) return NOT_FOUND_TEXT;
  const first = evidences[0];
  return first.snippet ?? first.title;
}

/**
 * §8 专用：URL 去重、主题命中优先，降低跨条目「同一批公告」重复。
 */
function postProcessSection8Evidences(item: string, evidences: Phase1BEvidence[], limit: number): Phase1BEvidence[] {
  const pattern = topicPatternForPhase1bItem(item);
  const seenUrl = new Set<string>();
  const deduped = evidences.filter((e) => {
    const u = (e.url ?? "").trim();
    if (!u || seenUrl.has(u)) return false;
    seenUrl.add(u);
    return true;
  });
  const scoreTitle = (e: Phase1BEvidence): number => {
    const t = e.title ?? "";
    if (pattern && pattern.test(t)) return 2;
    return 1;
  };
  deduped.sort((a, b) => {
    const s = scoreTitle(b) - scoreTitle(a);
    if (s !== 0) return s;
    return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
  });
  return deduped.slice(0, Math.max(0, limit));
}

/**
 * 可选：对 §8 单条检索命中的公告标题/摘要做轻量相关性重排（需 `TS_LLM_*`）。
 * 失败或未配置时返回 undefined，主链保持原始顺序。
 */
async function tryAiRerankSection8Evidences(input: {
  item: string;
  companyName?: string;
  evidences: Phase1BEvidence[];
  limit: number;
}): Promise<{ evidences: Phase1BEvidence[]; applied: boolean } | undefined> {
  const cfg = parseTsLlmEnv();
  if (!cfg || input.evidences.length < 2) return undefined;

  const maxIn = Math.min(12, input.evidences.length);
  const lines = input.evidences.slice(0, maxIn).map((e, i) => {
    const sn = (e.snippet ?? "").replace(/\s+/g, " ").slice(0, 200);
    return `${i}: ${e.title ?? ""} | ${sn}`;
  });

  try {
    const proxiedFetch = buildProxiedFetch(cfg.proxyUrl);
    const llm = new ChatOpenAI({
      model: cfg.model,
      apiKey: cfg.apiKey,
      temperature: 0,
      timeout: Math.min(cfg.timeoutMs, 25_000),
      maxRetries: 1,
      configuration: {
        baseURL: cfg.baseURL,
        ...(proxiedFetch ? { fetch: proxiedFetch as never } : {}),
      },
    });

    const res = await llm.invoke([
      new SystemMessage(
        [
          "You reorder evidence indices by relevance to a retrieval intent for A-share/HK company research.",
          "Return ONLY compact JSON: {\"order\":[int,...]} — a permutation of indices 0..n-1 for the listed items.",
          "No prose, no markdown fences.",
        ].join(" "),
      ),
      new HumanMessage(
        [
          `Company: ${input.companyName ?? "(unknown)"}`,
          `Intent (Chinese): ${input.item}`,
          "Evidence lines (index prefix):",
          ...lines,
        ].join("\n"),
      ),
    ]);

    const raw = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    const jsonMatch = raw.match(/\{[\s\S]*"order"[\s\S]*\}/);
    if (!jsonMatch) return undefined;
    const parsed = JSON.parse(jsonMatch[0]) as { order?: number[] };
    const order = parsed.order;
    if (!Array.isArray(order) || order.length < 2) return undefined;
    const n = maxIn;
    const seen = new Set<number>();
    for (const x of order) {
      if (!Number.isInteger(x) || x < 0 || x >= n || seen.has(x)) return undefined;
      seen.add(x);
    }
    if (seen.size !== order.length) return undefined;

    const reordered = order.map((i) => input.evidences[i]!);
    const tail = input.evidences.slice(maxIn);
    const merged = [...reordered, ...tail].slice(0, Math.max(1, input.limit));
    return { evidences: merged, applied: true };
  } catch {
    return undefined;
  }
}

function buildQueries(_input: Phase1BInput): FeedSearchQuery[] {
  const mk = (
    catalog: ExternalEvidenceCatalog,
    item: string,
    overrides?: Partial<Pick<FeedSearchQuery, "reportCategory" | "reportKeyword" | "intentKeywords">>,
  ): FeedSearchQuery => ({
    catalog,
    item,
    query: item,
    reportCategory: overrides?.reportCategory ?? reportCategoryForCatalog(catalog),
    ...(overrides?.reportKeyword ? { reportKeyword: overrides.reportKeyword } : {}),
    ...(overrides?.intentKeywords ? { intentKeywords: overrides.intentKeywords } : {}),
  });
  return [
    mk("7", "控股股东及持股比例"),
    mk("7", "CEO/董事长/CFO 任期"),
    mk("7", "管理层重大变更（5年）"),
    mk("7", "审计师与审计意见"),
    mk("7", "违规/处罚记录", { reportCategory: PHASE1B_CATEGORY_7_VIOLATION }),
    mk("7", "大股东质押/减持", { reportCategory: PHASE1B_CATEGORY_7_PLEDGE }),
    mk("7", "回购计划", { reportCategory: PHASE1B_CATEGORY_7_BUYBACK, reportKeyword: "回购" }),
    mk("8", "主要竞争对手", {
      reportCategory: PHASE1B_CATEGORY_8_COMPETITOR,
      reportKeyword: "份额",
      intentKeywords: ["竞争", "市场", "行业", "客户"],
    }),
    mk("8", "行业监管动态", {
      reportCategory: PHASE1B_CATEGORY_8_REGULATION,
      reportKeyword: "监管",
      intentKeywords: ["问询", "处罚", "立案", "警示"],
    }),
    mk("8", "行业周期位置", {
      reportCategory: PHASE1B_CATEGORY_8_CYCLE,
      reportKeyword: "周期",
      intentKeywords: ["景气", "需求", "产能", "库存"],
    }),
    mk("10", "经营回顾"),
    mk("10", "前瞻指引"),
    mk("10", "资本配置意图"),
    mk("10", "风险因素"),
  ];
}

async function searchFeedSection8Tiered(
  options: FeedSearchClientOptions,
  input: Phase1BInput,
  query: FeedSearchQuery,
): Promise<{ evidences: Phase1BEvidence[]; diagnostics: Section8RetrievalDiag }> {
  const variantKeywordsTried: string[] = [];
  const tryKw = async (kw: string | undefined) => searchFeed(options, input, { ...query, reportKeyword: kw });

  const primary = query.reportKeyword?.trim();
  if (primary) {
    const ev = await tryKw(primary);
    if (ev.length > 0) {
      return { evidences: ev, diagnostics: { variantKeywordsTried, zeroHitBroadFallbackUsed: false } };
    }
    variantKeywordsTried.push(primary);
  }

  for (const extra of query.intentKeywords ?? []) {
    const k = extra.trim();
    if (!k || k === primary) continue;
    const ev = await tryKw(k);
    variantKeywordsTried.push(k);
    if (ev.length > 0) {
      return { evidences: ev, diagnostics: { variantKeywordsTried, zeroHitBroadFallbackUsed: false } };
    }
  }

  const broad = await tryKw(undefined);
  const zeroHitBroadFallbackUsed = broad.length > 0 && Boolean(primary || (query.intentKeywords?.length ?? 0) > 0);
  return { evidences: broad, diagnostics: { variantKeywordsTried, zeroHitBroadFallbackUsed } };
}

async function searchMcpSection8Tiered(
  callTool: McpToolCaller,
  toolName: string,
  input: Phase1BInput,
  query: FeedSearchQuery,
): Promise<{ evidences: Phase1BEvidence[]; diagnostics: Section8RetrievalDiag }> {
  const variantKeywordsTried: string[] = [];
  const tryKw = async (kw: string | undefined) =>
    searchMcp(callTool, toolName, input, { ...query, reportKeyword: kw });

  const primary = query.reportKeyword?.trim();
  if (primary) {
    const ev = await tryKw(primary);
    if (ev.length > 0) {
      return { evidences: ev, diagnostics: { variantKeywordsTried, zeroHitBroadFallbackUsed: false } };
    }
    variantKeywordsTried.push(primary);
  }

  for (const extra of query.intentKeywords ?? []) {
    const k = extra.trim();
    if (!k || k === primary) continue;
    const ev = await tryKw(k);
    variantKeywordsTried.push(k);
    if (ev.length > 0) {
      return { evidences: ev, diagnostics: { variantKeywordsTried, zeroHitBroadFallbackUsed: false } };
    }
  }

  const broad = await tryKw(undefined);
  const zeroHitBroadFallbackUsed = broad.length > 0 && Boolean(primary || (query.intentKeywords?.length ?? 0) > 0);
  return { evidences: broad, diagnostics: { variantKeywordsTried, zeroHitBroadFallbackUsed } };
}

async function searchFeed(
  options: FeedSearchClientOptions,
  input: Phase1BInput,
  query: FeedSearchQuery,
): Promise<Phase1BEvidence[]> {
  const base = options.baseUrl.replace(/\/+$/, "");
  const apiBasePath = (options.apiBasePath ?? "/api/v1").replace(/\/+$/, "");
  const endpointPath = (options.endpointPath ?? DEFAULT_ENDPOINT_PATH).replace(/^([^/])/, "/$1");
  const url = new URL(`${base}${apiBasePath}${endpointPath}`);
  const limit = input.limitPerQuery ?? 5;
  const year = resolvePhase1BReportYear(input);

  url.searchParams.set("code", input.stockCode);
  url.searchParams.set("year", year);
  url.searchParams.set("category", query.reportCategory);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("timeRange", "3y");
  const name = input.companyName?.trim();
  if (name) url.searchParams.set("stockName", name);
  url.searchParams.set("item", query.item);
  const kw = query.reportKeyword?.trim();
  if (kw) url.searchParams.set("keyword", kw);

  const response = await fetch(url, {
    headers: {
      ...(options.apiKey ? { "x-api-key": options.apiKey } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Feed search failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as FeedSearchResponse;
  if (payload.success === false) {
    const keys = [...url.searchParams.keys()].join(",");
    throw new Error(
      `${payload.message || "Feed search failed with success=false"} (report/search params: ${keys})`,
    );
  }
  const evidences = normalizeHits(payload)
    .map(toEvidence)
    .filter((item): item is Phase1BEvidence => Boolean(item));
  return evidences;
}

async function searchMcp(
  callTool: McpToolCaller,
  toolName: string,
  input: Phase1BInput,
  query: FeedSearchQuery,
): Promise<Phase1BEvidence[]> {
  const kw = query.reportKeyword?.trim();
  const payload = await callTool(toolName, {
    code: input.stockCode,
    year: resolvePhase1BReportYear(input),
    category: query.reportCategory,
    limit: input.limitPerQuery ?? 5,
    timeRange: "3y",
    stockName: input.companyName?.trim() || undefined,
    item: query.item,
    ...(kw ? { keyword: kw } : {}),
  });
  const obj = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const hitsPayload = Array.isArray(payload)
    ? ({ data: payload } as FeedSearchResponse)
    : Array.isArray(obj.candidates)
      ? { candidates: obj.candidates as FeedSearchHit[] }
      : payload;
  const evidences = normalizeHitsFromUnknown(hitsPayload)
    .map(toEvidence)
    .filter((item): item is Phase1BEvidence => Boolean(item));
  return evidences;
}

/**
 * **Stage C · C1**：通用外部证据采集（HTTP/MCP），不含策略判断。
 */
export async function collectExternalEvidenceC1(
  input: Phase1BInput,
  options: Phase1BCollectOptions = {},
): Promise<ExternalEvidenceC1Result> {
  const channel: Phase1BChannel = input.channel ?? "http";
  initCliEnv();
  const queries = buildQueries(input);

  let results: Array<{
    query: FeedSearchQuery;
    evidences: Phase1BEvidence[];
    diagnostics?: Section8RetrievalDiag;
  }>;
  if (channel === "http") {
    const clientOptions = resolveFeedSearchClientOptionsFromEnv(options);
    const limit = input.limitPerQuery ?? 5;
    results = await Promise.all(
      queries.map(async (query) => {
        let diagnostics: Section8RetrievalDiag | undefined;
        let evidences: Phase1BEvidence[];
        if (query.catalog === "8") {
          const tiered = await searchFeedSection8Tiered(clientOptions, input, query);
          evidences = tiered.evidences;
          diagnostics = tiered.diagnostics;
        } else {
          evidences = await searchFeed(clientOptions, input, query);
          diagnostics = undefined;
        }
        if (query.catalog === "8") {
          const rerank = await tryAiRerankSection8Evidences({
            item: query.item,
            companyName: input.companyName,
            evidences,
            limit,
          });
          if (rerank?.applied) {
            evidences = rerank.evidences;
          }
          evidences = postProcessSection8Evidences(query.item, evidences, limit);
          diagnostics = { ...diagnostics!, aiRerankApplied: Boolean(rerank?.applied) };
        }
        return { query, evidences, diagnostics };
      }),
    );
  } else {
    const mcpCallTool = options.mcpCallTool;
    if (!mcpCallTool) {
      throw new Error("Phase1B MCP mode requires options.mcpCallTool");
    }
    const toolName = options.mcpToolName ?? "search_stock_reports";
    const limit = input.limitPerQuery ?? 5;
    results = await Promise.all(
      queries.map(async (query) => {
        let diagnostics: Section8RetrievalDiag | undefined;
        let evidences: Phase1BEvidence[];
        if (query.catalog === "8") {
          const tiered = await searchMcpSection8Tiered(mcpCallTool, toolName, input, query);
          evidences = tiered.evidences;
          diagnostics = tiered.diagnostics;
        } else {
          evidences = await searchMcp(mcpCallTool, toolName, input, query);
          diagnostics = undefined;
        }
        if (query.catalog === "8") {
          const rerank = await tryAiRerankSection8Evidences({
            item: query.item,
            companyName: input.companyName,
            evidences,
            limit,
          });
          if (rerank?.applied) {
            evidences = rerank.evidences;
          }
          evidences = postProcessSection8Evidences(query.item, evidences, limit);
          diagnostics = { ...diagnostics!, aiRerankApplied: Boolean(rerank?.applied) };
        }
        return { query, evidences, diagnostics };
      }),
    );
  }

  const collectedAt = new Date().toISOString();
  const hits: ExternalEvidenceC1Hit[] = results.map(({ query, evidences, diagnostics }) => ({
    catalog: query.catalog,
    promptItem: query.item,
    searchQuery: query.query,
    evidences,
    ...(diagnostics ? { retrievalDiagnostics: diagnostics } : {}),
  }));

  return {
    stockCode: input.stockCode,
    companyName: input.companyName,
    year: input.year,
    channel,
    collectedAt,
    hits,
  };
}

/**
 * **Stage C · C2**：将 C1 命中投影为当前策略所需的 Phase1B 外形（Turtle 工作流兼容）。
 */
export function projectEvidenceToC2(c1: ExternalEvidenceC1Result): Phase1BQualitativeSupplement {
  const { hits, stockCode, companyName, year, channel, collectedAt } = c1;

  const section7: Phase1BItem[] = hits
    .filter((h) => h.catalog === "7")
    .map((h) => ({
      item: h.promptItem,
      content: summarize(h.evidences),
      evidences: h.evidences,
    }));

  const section8: Phase1BItem[] = hits
    .filter((h) => h.catalog === "8")
    .map((h) => ({
      item: h.promptItem,
      content: summarize(h.evidences),
      evidences: h.evidences,
      ...(h.retrievalDiagnostics ? { retrievalDiagnostics: h.retrievalDiagnostics } : {}),
    }));

  const section10: Phase1BMdaSection[] = hits
    .filter((h) => h.catalog === "10")
    .map((h) => ({
      heading: h.promptItem,
      points:
        h.evidences.length > 0
          ? h.evidences
              .slice(0, 3)
              .map((evidence) => evidence.snippet ?? evidence.title)
              .filter((point) => point.trim().length > 0)
          : [NOT_FOUND_TEXT],
      evidences: h.evidences,
    }));

  return {
    stockCode,
    companyName,
    year,
    generatedAt: collectedAt,
    channel,
    section7,
    section8,
    section10,
  };
}

/**
 * **Stage C**：外部证据管线（C1 → C2），供编排层显式调用（M3 前后顺序调整时接缝不变）。
 */
export async function runStageCExternalEvidence(
  input: Phase1BInput,
  options: Phase1BCollectOptions = {},
): Promise<Phase1BQualitativeSupplement> {
  const c1 = await collectExternalEvidenceC1(input, options);
  return projectEvidenceToC2(c1);
}

export async function collectPhase1BQualitative(
  input: Phase1BInput,
  options: Phase1BCollectOptions = {},
): Promise<Phase1BQualitativeSupplement> {
  return runStageCExternalEvidence(input, options);
}

export async function collectPhase1BQualitativeWithMcp(
  input: Omit<Phase1BInput, "channel">,
  mcpCallTool: McpToolCaller,
  mcpToolName?: string,
): Promise<Phase1BQualitativeSupplement> {
  return collectPhase1BQualitative(
    { ...input, channel: "mcp" },
    { mcpCallTool, mcpToolName },
  );
}
