#!/usr/bin/env node
/**
 * 生成并写入 `output/phase3_golden/{cn_a,hk}/` 契约与回归基线（离线合成数据，不访问 Feed）。
 * 运行：先 `pnpm --filter @trade-signal/research-strategies run build`，再
 * `pnpm --filter @trade-signal/research-strategies run gen:phase3-golden`
 */
import { initCliEnv } from "../lib/init-cli-env.js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildMarketPackMarkdown } from "../runtime/workflow/build-market-pack.js";
import { renderPhase2BDataPackReport } from "../steps/phase2b/renderer.js";
import { runPhase3Strict } from "../steps/phase3/analyzer.js";
import { renderPhase3Html, renderPhase3Markdown } from "../steps/phase3/report-renderer.js";
import {
  sampleCnADataPack,
  sampleHkDataPack,
  samplePdfSections,
} from "../tests/fixtures/phase3-golden-sample.js";

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd) === "research-strategies" ? path.resolve(cwd, "../..") : cwd;
}

async function checksum(filePath: string): Promise<{ sha256: string; bytes: number }> {
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(filePath);
  return {
    sha256: createHash("sha256").update(buf).digest("hex"),
    bytes: buf.byteLength,
  };
}

async function writeSuite(
  root: string,
  folder: "cn_a" | "hk",
  code: string,
  dataPack: ReturnType<typeof sampleCnADataPack>,
): Promise<void> {
  const base = path.join(root, "output/phase3_golden", folder);
  const runDir = path.join(base, "run");
  await mkdir(runDir, { recursive: true });

  const marketMarkdown = buildMarketPackMarkdown(code, dataPack);
  const reportMarkdown = renderPhase2BDataPackReport({
    sections: samplePdfSections(),
    includeMda: true,
    reportKind: "annual",
  });

  await writeFile(path.join(base, "data_pack_market.md"), marketMarkdown, "utf-8");
  await writeFile(path.join(base, "data_pack_report.md"), reportMarkdown, "utf-8");

  const out = runPhase3Strict({ marketMarkdown, reportMarkdown });
  const markdownRaw = renderPhase3Markdown(out);
  const html = renderPhase3Html(markdownRaw);

  await writeFile(path.join(runDir, "valuation_computed.json"), JSON.stringify(out.valuation, null, 2), "utf-8");
  await writeFile(path.join(runDir, "analysis_report.md"), markdownRaw, "utf-8");
  await writeFile(path.join(runDir, "analysis_report.html"), html, "utf-8");

  const manifestRelFiles = [
    "valuation_computed.json",
    "analysis_report.md",
    "analysis_report.html",
  ] as const;
  const manifest: Record<string, { sha256: string; bytes: number }> = {};
  for (const rel of manifestRelFiles) {
    const fp = path.join(runDir, rel);
    manifest[rel] = await checksum(fp);
  }
  await writeFile(path.join(runDir, "golden_manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
}

async function main(): Promise<void> {
  initCliEnv();
  const root = resolveRepoRoot();
  await writeSuite(root, "cn_a", "600887", sampleCnADataPack());
  await writeSuite(root, "hk", "00700", sampleHkDataPack());
  console.log("[gen:phase3-golden] wrote output/phase3_golden/cn_a and output/phase3_golden/hk");
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
