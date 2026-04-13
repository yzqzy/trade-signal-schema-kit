import { isPhase0WhitelistedPdfUrl } from "./downloader.js";

type FeedSearchHit = {
  title?: string;
  url?: string;
  pdfUrl?: string;
  attachmentUrl?: string;
  fileUrl?: string;
  source?: string;
  publishedAt?: string;
  snippet?: string;
  summary?: string;
  content?: string;
};

type FeedSearchResponse = {
  success?: boolean;
  data?: FeedSearchHit[] | { items?: FeedSearchHit[]; results?: FeedSearchHit[]; list?: FeedSearchHit[] };
  items?: FeedSearchHit[];
  results?: FeedSearchHit[];
  list?: FeedSearchHit[];
  message?: string;
};

const DEFAULT_ENDPOINT_PATH = "/stock/report/search";

function normalizeHits(payload: FeedSearchResponse): FeedSearchHit[] {
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && typeof payload.data === "object") {
    const nested = payload.data.items ?? payload.data.results ?? payload.data.list;
    if (Array.isArray(nested)) return nested;
  }
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.list)) return payload.list;
  return [];
}

function stripExchangePrefix(code: string): string {
  return code.replace(/^(SH|SZ)/i, "").trim();
}

function publishedAtMs(hit: FeedSearchHit): number {
  if (!hit.publishedAt) return 0;
  const t = Date.parse(hit.publishedAt);
  return Number.isFinite(t) ? t : 0;
}

function scoreHit(hit: FeedSearchHit, fiscalYear: string, categoryNorm: string): number {
  let s = 0;
  const title = (hit.title ?? "").toLowerCase();
  const url = String(resolveHitUrl(hit) ?? "").toLowerCase();
  const year = fiscalYear.trim();

  if (categoryNorm.includes("年报") || categoryNorm.includes("年度")) {
    if (title.includes("年报") || title.includes("年度报告")) s += 120;
    if (title.includes(year) || url.includes(year)) s += 60;
  } else {
    if (title.includes(categoryNorm.toLowerCase())) s += 80;
  }

  s += publishedAtMs(hit) / 1e12;

  if (url.includes("cninfo.com.cn")) s += 25;
  if (url.includes("xueqiu.com")) s += 10;
  if (url.includes("10jqka.com.cn")) s += 10;

  return s;
}

function resolveHitUrl(hit: FeedSearchHit): string | undefined {
  return hit.url ?? hit.pdfUrl ?? hit.attachmentUrl ?? hit.fileUrl;
}

async function fetchSearchHits(params: {
  baseUrl: string;
  apiBasePath: string;
  apiKey?: string;
  stockCode: string;
  fiscalYear: string;
  q: string;
  limit: number;
}): Promise<FeedSearchHit[]> {
  const base = params.baseUrl.replace(/\/+$/, "");
  const apiBasePath = params.apiBasePath.replace(/\/+$/, "");
  const endpointPath = DEFAULT_ENDPOINT_PATH.replace(/^([^/])/, "/$1");
  const url = new URL(`${base}${apiBasePath}${endpointPath}`);

  url.searchParams.set("code", params.stockCode);
  url.searchParams.set("year", params.fiscalYear);
  url.searchParams.set("q", params.q);
  url.searchParams.set("query", params.q);
  url.searchParams.set("keyword", params.q);
  url.searchParams.set("limit", String(params.limit));

  const response = await fetch(url, {
    headers: {
      ...(params.apiKey ? { "x-api-key": params.apiKey } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`[phase0] Feed /stock/report/search 请求失败：HTTP ${response.status}。请改用 --url 指定 PDF 直链。`);
  }

  const payload = (await response.json()) as FeedSearchResponse;
  if (payload.success === false) {
    throw new Error(
      `[phase0] Feed 检索返回失败：${payload.message ?? "success=false"}。请改用 --url 指定 PDF 直链。`,
    );
  }
  return normalizeHits(payload);
}

const PHASE0_DISCOVERY_HINT =
  "请手动指定 PDF 直链：pnpm run phase0:download -- --url \"https://...pdf\" --stock-code <代码> --year <YYYY> --category 年报";

/**
 * 通过 Feed `/stock/report/search` 解析年报 PDF URL（仅白名单域名）。
 * 失败时抛出带 `[phase0]` 的 Error，引导使用 `--url`。
 */
export async function discoverPhase0ReportUrlFromFeed(input: {
  stockCode: string;
  fiscalYear: string;
  category: string;
}): Promise<string> {
  const baseUrl = process.env.FEED_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      `[phase0] 自动发现需要 FEED_BASE_URL。${PHASE0_DISCOVERY_HINT}`,
    );
  }

  const apiKey = process.env.FEED_API_KEY;
  const apiBasePath = (process.env.FEED_API_BASE_PATH ?? "/api/v1").replace(/\/+$/, "");
  const normCode = stripExchangePrefix(input.stockCode);
  const cat = input.category.trim() || "年报";
  const year = input.fiscalYear.trim();

  const queries = [
    `${normCode} ${year} 年度报告 PDF`,
    `${normCode} ${year} 年报 PDF`,
    `${normCode} ${year} annual report pdf cninfo`,
  ];

  const seen = new Set<string>();
  const candidates: FeedSearchHit[] = [];

  for (const q of queries) {
    const hits = await fetchSearchHits({
      baseUrl,
      apiBasePath,
      apiKey,
      stockCode: input.stockCode,
      fiscalYear: year,
      q,
      limit: 20,
    });
    for (const h of hits) {
      const u = resolveHitUrl(h)?.trim();
      if (!u || seen.has(u)) continue;
      seen.add(u);
      candidates.push({ ...h, url: u });
    }
    if (candidates.length >= 8) break;
  }

  const anyPdfLike = candidates.filter((h) => {
    const u = h.url?.trim().toLowerCase();
    return Boolean(u && u.endsWith(".pdf"));
  });

  const pdfHits = candidates.filter((h) => {
    const u = h.url?.trim();
    return Boolean(u && u.toLowerCase().endsWith(".pdf") && isPhase0WhitelistedPdfUrl(u));
  });

  if (pdfHits.length === 0) {
    if (anyPdfLike.length > 0) {
      throw new Error(
        `[phase0] Feed 检索到了 PDF，但域名不在白名单（雪球/同花顺/巨潮）。${PHASE0_DISCOVERY_HINT}`,
      );
    }
    throw new Error(
      `[phase0] Feed 检索未找到符合白名单（雪球/同花顺/巨潮）的 PDF 年报链接。${PHASE0_DISCOVERY_HINT}`,
    );
  }

  pdfHits.sort((a, b) => scoreHit(b, year, cat) - scoreHit(a, year, cat));

  const best = pdfHits[0]?.url?.trim();
  if (!best) {
    throw new Error(`[phase0] 无法选定 PDF 链接。${PHASE0_DISCOVERY_HINT}`);
  }

  return best;
}
