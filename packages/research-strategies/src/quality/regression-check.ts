#!/usr/bin/env node

import { initCliEnv } from "../lib/init-cli-env.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { strict as assert } from "node:assert";

import { runPhase3Strict } from "../steps/phase3/analyzer.js";
import { renderPhase3Html, renderPhase3Markdown } from "../steps/phase3/report-renderer.js";

export type QualitySuite = "cn_a" | "hk" | "all";

function normalizeTimestamps(text: string): string {
  return text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, "<TIMESTAMP>");
}

/** 报告中的「分析日期 / 获取日期」等随运行日变化，回归比对时抹平 */
function normalizeRegressibleDocs(text: string): string {
  return normalizeTimestamps(text).replace(/\b20\d{2}-\d{2}-\d{2}\b/g, "<DATE>");
}

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  const base = path.basename(cwd);
  if (base === "research-strategies") {
    return path.resolve(cwd, "../..");
  }
  return cwd;
}

function parseSuite(argv: string[]): QualitySuite {
  const idx = argv.indexOf("--suite");
  if (idx < 0) return "all";
  const value = argv[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("Missing value for --suite (cn_a|hk|all)");
  }
  if (value !== "cn_a" && value !== "hk" && value !== "all") {
    throw new Error(`Invalid --suite: ${value} (expected cn_a|hk|all)`);
  }
  return value as QualitySuite;
}

function suitesToRun(suite: QualitySuite): Array<"cn_a" | "hk"> {
  if (suite === "all") return ["cn_a", "hk"];
  return [suite];
}

async function runRegressionForSuite(root: string, name: "cn_a" | "hk"): Promise<void> {
  const base = path.join(root, "output/phase3_golden", name);
  const marketPackPath = path.join(base, "data_pack_market.md");
  const reportPackPath = path.join(base, "data_pack_report.md");
  const baselineValuationPath = path.join(base, "run/valuation_computed.json");
  const baselineReportMdPath = path.join(base, "run/analysis_report.md");
  const baselineReportHtmlPath = path.join(base, "run/analysis_report.html");

  const [marketPack, reportPack, baselineValuationRaw, baselineReportMdRaw, baselineReportHtmlRaw] =
    await Promise.all([
      readFile(marketPackPath, "utf-8"),
      readFile(reportPackPath, "utf-8"),
      readFile(baselineValuationPath, "utf-8"),
      readFile(baselineReportMdPath, "utf-8"),
      readFile(baselineReportHtmlPath, "utf-8"),
    ]);

  const out = runPhase3Strict({
    marketMarkdown: marketPack,
    reportMarkdown: reportPack,
  });
  const valuationObj = out.valuation as unknown as Record<string, unknown>;
  valuationObj.generatedAt = "<TIMESTAMP>";
  const valuation = JSON.stringify(valuationObj, null, 2);
  const markdownRaw = renderPhase3Markdown(out);
  const markdown = normalizeRegressibleDocs(markdownRaw);
  const html = normalizeRegressibleDocs(renderPhase3Html(markdownRaw));

  const baselineValuationObj = JSON.parse(baselineValuationRaw) as Record<string, unknown>;
  baselineValuationObj.generatedAt = "<TIMESTAMP>";
  const baselineValuation = JSON.stringify(baselineValuationObj, null, 2);
  const baselineReportMd = normalizeRegressibleDocs(baselineReportMdRaw);
  const baselineReportHtml = normalizeRegressibleDocs(baselineReportHtmlRaw);

  assert.equal(
    createHash("sha256").update(valuation).digest("hex"),
    createHash("sha256").update(baselineValuation).digest("hex"),
    `valuation_computed regression mismatch (${name})`,
  );
  assert.equal(
    createHash("sha256").update(markdown).digest("hex"),
    createHash("sha256").update(baselineReportMd).digest("hex"),
    `analysis_report.md regression mismatch (${name})`,
  );
  assert.equal(
    createHash("sha256").update(html).digest("hex"),
    createHash("sha256").update(baselineReportHtml).digest("hex"),
    `analysis_report.html regression mismatch (${name})`,
  );

  console.log(`[quality] regression check passed (${name})`);
}

async function main(): Promise<void> {
  initCliEnv();
  const argv = process.argv.slice(2);
  const suite = parseSuite(argv);
  const root = resolveRepoRoot();

  for (const name of suitesToRun(suite)) {
    await runRegressionForSuite(root, name);
  }

  console.log(`[quality] regression check passed (suite=${suite})`);
}

void main();
