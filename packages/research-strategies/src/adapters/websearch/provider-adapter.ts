import type { WebSearchProviderInput, WebSearchResult } from "./types.js";

/** 可插拔 WebSearch Provider（phase1b 仅依赖此接口） */
export interface WebSearchProvider {
  readonly id: string;
  search(input: WebSearchProviderInput): Promise<WebSearchResult[]>;
}
