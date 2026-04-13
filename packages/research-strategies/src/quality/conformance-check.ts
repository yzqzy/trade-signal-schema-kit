#!/usr/bin/env node

import { strict as assert } from "node:assert";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = {
  instrument: {
    code: "600887",
    secucode: "600887.SH",
    name: "伊利股份",
    currency: "CNY",
    lotSize: 100,
    tickSize: 0.01,
  },
  quote: {
    code: "600887",
    newPrice: 28.5,
    changeRate: 1.2,
    volume: 123456,
    quoteTime: "2026-01-01T10:00:00.000Z",
  },
  klines: {
    code: "600887",
    klines: ["2026-01-01,28,28.5,29,27.5,123456"],
  },
  financial: {
    code: "600887",
    period: "2024",
    revenue: 126_000,
    netProfit: 9_500,
    operatingCashFlow: 13_000,
    totalAssets: 160_000,
    totalLiabilities: 90_000,
  },
  actions: [
    {
      code: "600887",
      actionType: "dividend",
      exDate: "2025-06-30",
      cashDividendPerShare: 1.8,
    },
  ],
  calendar: [
    {
      market: "CN_A",
      date: "2026-01-02",
      isTradingDay: true,
      sessionType: "full",
    },
  ],
} as const;

function jsonResponse(data: unknown): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function installHttpFetchMock(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: URL | RequestInfo, _init?: RequestInit) => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl);
    const pathname = url.pathname;
    if (pathname.includes("/stock/detail/")) return jsonResponse(FIXTURE.instrument);
    if (pathname.endsWith("/stock/indicator/realtime/600887")) return jsonResponse(FIXTURE.quote);
    if (pathname.endsWith("/stock/kline")) return jsonResponse(FIXTURE.klines);
    if (pathname.endsWith("/stock/indicator/financial/600887")) return jsonResponse(FIXTURE.financial);
    if (pathname.endsWith("/stock/corporate-actions")) return jsonResponse(FIXTURE.actions);
    if (pathname.endsWith("/market/trading-calendar")) return jsonResponse(FIXTURE.calendar);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function mockMcpCall(toolName: string): Promise<unknown> {
  if (toolName === "get_stock_info") return { detail: FIXTURE.instrument };
  if (toolName === "get_stock_quote") return FIXTURE.quote;
  if (toolName === "get_stock_kline") return FIXTURE.klines;
  if (toolName === "get_stock_financial") return { financial: FIXTURE.financial };
  if (toolName === "get_stock_corporate_actions") return FIXTURE.actions;
  if (toolName === "get_trading_calendar") return FIXTURE.calendar;
  throw new Error(`Unsupported tool in fixture: ${toolName}`);
}

async function main(): Promise<void> {
  const root = path.resolve(process.cwd(), "../..");
  const httpProviderModulePath = path.join(
    root,
    "packages/provider-http/dist/index.js",
  );
  const mcpProviderModulePath = path.join(
    root,
    "packages/provider-mcp/dist/index.js",
  );
  const { FeedHttpProvider } = (await import(pathToFileURL(httpProviderModulePath).href)) as {
    FeedHttpProvider: new (...args: any[]) => any;
  };
  const { FeedMcpProvider } = (await import(pathToFileURL(mcpProviderModulePath).href)) as {
    FeedMcpProvider: new (...args: any[]) => any;
  };

  const restore = installHttpFetchMock();
  try {
    const http = new FeedHttpProvider({ baseUrl: "http://fixture-feed.local", apiBasePath: "/api/v1" });
    const mcp = new FeedMcpProvider({ serverName: "fixture", callTool: mockMcpCall });

    const [hInstrument, mInstrument] = await Promise.all([
      http.getInstrument("600887"),
      mcp.getInstrument("600887"),
    ]);
    assert.deepEqual(hInstrument, mInstrument, "instrument mismatch");

    const [hQuote, mQuote] = await Promise.all([http.getQuote("600887"), mcp.getQuote("600887")]);
    assert.deepEqual(hQuote, mQuote, "quote mismatch");

    const [hKlines, mKlines] = await Promise.all([
      http.getKlines({ code: "600887", period: "day" }),
      mcp.getKlines({ code: "600887", period: "day" }),
    ]);
    assert.deepEqual(hKlines, mKlines, "klines mismatch");

    const [hFinancial, mFinancial] = await Promise.all([
      http.getFinancialSnapshot("600887", "2024"),
      mcp.getFinancialSnapshot("600887", "2024"),
    ]);
    assert.deepEqual(hFinancial, mFinancial, "financial mismatch");

    const [hActions, mActions] = await Promise.all([
      http.getCorporateActions("600887", "2024-01-01", "2024-12-31"),
      mcp.getCorporateActions("600887", "2024-01-01", "2024-12-31"),
    ]);
    assert.deepEqual(hActions, mActions, "corporate actions mismatch");

    const [hCalendar, mCalendar] = await Promise.all([
      http.getTradingCalendar("CN_A", "2026-01-01", "2026-01-31"),
      mcp.getTradingCalendar("CN_A", "2026-01-01", "2026-01-31"),
    ]);
    assert.deepEqual(hCalendar, mCalendar, "trading calendar mismatch");
  } finally {
    restore();
  }

  console.log("[quality] conformance check passed (HTTP/MCP semantic parity on fixture)");
}

void main();
