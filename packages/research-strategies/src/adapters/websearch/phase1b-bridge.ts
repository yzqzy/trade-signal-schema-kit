import type { ResolvedWebSearchConfig } from "./config.js";
import { buildPhase1bWebSearchQueries } from "./query-templates.js";
import { applyBasicWebSearchGates } from "./result-gates.js";
import type { WebSearchProvider } from "./provider-adapter.js";
import type { Phase1BEvidence, Phase1BInput, Phase1BRetrievalDiagnostics } from "../../steps/phase1b/types.js";
import { WebSearchError } from "./types.js";

function toPhase1bEvidence(hit: { title: string; url: string; snippet?: string; publishedAt?: string; source?: string }): Phase1BEvidence {
  return {
    title: hit.title,
    url: hit.url,
    snippet: hit.snippet,
    publishedAt: hit.publishedAt,
    source: hit.source ?? "web",
  };
}

/**
 * 对单条 Phase1B 条目尝试 WebSearch（primary → fallback），失败不抛错，返回空证据 + 诊断。
 */
export async function tryWebSearchForPhase1bItem(
  provider: WebSearchProvider,
  resolvedCfg: ResolvedWebSearchConfig,
  input: Phase1BInput,
  item: string,
): Promise<{ evidences: Phase1BEvidence[]; diagnostics: Phase1BRetrievalDiagnostics }> {
  const { primary, fallback } = buildPhase1bWebSearchQueries(item, input);
  const tried: string[] = [];
  const gateNotesAll: string[] = [];
  const limit = Math.min(50, Math.max(1, input.limitPerQuery ?? resolvedCfg.maxResults));
  let lastFailure: string | undefined;

  for (const q of [...primary, ...fallback]) {
    const query = q.trim();
    if (!query) continue;
    tried.push(query);
    try {
      const raw = await provider.search({
        query,
        limit,
        timeRange: resolvedCfg.timeRange,
        searchType: "web",
      });
      const gated = applyBasicWebSearchGates(raw, limit);
      if (gated.notes.length) gateNotesAll.push(...gated.notes);
      if (gated.items.length > 0) {
        return {
          evidences: gated.items.map(toPhase1bEvidence),
          diagnostics: {
            webSearchUsed: true,
            webSearchProviderId: provider.id,
            webSearchQueriesTried: [...tried],
            ...(gated.notes.length ? { webSearchGateNotes: Array.from(new Set(gated.notes)) } : {}),
          },
        };
      }
    } catch (e) {
      if (e instanceof WebSearchError) {
        lastFailure = `${e.code}${e.upstreamCode ? `(${e.upstreamCode})` : ""}: ${e.message}`;
      } else {
        lastFailure = e instanceof Error ? e.message : String(e);
      }
    }
  }

  return {
    evidences: [],
    diagnostics: {
      webSearchUsed: true,
      webSearchProviderId: provider.id,
      webSearchQueriesTried: tried,
      webSearchFailureReason: lastFailure ?? "EMPTY_RESULT: 全部查询无有效命中（或门禁后为空）",
      ...(gateNotesAll.length ? { webSearchGateNotes: Array.from(new Set(gateNotesAll)) } : {}),
    },
  };
}
