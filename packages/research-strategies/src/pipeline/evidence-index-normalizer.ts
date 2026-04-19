function parseCells(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function findMarkdownPath(locator: string): { path?: string; tail?: string } {
  const linkMatch = locator.match(/\[[^\]]+\]\(([^)]+\.md)\)/);
  if (linkMatch) {
    const path = linkMatch[1];
    return { path, tail: "" };
  }
  const backtickMatch = locator.match(/`([^`]+\.md)`/);
  if (backtickMatch) {
    const path = backtickMatch[1];
    const tail = locator.slice(backtickMatch.index! + backtickMatch[0].length).trim();
    return { path, tail: tail.replace(/^[,，；\s]+/, "") };
  }
  const plainMatch = locator.match(/([./\w-]+\.md)/);
  if (plainMatch) {
    const path = plainMatch[1];
    const tail = locator.slice(plainMatch.index! + plainMatch[0].length).trim();
    return { path, tail: tail.replace(/^[,，；\s]+/, "") };
  }
  return {};
}

type EvidenceRow = {
  id: string;
  type: string;
  summary: string;
  locator: string;
};

type MergedEvidenceRow = {
  ids: string[];
  type: string;
  summaries: string[];
  mdPath?: string;
  locatorParts: string[];
  fallbackLocators: string[];
};

function normalizeRow(row: EvidenceRow): MergedEvidenceRow {
  const md = findMarkdownPath(row.locator);
  return {
    ids: [row.id],
    type: row.type,
    summaries: [row.summary],
    mdPath: md.path,
    locatorParts: md.tail ? [md.tail] : [],
    fallbackLocators: md.path ? [] : [row.locator],
  };
}

function mergeRows(rows: EvidenceRow[]): MergedEvidenceRow[] {
  const merged: MergedEvidenceRow[] = [];
  const groupIndex = new Map<string, number>();

  for (const row of rows) {
    const md = findMarkdownPath(row.locator);
    const key = md.path ? `${row.type}::${md.path}` : `${row.type}::${row.locator}`;
    const existingIdx = groupIndex.get(key);
    if (existingIdx === undefined) {
      const item = normalizeRow(row);
      merged.push(item);
      groupIndex.set(key, merged.length - 1);
      continue;
    }
    const target = merged[existingIdx]!;
    if (!target.ids.includes(row.id)) target.ids.push(row.id);
    if (!target.summaries.includes(row.summary)) target.summaries.push(row.summary);
    const tail = md.tail?.trim();
    if (tail && !target.locatorParts.includes(tail)) target.locatorParts.push(tail);
    if (!md.path && !target.fallbackLocators.includes(row.locator)) target.fallbackLocators.push(row.locator);
  }
  return merged;
}

function renderLocator(row: MergedEvidenceRow): string {
  if (row.mdPath) {
    const parts = row.locatorParts.filter(Boolean);
    if (parts.length === 0) return `\`${row.mdPath}\``;
    return `\`${row.mdPath}\` ${parts.join("；")}`;
  }
  return row.fallbackLocators.join("；");
}

export function normalizeEvidenceIndexTable(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const headingIdx = lines.findIndex((l) => /^##\s+附录：证据索引\s*$/.test(l.trim()));
  if (headingIdx < 0) return markdown;

  let tableStart = -1;
  for (let i = headingIdx + 1; i < lines.length; i += 1) {
    const t = lines[i]!.trim();
    if (t.startsWith("|")) {
      tableStart = i;
      break;
    }
    if (t.startsWith("## ")) return markdown;
  }
  if (tableStart < 0 || tableStart + 2 >= lines.length) return markdown;

  const tableLines: string[] = [];
  let tableEnd = tableStart;
  for (let i = tableStart; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.trim().startsWith("|")) break;
    tableLines.push(line);
    tableEnd = i;
  }
  if (tableLines.length < 3) return markdown;

  const header = parseCells(tableLines[0]!);
  const idIdx = header.findIndex((h) => h.includes("证据ID"));
  const typeIdx = header.findIndex((h) => h.includes("类型"));
  const summaryIdx = header.findIndex((h) => h.includes("摘要"));
  const locatorIdx = header.findIndex((h) => h.includes("链接") || h.includes("定位"));
  if (idIdx < 0 || typeIdx < 0 || summaryIdx < 0 || locatorIdx < 0) return markdown;

  const rows: EvidenceRow[] = [];
  for (let i = 2; i < tableLines.length; i += 1) {
    const cells = parseCells(tableLines[i]!);
    if (cells.length <= Math.max(idIdx, typeIdx, summaryIdx, locatorIdx)) continue;
    const id = cells[idIdx] ?? "";
    const type = cells[typeIdx] ?? "";
    const summary = cells[summaryIdx] ?? "";
    const locator = cells[locatorIdx] ?? "";
    if (!id || !type) continue;
    rows.push({ id, type, summary, locator });
  }
  if (rows.length === 0) return markdown;

  const merged = mergeRows(rows);
  const renderedRows = merged.map((r) => {
    const idCell = r.ids.join("/");
    const summaryCell = r.summaries.join("；");
    return `| ${idCell} | ${r.type} | ${summaryCell} | ${renderLocator(r)} |`;
  });

  const newTableLines = [tableLines[0]!, tableLines[1]!, ...renderedRows];
  const nextLines = [...lines.slice(0, tableStart), ...newTableLines, ...lines.slice(tableEnd + 1)];
  return nextLines.join("\n");
}
