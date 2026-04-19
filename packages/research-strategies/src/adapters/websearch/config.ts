import type { WebSearchErrorCode } from "./types.js";
import { WebSearchError } from "./types.js";

const DEFAULT_PROVIDER = "volc";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESULTS = 5;
/** 火山 TimeRange：OneYear（与 setup-guide 一致） */
const DEFAULT_TIME_RANGE = "OneYear";

const VOLC_INTERNAL_URL = "https://open.feedcoopapi.com/search_api/web_search";

export type ResolvedWebSearchConfig = {
  enabled: boolean;
  providerId: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxResults: number;
  /** 透传给火山 API 的 TimeRange */
  timeRange: string;
};

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeTimeRangeForVolc(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v || v === DEFAULT_TIME_RANGE) return "OneYear";
  const map: Record<string, string> = {
    "1y": "OneYear",
    "1Y": "OneYear",
    oneyear: "OneYear",
    "1w": "OneWeek",
    "1W": "OneWeek",
    oneweek: "OneWeek",
    "1m": "OneMonth",
    "1M": "OneMonth",
    onemonth: "OneMonth",
    "1d": "OneDay",
    "1D": "OneDay",
    oneday: "OneDay",
  };
  const mapped = map[v.toLowerCase()] ?? map[v];
  if (mapped) return mapped;
  if (/^(OneDay|OneWeek|OneMonth|OneYear)$/.test(v)) return v;
  if (/^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return "OneYear";
}

/**
 * 解析 WebSearch 环境变量；未配置 API Key 时返回 `enabled: false`（静默降级，不抛错）。
 */
export function tryResolveWebSearchConfig(): ResolvedWebSearchConfig | { enabled: false } {
  const apiKey = process.env.WEB_SEARCH_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return { enabled: false };
  }

  const providerId = (process.env.WEB_SEARCH_PROVIDER?.trim() || DEFAULT_PROVIDER).toLowerCase();
  if (providerId === "none" || providerId === "off" || providerId === "disabled") {
    return { enabled: false };
  }
  /** P1 仅实现 volc；其它 provider 预留 registry，此处不显式启用 */
  if (providerId !== "volc") {
    console.warn(
      `[websearch] WEB_SEARCH_PROVIDER="${providerId}" 在 P1 尚未实现；已跳过 WebSearch（仍可使用 Feed 公告检索）。`,
    );
    return { enabled: false };
  }

  const baseUrl = (process.env.WEB_SEARCH_BASE_URL?.trim() || VOLC_INTERNAL_URL).replace(/\/+$/, "");
  const timeoutMs = parseIntEnv("WEB_SEARCH_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const maxResults = Math.min(50, Math.max(1, parseIntEnv("WEB_SEARCH_MAX_RESULTS", DEFAULT_MAX_RESULTS)));
  const timeRange = normalizeTimeRangeForVolc(process.env.WEB_SEARCH_TIME_RANGE);

  return {
    enabled: true,
    providerId,
    apiKey,
    baseUrl,
    timeoutMs,
    maxResults,
    timeRange,
  };
}

/**
 * 严格校验：用于 smoke CLI；缺 Key 时抛出可读错误。
 */
export function requireWebSearchConfigForSmoke(): ResolvedWebSearchConfig {
  const cfg = tryResolveWebSearchConfig();
  if (!cfg.enabled) {
    const prov = (process.env.WEB_SEARCH_PROVIDER ?? "volc").toLowerCase();
    const key = process.env.WEB_SEARCH_API_KEY?.trim() ?? "";
    if (key && prov !== "volc") {
      throw new WebSearchError(
        prov,
        "INVALID_REQUEST",
        `P1 仅支持 volc；当前 WEB_SEARCH_PROVIDER="${prov}"。请将 WEB_SEARCH_PROVIDER=volc 或移除 Key 以跳过 WebSearch。`,
      );
    }
    throw new WebSearchError(
      prov,
      "AUTH_FAILED",
      "缺少 WEB_SEARCH_API_KEY。请复制仓库根目录 `.env.example` 为 `.env` 并填写联网搜索 API Key。",
    );
  }
  if (cfg.providerId !== "volc") {
    throw new WebSearchError(
      cfg.providerId,
      "INVALID_REQUEST",
      `不支持的 WEB_SEARCH_PROVIDER="${cfg.providerId}"。P1 仅实现 volc；后续可在 registry 注册其它 provider。`,
    );
  }
  return cfg;
}

export function mapHttpStatusToWebSearchCode(status: number): WebSearchErrorCode {
  if (status === 401 || status === 403) return "AUTH_FAILED";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "UPSTREAM_UNAVAILABLE";
  return "UNKNOWN";
}

export const WEB_SEARCH_ENV_DOC = {
  WEB_SEARCH_PROVIDER: `默认 volc；设为 none/off 可关闭 WebSearch`,
  WEB_SEARCH_API_KEY: `火山联网搜索 API Key（见 references/byted-web-search）`,
  WEB_SEARCH_BASE_URL: `可选，默认 ${VOLC_INTERNAL_URL}`,
  WEB_SEARCH_TIMEOUT_MS: `可选，默认 ${DEFAULT_TIMEOUT_MS}`,
  WEB_SEARCH_MAX_RESULTS: `可选，默认 ${DEFAULT_MAX_RESULTS}，最大 50`,
  WEB_SEARCH_TIME_RANGE: `可选，默认 OneYear；支持 OneDay/OneWeek/OneMonth/OneYear 或 1d/1w/1m/1y`,
} as const;
