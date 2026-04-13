import { NextResponse } from "next/server";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getUniverseFromFeedOrMock } from "../../../../lib/screener";

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as { market?: "CN_A" | "HK"; mode?: "standalone" | "composed" };
  const market = body.market ?? "CN_A";
  const mode = body.mode ?? "standalone";
  const resolved = await getUniverseFromFeedOrMock(market);
  const pipelinePath = path.join(
    process.cwd(),
    "packages/research-strategies/dist/packages/research-strategies/src/screener/pipeline.js",
  );
  const mod = (await import(pathToFileURL(pipelinePath).href)) as {
    runScreenerPipeline: (input: {
      market: "CN_A" | "HK";
      mode: "standalone" | "composed";
      universe: unknown[];
    }) => Promise<unknown>;
  };
  const result = await mod.runScreenerPipeline({
    market,
    mode,
    universe: resolved.rows,
  });

  const output = result as Record<string, unknown>;
  return NextResponse.json({
    ...output,
    universeSource: resolved.source,
    universeEndpoint: resolved.endpoint,
  });
}
