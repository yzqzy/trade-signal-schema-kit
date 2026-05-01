import { readFile } from "node:fs/promises";

type PageText = { page: number; text: string };
type PdfTextItem = { str?: string; transform?: number[] };

function textFromPageItems(items: readonly PdfTextItem[]): string {
  type Part = { x: number; y: number; str: string };
  const parts: Part[] = [];
  for (const item of items) {
    if (!("str" in item) || typeof item.str !== "string" || !item.str.trim()) continue;
    const t = item.transform;
    if (!t || t.length < 6) continue;
    parts.push({ x: t[4], y: t[5], str: item.str });
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

async function extractPageTextsPdfjsInWorker(pdfPath: string): Promise<PageText[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const raw = await readFile(pdfPath);
  const loadingTask = getDocument({
    data: new Uint8Array(raw),
    useSystemFonts: true,
    useWorkerFetch: false,
    disableWorker: true,
    verbosity: 0,
  } as Parameters<typeof getDocument>[0]);

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

async function main(): Promise<void> {
  const pdfPath = process.argv[2];
  if (!pdfPath) throw new Error("missing pdf path");
  const pages = await extractPageTextsPdfjsInWorker(pdfPath);
  process.stdout.write(JSON.stringify({ ok: true, pages }));
}

main().catch((err: unknown) => {
  process.stdout.write(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
});
