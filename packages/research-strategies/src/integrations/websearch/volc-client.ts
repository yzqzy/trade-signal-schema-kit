import type { ResolvedWebSearchConfig } from "./config.js";
import { mapHttpStatusToWebSearchCode } from "./config.js";
import type { WebSearchProvider } from "./provider-adapter.js";
import type { WebSearchProviderInput, WebSearchResult } from "./types.js";
import { WebSearchError } from "./types.js";

const TRAFFIC_TAG_HEADER = "X-Traffic-Tag";
const TRAFFIC_TAG_VALUE = "skill_web_search_common";

type VolcWebResultItem = {
  Title?: string;
  Url?: string;
  SiteName?: string;
  Summary?: string;
  Snippet?: string;
  PublishedTime?: string;
  PublishTime?: string;
  Date?: string;
};

type VolcSearchResponse = {
  Result?: {
    ResultCount?: number;
    WebResults?: VolcWebResultItem[];
  };
  ResponseMetadata?: {
    Error?: { Code?: string | number; Message?: string };
  };
};

function normalizeVolcItem(item: VolcWebResultItem): WebSearchResult | undefined {
  const url = (item.Url ?? "").trim();
  const title = (item.Title ?? "").trim() || "未命名来源";
  if (!url) return undefined;
  const snippet = (item.Summary ?? item.Snippet ?? "").trim() || undefined;
  const publishedAt =
    (item.PublishedTime ?? item.PublishTime ?? item.Date ?? "").trim() || undefined;
  const source = (item.SiteName ?? "").trim() || undefined;
  return { title, url, snippet, publishedAt, source };
}

export class VolcWebSearchProvider implements WebSearchProvider {
  readonly id = "volc";

  constructor(private readonly cfg: ResolvedWebSearchConfig) {}

  async search(input: WebSearchProviderInput): Promise<WebSearchResult[]> {
    const q = input.query.trim();
    if (!q) return [];
    if (q.length > 100) {
      throw new WebSearchError(this.id, "INVALID_REQUEST", "Query 超过 100 字符，请精简后重试。");
    }

    const searchType = input.searchType ?? "web";
    const count = Math.min(50, Math.max(1, input.limit || this.cfg.maxResults));

    const body: Record<string, unknown> = {
      Query: q,
      SearchType: searchType,
      Count: count,
    };
    if (searchType === "web") {
      body.NeedSummary = true;
      const tr = (input.timeRange ?? this.cfg.timeRange).trim();
      if (tr) body.TimeRange = tr;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    let response: Response;
    try {
      response = await fetch(this.cfg.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TRAFFIC_TAG_HEADER]: TRAFFIC_TAG_VALUE,
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      throw new WebSearchError(
        this.id,
        aborted ? "TIMEOUT" : "UPSTREAM_UNAVAILABLE",
        aborted ? `请求超时（${this.cfg.timeoutMs}ms）` : `网络错误：${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new WebSearchError(
        this.id,
        "UPSTREAM_UNAVAILABLE",
        `无法解析响应 JSON（HTTP ${response.status}）`,
        { httpStatus: response.status },
      );
    }

    const data = json as VolcSearchResponse;
    const metaErr = data.ResponseMetadata?.Error;
    if (metaErr?.Code != null || metaErr?.Message) {
      const code = String(metaErr.Code ?? "");
      const msg = String(metaErr.Message ?? "上游错误");
      const lower = `${code} ${msg}`.toLowerCase();
      let mapped = mapHttpStatusToWebSearchCode(response.ok ? 400 : response.status);
      if (lower.includes("invalid") && lower.includes("key")) mapped = "AUTH_FAILED";
      if (code === "10400" || lower.includes("10400")) mapped = "INVALID_REQUEST";
      if (
        String(code).includes("429") ||
        lower.includes("429") ||
        lower.includes("flowlimit") ||
        lower.includes("100018") ||
        lower.includes("700429")
      ) {
        mapped = "RATE_LIMITED";
      }
      throw new WebSearchError(this.id, mapped, `Volc WebSearch API 错误 [${code}]: ${msg}`, {
        upstreamCode: code,
        upstreamMessage: msg,
        httpStatus: response.status,
      });
    }

    if (!response.ok) {
      throw new WebSearchError(
        this.id,
        mapHttpStatusToWebSearchCode(response.status),
        `HTTP ${response.status}: ${JSON.stringify(data).slice(0, 500)}`,
        { httpStatus: response.status },
      );
    }

    const items = data.Result?.WebResults ?? [];
    return items.map(normalizeVolcItem).filter((x): x is WebSearchResult => Boolean(x));
  }
}
