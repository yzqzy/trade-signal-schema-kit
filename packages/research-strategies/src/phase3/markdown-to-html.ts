/** 轻量 Markdown → 语义化 HTML（标题/段落/列表/表格/代码块/引用/分隔线），供报告浏览 */

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInline(text: string): string {
  const segments: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end === -1) {
        segments.push(escapeHtml(text.slice(i)));
        break;
      }
      segments.push(`<code>${escapeHtml(text.slice(i + 1, end))}</code>`);
      i = end + 1;
      continue;
    }
    if (text.slice(i, i + 2) === "**") {
      const end = text.indexOf("**", i + 2);
      if (end === -1) {
        segments.push(escapeHtml(text.slice(i)));
        break;
      }
      segments.push(`<strong>${escapeHtml(text.slice(i + 2, end))}</strong>`);
      i = end + 2;
      continue;
    }
    const rest = text.slice(i);
    const idxCode = rest.indexOf("`");
    const idxBold = rest.indexOf("**");
    const candidates = [idxCode, idxBold].filter((n) => n >= 0);
    const next = candidates.length > 0 ? Math.min(...candidates) : -1;
    const jump = next === -1 ? rest.length : next;
    segments.push(escapeHtml(rest.slice(0, jump)));
    i += jump;
  }
  return segments.join("");
}

function isTableDivider(line: string): boolean {
  const cells = line
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function parseTableRow(line: string): string[] {
  const raw = line.trim();
  const core = raw.replace(/^\|/, "").replace(/\|$/, "");
  return core.split("|").map((c) => c.trim());
}

export type RenderMarkdownHtmlOptions = {
  /** 浏览器标题 */
  documentTitle?: string;
  /** 在正文前插入目录（基于 ## / ###） */
  toc?: boolean;
};

export function renderMarkdownToSemanticHtml(markdown: string, options: RenderMarkdownHtmlOptions = {}): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const documentTitle = options.documentTitle ?? "Report";
  const wantToc = Boolean(options.toc);

  const tocEntries: { level: number; text: string; id: string }[] = [];
  let slugCounts = new Map<string, number>();

  const slugify = (raw: string): string => {
    const base = raw
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "section";
    const n = (slugCounts.get(base) ?? 0) + 1;
    slugCounts.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };

  type Block =
    | { type: "html"; html: string }
    | { type: "fence"; lang: string; code: string };

  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "fence", lang, code: codeLines.join("\n") });
      continue;
    }

    if (line.trim() === "" || line.trim() === "---" || /^\*{3,}$/.test(line.trim())) {
      if (line.trim() === "---" || /^\*{3,}$/.test(line.trim())) {
        blocks.push({ type: "html", html: "<hr />" });
      } else {
        blocks.push({ type: "html", html: "" });
      }
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text);
      if (wantToc && level >= 2 && level <= 3) {
        tocEntries.push({ level, text, id });
      }
      blocks.push({
        type: "html",
        html: `<h${level} id="${escapeHtml(id)}">${formatInline(text)}</h${level}>`,
      });
      i += 1;
      continue;
    }

    if (line.trimStart().startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].trimStart().startsWith("> ") || lines[i].trim() === ">")) {
        const raw = lines[i].replace(/^>\s?/, "");
        quoteLines.push(raw);
        i += 1;
      }
      const inner = quoteLines.map((l) => `<p>${formatInline(l)}</p>`).join("");
      blocks.push({ type: "html", html: `<blockquote>${inner}</blockquote>` });
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^(\d+)\.\s+(.*)$/);
    if (ul || ol) {
      const isOrdered = Boolean(ol);
      const items: string[] = [];
      while (i < lines.length) {
        const ulm = lines[i].match(/^[-*]\s+(.*)$/);
        const olm = lines[i].match(/^(\d+)\.\s+(.*)$/);
        if (isOrdered && olm) {
          items.push(formatInline(olm[2] ?? ""));
          i += 1;
          continue;
        }
        if (!isOrdered && ulm) {
          items.push(formatInline(ulm[1] ?? ""));
          i += 1;
          continue;
        }
        break;
      }
      const tag = isOrdered ? "ol" : "ul";
      const lis = items.map((t) => `<li>${t}</li>`).join("");
      blocks.push({ type: "html", html: `<${tag}>${lis}</${tag}>` });
      continue;
    }

    if (line.includes("|")) {
      const tableStart = i;
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      if (tableLines.length >= 2 && isTableDivider(tableLines[1] ?? "")) {
        const head = parseTableRow(tableLines[0] ?? "");
        const bodyRows = tableLines.slice(2).map(parseTableRow);
        const ths = head.map((c) => `<th>${formatInline(c)}</th>`).join("");
        const trs = bodyRows
          .filter((row) => row.length > 0)
          .map((row) => {
            const cells = row.map((c) => `<td>${formatInline(c)}</td>`).join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");
        blocks.push({
          type: "html",
          html: `<table class="md-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`,
        });
        continue;
      }
      i = tableStart;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "") break;
      if (
        l.trim().startsWith("```") ||
        /^(#{1,6})\s/.test(l) ||
        l.trim() === "---" ||
        /^\*{3,}$/.test(l.trim()) ||
        l.trimStart().startsWith("> ") ||
        /^[-*]\s+/.test(l) ||
        /^\d+\.\s+/.test(l)
      ) {
        break;
      }
      if (l.includes("|") && i + 1 < lines.length && isTableDivider(lines[i + 1] ?? "")) {
        break;
      }
      para.push(l);
      i += 1;
    }
    const text = para.join(" ").trim();
    if (text.length > 0) {
      blocks.push({ type: "html", html: `<p>${formatInline(text)}</p>` });
    }
  }

  const bodyParts: string[] = [];
  for (const b of blocks) {
    if (b.type === "fence") {
      const langAttr = b.lang ? ` class="language-${escapeHtml(b.lang)}"` : "";
      bodyParts.push(`<pre><code${langAttr}>${escapeHtml(b.code)}</code></pre>`);
    } else if (b.html === "") {
      bodyParts.push("");
    } else {
      bodyParts.push(b.html);
    }
  }

  let tocHtml = "";
  if (wantToc && tocEntries.length > 0) {
    const lis = tocEntries
      .map((e) => {
        const pad = e.level === 3 ? ' style="margin-left:1.25rem"' : "";
        return `<li${pad}><a href="#${escapeHtml(e.id)}">${escapeHtml(e.text)}</a></li>`;
      })
      .join("");
    tocHtml = `<nav class="toc" aria-label="目录"><h2>目录</h2><ul>${lis}</ul></nav>`;
  }

  const body = bodyParts.filter((p, idx, arr) => !(p === "" && arr[idx - 1] === "")).join("\n");

  const css = [
    "body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;padding:24px;max-width:1100px;margin:0 auto;line-height:1.6;color:#1a1a1a}",
    "h1,h2,h3,h4{border-bottom:1px solid #e5e5e5;padding-bottom:0.25em;margin-top:1.4em}",
    "table.md-table{border-collapse:collapse;width:100%;margin:1em 0;font-size:0.95em}",
    "table.md-table th,table.md-table td{border:1px solid #ddd;padding:8px 10px;text-align:left}",
    "table.md-table th{background:#f6f8fa}",
    "pre{background:#f7f7f8;padding:12px;border-radius:8px;overflow:auto}",
    "code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.9em}",
    "blockquote{border-left:4px solid #ddd;margin:1em 0;padding-left:1em;color:#444}",
    "nav.toc{background:#fafafa;border:1px solid #eee;border-radius:8px;padding:12px 16px;margin-bottom:2em}",
    "nav.toc ul{list-style:none;padding-left:0;margin:0}",
    "nav.toc li{margin:0.35em 0}",
  ].join("");

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(documentTitle)}</title>`,
    `<style>${css}</style>`,
    "</head>",
    "<body>",
    tocHtml,
    body,
    "</body>",
    "</html>",
  ].join("");
}
