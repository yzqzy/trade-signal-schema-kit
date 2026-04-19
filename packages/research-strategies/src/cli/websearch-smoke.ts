#!/usr/bin/env node

import { initCliEnv } from "../lib/init-cli-env.js";
import { requireWebSearchConfigForSmoke } from "../adapters/websearch/config.js";
import { VolcWebSearchProvider } from "../adapters/websearch/volc-client.js";
import { applyBasicWebSearchGates } from "../adapters/websearch/result-gates.js";

function printUsage(): void {
  console.error(`Usage: websearch-smoke --query "<text>" [--limit N] [--time-range OneYear|1y|...]

Reads WEB_SEARCH_* from .env (see repo root .env.example).
`);
}

function parseArgs(argv: string[]): { query: string; limit: number; timeRange?: string } {
  const out: { query?: string; limit: number; timeRange?: string } = { limit: 5 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    }
    if (a === "--query" || a === "-q") {
      out.query = argv[++i]?.trim();
      continue;
    }
    if (a === "--limit" || a === "-l") {
      out.limit = Number.parseInt(argv[++i] ?? "5", 10);
      continue;
    }
    if (a === "--time-range" || a === "-t") {
      out.timeRange = argv[++i]?.trim();
      continue;
    }
  }
  const query = out.query?.trim() ?? "";
  if (!query) {
    printUsage();
    throw new Error("Missing --query");
  }
  return { query, limit: Number.isFinite(out.limit) && out.limit > 0 ? out.limit : 5, timeRange: out.timeRange };
}

async function main(): Promise<void> {
  initCliEnv();
  const { query, limit, timeRange } = parseArgs(process.argv.slice(2));
  const cfg = requireWebSearchConfigForSmoke();
  const provider = new VolcWebSearchProvider(cfg);
  const raw = await provider.search({
    query,
    limit,
    timeRange: timeRange ?? cfg.timeRange,
    searchType: "web",
  });
  const gated = applyBasicWebSearchGates(raw, limit);
  process.stdout.write(
    JSON.stringify(
      {
        provider: provider.id,
        query,
        limit,
        timeRange: timeRange ?? cfg.timeRange,
        count: gated.items.length,
        gateNotes: gated.notes,
        results: gated.items,
      },
      null,
      2,
    ),
  );
  process.stdout.write("\n");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
