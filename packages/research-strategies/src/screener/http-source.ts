export interface HttpScreenerSourceOptions {
  baseUrl: string;
  apiKey?: string;
  apiBasePath?: string;
}

export async function fetchScreenerUniverseFromHttp(
  options: HttpScreenerSourceOptions,
  market: "CN_A" | "HK",
): Promise<unknown[]> {
  const base = options.baseUrl.replace(/\/+$/, "");
  const apiBasePath = (options.apiBasePath ?? "/api/v1").replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (options.apiKey) headers["x-api-key"] = options.apiKey;

  const candidates = [
    `${base}${apiBasePath}/stock/screener/universe?market=${encodeURIComponent(market)}`,
    `${base}${apiBasePath}/stock/screener?market=${encodeURIComponent(market)}`,
  ];

  for (const url of candidates) {
    const resp = await fetch(url, { headers });
    if (!resp.ok) continue;
    const payload = (await resp.json()) as unknown;
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object") {
      const data = (payload as { data?: unknown }).data;
      if (Array.isArray(data)) return data;
    }
  }
  return [];
}
