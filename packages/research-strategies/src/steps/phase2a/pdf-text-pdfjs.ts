import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type { PageText } from "./zones.js";

type PdfTextItem = { str?: string; transform?: number[] };

let pdfjsWorkerConfigured = false;

async function ensurePdfjsWorker(): Promise<void> {
  if (pdfjsWorkerConfigured) return;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const nodeRequire = createRequire(import.meta.url);
  pdfjs.GlobalWorkerOptions.workerSrc = nodeRequire.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  pdfjsWorkerConfigured = true;
}

function textFromPageItems(items: readonly PdfTextItem[]): string {
  type Part = { x: number; y: number; str: string };
  const parts: Part[] = [];
  for (const item of items) {
    if (!("str" in item) || typeof item.str !== "string" || !item.str.trim()) continue;
    const t = item.transform;
    if (!t || t.length < 6) continue;
    const x = t[4];
    const y = t[5];
    parts.push({ x, y, str: item.str });
  }
  if (parts.length === 0) return "";

  const yTolerance = 2.5;
  const rows: { y: number; parts: Part[] }[] = [];
  for (const p of parts) {
    let row = rows.find((r) => Math.abs(r.y - p.y) < yTolerance);
    if (!row) {
      row = { y: p.y, parts: [] };
      rows.push(row);
    }
    row.parts.push(p);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((row) =>
      row.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

/**
 * 使用 pdf.js legacy 构建抽取每页文本（Node 20+）。
 * 作为 `pdf-parse` 的条件回退，改善表格密集页排序。
 */
export async function extractPageTextsPdfjs(pdfPath: string): Promise<PageText[]> {
  await ensurePdfjsWorker();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const raw = await readFile(pdfPath);
  const loadingTask = getDocument({
    data: new Uint8Array(raw),
    useSystemFonts: true,
    useWorkerFetch: false,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  try {
    const out: PageText[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const text = textFromPageItems(textContent.items as readonly PdfTextItem[]);
      out.push({ page: i, text });
    }
    return out;
  } finally {
    await doc.destroy();
  }
}
