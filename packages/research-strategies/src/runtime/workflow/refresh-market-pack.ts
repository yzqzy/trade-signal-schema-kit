import type { DataPackMarket } from "@trade-signal/schema-core";

import { buildMarketPackMarkdown } from "./build-market-pack.js";

function splitLines(md: string): string[] {
  return md.split(/\r?\n/);
}

function extractSection(md: string, title: string): string {
  const lines = splitLines(md);
  const i = lines.findIndex((l) => l.trim() === title);
  if (i < 0) return `${title}\n`;
  let j = i + 1;
  while (j < lines.length && !lines[j].startsWith("## §")) j += 1;
  return lines.slice(i, j).join("\n");
}

function replaceSection(md: string, title: string, newBlock: string): string {
  const lines = splitLines(md);
  const i = lines.findIndex((l) => l.trim() === title);
  if (i < 0) return md;
  let j = i + 1;
  while (j < lines.length && !lines[j].startsWith("## §")) j += 1;
  const before = lines.slice(0, i).join("\n");
  const after = lines.slice(j).join("\n");
  return [before, newBlock, after].filter((p) => p.length > 0).join("\n\n");
}

function appendBulletUnderSection(md: string, title: string, bulletLine: string): string {
  if (md.includes(bulletLine.trim())) return md;
  const lines = splitLines(md);
  const i = lines.findIndex((l) => l.trim() === title);
  if (i < 0) return md;
  let j = i + 1;
  while (j < lines.length && !lines[j].startsWith("## §")) j += 1;
  const insertAt = j;
  const next = [...lines.slice(0, insertAt), bulletLine, ...lines.slice(insertAt)];
  return next.join("\n");
}

/**
 * 仅刷新行情敏感块：§1 基础信息、§6 K 线摘要、§16 附录行情；并在 §13 追加刷新注记。
 * 合并报表多年表、§3P/§4P、§17 等保持磁盘上原有内容。
 */
export function refreshMarketPackMarkdown(code: string, existingMarkdown: string, dataPack: DataPackMarket): string {
  const full = buildMarketPackMarkdown(code, dataPack);
  let md = existingMarkdown;
  md = replaceSection(md, "## §1 基础信息", extractSection(full, "## §1 基础信息"));
  md = replaceSection(md, "## §6 估值与交易摘要", extractSection(full, "## §6 估值与交易摘要"));
  md = replaceSection(md, "## §16 附录：原始行情窗口", extractSection(full, "## §16 附录：原始行情窗口"));
  const note = `- [刷新|低] 行情敏感段（§1 / §6 / §16）已于 ${new Date().toISOString()} 自 Phase1A 重采。`;
  md = appendBulletUnderSection(md, "## §13 Warnings", note);
  return md;
}
