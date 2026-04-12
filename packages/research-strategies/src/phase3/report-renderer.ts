import type { AnalysisReport } from "@trade-signal/schema-core";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderPhase3Markdown(report: AnalysisReport): string {
  const header = [
    `# ${report.title}`,
    "",
    `- code: ${report.meta.code}`,
    `- schema_version: ${report.meta.schemaVersion}`,
    `- data_source: ${report.meta.dataSource}`,
    `- generated_at: ${report.meta.generatedAt}`,
    `- decision: ${report.decision ?? "watch"}`,
    `- confidence: ${report.confidence ?? "medium"}`,
    "",
  ].join("\n");
  const sections = report.sections.map((s) => `## ${s.heading}\n\n${s.content}`).join("\n\n");
  return `${header}${sections}\n`;
}

export function renderPhase3Html(report: AnalysisReport): string {
  const sections = report.sections
    .map(
      (s) =>
        `<section><h2>${escapeHtml(s.heading)}</h2><pre>${escapeHtml(s.content)}</pre></section>`,
    )
    .join("");
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(report.title)}</title>`,
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;padding:24px;max-width:980px;margin:0 auto}pre{white-space:pre-wrap;line-height:1.5;background:#f7f7f8;padding:12px;border-radius:8px}h1,h2{margin-top:1.2em}</style>",
    "</head>",
    "<body>",
    `<h1>${escapeHtml(report.title)}</h1>`,
    `<p>code: ${escapeHtml(report.meta.code)} | decision: ${escapeHtml(report.decision ?? "watch")} | confidence: ${escapeHtml(report.confidence ?? "medium")}</p>`,
    sections,
    "</body>",
    "</html>",
  ].join("");
}
