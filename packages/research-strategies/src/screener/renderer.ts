import type { ScreenerRunOutput } from "./types.js";

function esc(v: string): string {
  return v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderScreenerMarkdown(input: ScreenerRunOutput): string {
  const top = input.results.slice(0, 50);
  const lines = [
    `# Screener Report (${input.market})`,
    "",
    `- mode: ${input.mode}`,
    `- generated_at: ${input.generatedAt}`,
    `- total_universe: ${input.totalUniverse}`,
    `- tier1_count: ${input.tier1Count}`,
    `- passed_count: ${input.passedCount}`,
    "",
    "| code | name | channel | decision | totalScore | screenerScore | reportScore | vetoReason |",
    "|---|---|---|---|---:|---:|---:|---|",
    ...top.map((r) => `| ${r.code} | ${r.name} | ${r.channel} | ${r.decision} | ${r.totalScore.toFixed(4)} | ${r.screenerScore.toFixed(4)} | ${(r.reportScore ?? 0).toFixed(4)} | ${r.vetoReason ?? ""} |`),
  ];
  return `${lines.join("\n")}\n`;
}

export function renderScreenerHtml(input: ScreenerRunOutput): string {
  const rows = input.results
    .slice(0, 50)
    .map((r) => `<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.channel)}</td><td>${esc(r.decision)}</td><td>${r.totalScore.toFixed(4)}</td><td>${r.screenerScore.toFixed(4)}</td><td>${(r.reportScore ?? 0).toFixed(4)}</td><td>${esc(r.vetoReason ?? "")}</td></tr>`)
    .join("");
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>Screener Report</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}</style></head>",
    "<body>",
    `<h1>Screener Report (${esc(input.market)})</h1>`,
    `<p>mode=${esc(input.mode)} | universe=${input.totalUniverse} | tier1=${input.tier1Count} | passed=${input.passedCount}</p>`,
    "<table><thead><tr><th>code</th><th>name</th><th>channel</th><th>decision</th><th>totalScore</th><th>screenerScore</th><th>reportScore</th><th>vetoReason</th></tr></thead><tbody>",
    rows,
    "</tbody></table></body></html>",
  ].join("");
}
