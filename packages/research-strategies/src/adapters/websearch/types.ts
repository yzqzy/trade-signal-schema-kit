/** 统一 WebSearch 结果（跨 Provider） */
export type WebSearchResult = {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  source?: string;
  score?: number;
};

export type WebSearchSearchType = "web" | "image";

export type WebSearchProviderInput = {
  query: string;
  limit: number;
  /** 火山：OneDay | OneWeek | OneMonth | OneYear | YYYY-MM-DD..YYYY-MM-DD */
  timeRange?: string;
  searchType?: WebSearchSearchType;
};

export type WebSearchErrorCode =
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "EMPTY_RESULT"
  | "UNKNOWN";

export class WebSearchError extends Error {
  readonly code: WebSearchErrorCode;
  readonly providerId: string;
  readonly upstreamCode?: string;
  readonly upstreamMessage?: string;
  readonly httpStatus?: number;

  constructor(
    providerId: string,
    code: WebSearchErrorCode,
    message: string,
    opts?: { upstreamCode?: string; upstreamMessage?: string; httpStatus?: number },
  ) {
    super(message);
    this.name = "WebSearchError";
    this.providerId = providerId;
    this.code = code;
    this.upstreamCode = opts?.upstreamCode;
    this.upstreamMessage = opts?.upstreamMessage;
    this.httpStatus = opts?.httpStatus;
  }
}
