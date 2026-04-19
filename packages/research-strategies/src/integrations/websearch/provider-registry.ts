import type { ResolvedWebSearchConfig } from "./config.js";
import { tryResolveWebSearchConfig } from "./config.js";
import type { WebSearchProvider } from "./provider-adapter.js";
import { VolcWebSearchProvider } from "./volc-client.js";

export function createWebSearchProvider(cfg: ResolvedWebSearchConfig): WebSearchProvider {
  if (cfg.providerId === "volc") {
    return new VolcWebSearchProvider(cfg);
  }
  throw new Error(`Unsupported WEB_SEARCH_PROVIDER: ${cfg.providerId}`);
}

/**
 * 若未配置 API Key 或未启用，返回 `null`（调用方走 Feed 兜底）。
 */
export function tryGetWebSearchProviderFromEnv(): WebSearchProvider | null {
  const cfg = tryResolveWebSearchConfig();
  if (!cfg.enabled) return null;
  return new VolcWebSearchProvider(cfg);
}

export function getResolvedWebSearchConfigForProvider(): ResolvedWebSearchConfig | null {
  const cfg = tryResolveWebSearchConfig();
  return cfg.enabled ? cfg : null;
}
