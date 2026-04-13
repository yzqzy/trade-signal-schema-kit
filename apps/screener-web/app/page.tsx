"use client";

import { useState } from "react";

type ScreenerResponse = {
  passedCount: number;
  tier1Count: number;
  totalUniverse: number;
  universeSource?: "feed_http" | "mock_fallback";
  universeEndpoint?: string;
  results: Array<{
    code: string;
    name: string;
    totalScore: number;
    decision: string;
    confidence?: string;
    screenerScore: number;
    reportScore?: number;
    vetoReason?: string;
    composedReport?: {
      decision?: string;
      confidence?: string;
      sections?: Array<{ heading: string; content: string }>;
    };
  }>;
};

export default function Page() {
  const [market, setMarket] = useState<"CN_A" | "HK">("CN_A");
  const [mode, setMode] = useState<"standalone" | "composed">("standalone");
  const [output, setOutput] = useState<ScreenerResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (): Promise<void> => {
    setLoading(true);
    try {
      const resp = await fetch("/api/screener/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ market, mode }),
      });
      const json = (await resp.json()) as ScreenerResponse;
      setOutput(json);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>Screener Web MVP</h1>
      <p>支持独立筛选和组合财报流程两种模式。</p>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <select value={market} onChange={(e) => setMarket(e.target.value as "CN_A" | "HK")}>
          <option value="CN_A">CN_A</option>
          <option value="HK">HK</option>
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value as "standalone" | "composed")}>
          <option value="standalone">standalone</option>
          <option value="composed">composed</option>
        </select>
        <button onClick={() => void run()} disabled={loading}>{loading ? "运行中..." : "运行筛选"}</button>
      </div>
      {output ? (
        <section>
          <p>Universe={output.totalUniverse} Tier1={output.tier1Count} Passed={output.passedCount}</p>
          <p>
            DataSource={output.universeSource ?? "unknown"}
            {output.universeEndpoint ? ` | Endpoint=${output.universeEndpoint}` : ""}
          </p>
          {mode === "composed" ? (() => {
            const topComposed = output.results.find((r) => r.composedReport);
            if (!topComposed?.composedReport) return null;
            const checkpoint = topComposed.composedReport.sections?.[0]?.content ?? "无 checkpoint";
            return (
              <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 16, background: "#fafafa" }}>
                <h3 style={{ margin: "0 0 8px 0" }}>Phase3 组合模式摘要卡</h3>
                <p style={{ margin: 0 }}>
                  标的：{topComposed.code} {topComposed.name} | 决策：{topComposed.composedReport.decision ?? "-"} | 置信度：{topComposed.composedReport.confidence ?? "-"}
                </p>
                <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{checkpoint}</pre>
              </div>
            );
          })() : null}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th>code</th><th>name</th><th>screener</th><th>report</th><th>total</th><th>decision</th><th>confidence</th></tr></thead>
            <tbody>
              {output.results.slice(0, 20).map((r) => (
                <tr key={r.code}>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td>{r.screenerScore.toFixed(4)}</td>
                  <td>{(r.reportScore ?? 0).toFixed(4)}</td>
                  <td>{r.totalScore.toFixed(4)}</td>
                  <td>{r.decision}</td>
                  <td>{r.confidence ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
