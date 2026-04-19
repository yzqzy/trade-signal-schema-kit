import type { WebSearchResult } from "./types.js";

export type WebSearchGateResult = {
  items: WebSearchResult[];
  /** 可审计的轻量说明 */
  notes: string[];
};

function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function parseableDate(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  const t = Date.parse(raw);
  return Number.isFinite(t);
}

/**
 * P1 基础门禁：URL 合法、去重、发布时间可解析性标注。
 */
export function applyBasicWebSearchGates(results: WebSearchResult[], limit: number): WebSearchGateResult {
  const notes: string[] = [];
  const seen = new Set<string>();
  const out: WebSearchResult[] = [];

  for (const r of results) {
    const url = (r.url ?? "").trim();
    if (!url || !isValidHttpUrl(url)) {
      notes.push("丢弃：无效 URL");
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);

    let publishedAt = r.publishedAt?.trim();
    let snippet = r.snippet;
    if (publishedAt && !parseableDate(publishedAt)) {
      notes.push("标注：部分发布时间不可解析，已清空 publishedAt");
      publishedAt = undefined;
    }
    if (!publishedAt && (r.publishedAt?.trim() ?? "")) {
      snippet = [snippet?.trim(), "[时间字段不可解析]"].filter(Boolean).join(" ").trim();
    }

    out.push({
      ...r,
      url,
      publishedAt: publishedAt || undefined,
      snippet: snippet || undefined,
    });
    if (out.length >= limit) break;
  }

  if (out.length === 0 && results.length > 0) {
    notes.push("门禁后无有效结果（可能全部为无效 URL）");
  }

  return { items: out, notes };
}
