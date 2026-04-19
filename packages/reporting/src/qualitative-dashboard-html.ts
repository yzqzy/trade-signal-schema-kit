/**
 * 发布级「定性 / 商业分析」Markdown → 独立预览 HTML（内嵌 CSS）。
 * 解析器兼容：`#` 标题、列表元信息、`## D1~D6`、`## 发布级结构化参数` 下 Markdown 表。
 */

export interface QualitativeDashboardModel {
  title: string;
  code: string;
  company: string;
  verdict: string;
  kpiRows: Array<{ label: string; value: string }>;
  dimensionCards: Array<{ id: string; title: string; excerpt: string }>;
  paramRows: Array<{ key: string; value: string; notes?: string }>;
  contractRows: {
    cycle: Array<{ key: string; value: string }>;
    peers: Array<{ key: string; value: string }>;
    governance: Array<{ key: string; value: string }>;
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function firstLine(text: string): string {
  const t = text.trim();
  const line =
    t
      .split(/\r?\n/)
      .find((l) => {
        const trimmed = l.trim();
        if (!trimmed) return false;
        if (/^#{1,6}\s/.test(trimmed)) return false;
        if (/^\|/.test(trimmed)) return false;
        return true;
      }) ?? "";
  return line.replace(/^>\s*/, "").replace(/^\-\s*/, "").replace(/\*\*/g, "").trim().slice(0, 280);
}

/** 拆分为二级标题区块（保留 heading 原文） */
function splitH2Sections(markdown: string): Array<{ heading: string; body: string }> {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<{ heading: string; body: string[] }> = [];
  let cur: { heading: string; body: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      if (cur) sections.push(cur);
      cur = { heading: m[1]!.trim(), body: [] };
    } else if (cur) cur.body.push(line);
  }
  if (cur) sections.push(cur);
  return sections.map((s) => ({ heading: s.heading, body: s.body.join("\n").trim() }));
}

/** 从 Markdown 表格解析为行对象（首行表头） */
function parseMarkdownTable(sectionBody: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  const tableLines = sectionBody.split(/\r?\n/).filter((l) => l.includes("|"));
  if (tableLines.length < 2) return rows;
  const parseCells = (line: string): string[] =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const headerCells = parseCells(tableLines[0]!).filter(Boolean);
  if (headerCells.length === 0) return rows;
  const sep = tableLines[1] ?? "";
  if (!/^\|?[\s:-|]+\|?$/.test(sep)) {
    // 可能没有分隔行，尝试直接解析数据行
  }
  const dataStart = /^\|?[\s:-|]+\|?$/.test(sep) ? 2 : 1;
  for (let i = dataStart; i < tableLines.length; i += 1) {
    const cells = parseCells(tableLines[i]!);
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (cells.length === 0) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headerCells.length; j += 1) {
      row[headerCells[j]!] = cells[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

const KPI_LABELS: Record<string, string> = {
  moat_rating: "护城河评分",
  industry_cyclicality: "行业周期属性",
  industry_cycle_position: "周期位置",
  peer_pool_size: "同业池样本",
  governance_event_count: "治理事件数",
  governance_high_severity_count: "高严重事件",
};

const PREFERRED_KPI_KEYS = [
  "moat_rating",
  "industry_cyclicality",
  "industry_cycle_position",
  "peer_pool_size",
  "governance_event_count",
  "governance_high_severity_count",
] as const;

function pickContractRows(
  rows: Array<{ key: string; value: string }>,
  prefixes: string[],
): Array<{ key: string; value: string }> {
  return rows.filter((r) => prefixes.some((p) => r.key.startsWith(p)));
}

/**
 * 从 `qualitative_d1_d6.md` 或带六维标题的 Markdown 构建 dashboard 模型。
 */
export function parseQualitativeMarkdownForDashboard(markdown: string): QualitativeDashboardModel {
  const title =
    markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "商业分析定性报告";
  const code = markdown.match(/^-\s*股票代码[：:]\s*(\S+)/m)?.[1]?.trim() ?? "—";
  const company = markdown.match(/^-\s*公司[：:]\s*(.+)$/m)?.[1]?.trim() ?? "—";
  const sections = splitH2Sections(markdown);

  const dimSections = sections.filter((s) => /^D[1-6]\b/.test(s.heading));
  const dimensionCards = dimSections.map((s) => ({
    id: s.heading.match(/^(D[1-6])/)?.[1] ?? s.heading.slice(0, 2),
    title: s.heading,
    excerpt: firstLine(s.body) || "（待补全）",
  }));

  const paramSection = sections.find((s) =>
    s.heading.includes("发布级结构化参数"),
  );
  const rawRows = paramSection ? parseMarkdownTable(paramSection.body) : [];
  const paramRows = rawRows.map((r) => ({
    key: r.schema_key ?? r["键"] ?? r["key"] ?? Object.values(r)[0] ?? "",
    value: r.value ?? r["值"] ?? Object.values(r)[1] ?? "—",
    notes: r.notes ?? r["说明"] ?? Object.values(r)[2],
  }));

  const kpiRows: Array<{ label: string; value: string }> = [];
  const paramMap = new Map(paramRows.map((r) => [r.key, r.value || "—"]));
  for (const key of PREFERRED_KPI_KEYS) {
    const value = paramMap.get(key);
    if (!value || value === "—") continue;
    kpiRows.push({ label: KPI_LABELS[key] ?? key, value });
    if (kpiRows.length >= 6) break;
  }
  if (kpiRows.length < 6) {
    for (const r of paramRows) {
      if (kpiRows.length >= 6) break;
      if (!r.key || r.key === "schema_key") continue;
      if (PREFERRED_KPI_KEYS.includes(r.key as (typeof PREFERRED_KPI_KEYS)[number])) continue;
      kpiRows.push({ label: KPI_LABELS[r.key] ?? r.key, value: r.value || "—" });
    }
  }
  if (kpiRows.length === 0) {
    kpiRows.push(
      { label: "股票代码", value: code },
      { label: "公司", value: company },
      { label: "维度数", value: String(dimensionCards.length) },
    );
  }

  const verdict =
    markdown.match(/\*\*一句话结论\*\*[：:]\s*(.+)/)?.[1]?.trim() ??
    "定性终稿请在 Claude Code 会话中定稿；本页为工程预览。";

  const simpleParamRows = paramRows.map((r) => ({ key: r.key, value: r.value || "—" }));
  return {
    title,
    code,
    company,
    verdict,
    kpiRows,
    dimensionCards,
    paramRows,
    contractRows: {
      cycle: pickContractRows(simpleParamRows, ["industry_"]),
      peers: pickContractRows(simpleParamRows, ["peer_"]),
      governance: pickContractRows(simpleParamRows, ["governance_"]),
    },
  };
}

const DASHBOARD_CSS = `
:root { color-scheme: light dark; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; background: #0f1419; color: #e7ecf3; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 28px 20px 48px; }
header { margin-bottom: 24px; }
h1 { font-size: 1.55rem; margin: 0 0 8px; letter-spacing: 0.02em; }
.meta { opacity: 0.78; font-size: 0.9rem; }
.verdict { margin-top: 16px; padding: 14px 16px; border-radius: 10px; background: linear-gradient(120deg, #1c2a3a, #243447); border: 1px solid #2d3f55; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin: 22px 0; }
.kpi { background: #151d27; border: 1px solid #243041; border-radius: 10px; padding: 12px 14px; }
.kpi .l { font-size: 0.75rem; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.06em; }
.kpi .v { font-size: 1.05rem; margin-top: 6px; font-weight: 600; }
.dim-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin: 18px 0 28px; }
.dim { background: #121922; border: 1px solid #1f2a3a; border-radius: 10px; padding: 12px 14px; }
.dim .tag { display: inline-block; font-size: 0.72rem; padding: 2px 8px; border-radius: 999px; background: #1e3a5f; color: #b9dcff; margin-bottom: 8px; }
.dim h3 { margin: 0; font-size: 0.95rem; }
.dim p { margin: 8px 0 0; font-size: 0.85rem; opacity: 0.85; line-height: 1.45; }
details.panel { margin-top: 12px; background: #121922; border: 1px solid #1f2a3a; border-radius: 10px; padding: 4px 12px 12px; }
details.panel summary { cursor: pointer; font-weight: 600; padding: 10px 0; }
.contract-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; margin-top: 10px; }
.contract-card { background: #111a24; border: 1px solid #223244; border-radius: 10px; padding: 10px 12px; }
.contract-card h4 { margin: 0 0 8px; font-size: 0.9rem; }
.contract-card ul { margin: 0; padding-left: 18px; }
.contract-card li { margin: 4px 0; font-size: 0.82rem; }
table.params { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
table.params th, table.params td { border-bottom: 1px solid #243041; padding: 8px 6px; text-align: left; }
table.params th { color: #9db2ce; font-weight: 500; }
footer { margin-top: 32px; font-size: 0.78rem; opacity: 0.55; }
`;

export function renderQualitativeDashboardHtml(
  model: QualitativeDashboardModel,
  opts?: { embedCss?: boolean },
): string {
  const embed = opts?.embedCss !== false;
  const kpiHtml = model.kpiRows
    .map(
      (k) =>
        `<div class="kpi"><div class="l">${escapeHtml(k.label)}</div><div class="v">${escapeHtml(k.value)}</div></div>`,
    )
    .join("");
  const dimHtml = model.dimensionCards
    .map(
      (d) => `<div class="dim"><span class="tag">${escapeHtml(d.id)}</span><h3>${escapeHtml(d.title)}</h3><p>${escapeHtml(d.excerpt)}</p></div>`,
    )
    .join("");
  const paramTableRows = model.paramRows
    .filter((r) => r.key && r.key !== "schema_key")
    .map(
      (r) =>
        `<tr><td><code>${escapeHtml(r.key)}</code></td><td>${escapeHtml(r.value)}</td><td>${escapeHtml(r.notes ?? "")}</td></tr>`,
    )
    .join("");
  const renderContractItems = (rows: Array<{ key: string; value: string }>, emptyText: string): string => {
    if (rows.length === 0) return `<li>${escapeHtml(emptyText)}</li>`;
    return rows
      .map((r) => `<li><code>${escapeHtml(r.key)}</code>: ${escapeHtml(r.value)}</li>`)
      .join("");
  };

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(model.title)}</title>`,
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    embed ? `<style>${DASHBOARD_CSS}</style>` : "",
    "</head>",
    "<body>",
    '<div class="wrap">',
    "<header>",
    `<h1>${escapeHtml(model.title)}</h1>`,
    `<div class="meta">${escapeHtml(model.code)} · ${escapeHtml(model.company)}</div>`,
    `<div class="verdict">${escapeHtml(model.verdict)}</div>`,
    "</header>",
    '<section aria-label="KPI"><div class="kpi-grid">',
    kpiHtml,
    "</div></section>",
    '<section aria-label="dimensions"><div class="dim-grid">',
    dimHtml,
    "</div></section>",
    '<details class="panel" open>',
    "<summary>P2/P3/P4 结构化契约快照</summary>",
    '<div class="contract-grid">',
    `<div class="contract-card"><h4>P2 行业周期</h4><ul>${renderContractItems(model.contractRows.cycle, "未解析到行业周期键")}</ul></div>`,
    `<div class="contract-card"><h4>P3 同业可比池</h4><ul>${renderContractItems(model.contractRows.peers, "未解析到同业池键")}</ul></div>`,
    `<div class="contract-card"><h4>P4 治理负面事件</h4><ul>${renderContractItems(model.contractRows.governance, "未解析到治理事件键")}</ul></div>`,
    "</div>",
    "</details>",
    '<details class="panel" open>',
    "<summary>结构化参数（output_schema 兼容）</summary>",
    "<table class=\"params\"><thead><tr><th>schema_key</th><th>value</th><th>notes</th></tr></thead><tbody>",
    paramTableRows ||
      "<tr><td colspan=\"3\">（未解析到参数表；请确认存在「## 发布级结构化参数」小节）</td></tr>",
    "</tbody></table>",
    "</details>",
    '<footer>trade-signal-schema-kit · report-to-html --mode dashboard · 本地独立预览</footer>',
    "</div>",
    "</body>",
    "</html>",
  ].join("\n");
}

/** 一步：Markdown 字符串 → 完整 HTML */
export function qualitativeMarkdownToDashboardHtml(markdown: string): string {
  return renderQualitativeDashboardHtml(parseQualitativeMarkdownForDashboard(markdown), {
    embedCss: true,
  });
}
