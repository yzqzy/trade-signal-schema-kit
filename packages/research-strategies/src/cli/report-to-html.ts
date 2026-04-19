#!/usr/bin/env node

import { initCliEnv } from "../lib/init-cli-env.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveReportHtmlDefaultPath } from "../contracts/output-layout-v2.js";
import { resolveInputPath, resolveOutputPath } from "../pipeline/resolve-monorepo-path.js";
import { qualitativeMarkdownToDashboardHtml } from "@trade-signal/reporting";

import { renderPhase3Html } from "../stages/phase3/report-renderer.js";

type CliArgs = {
  inputMdPath?: string;
  outputHtmlPath?: string;
  /** 默认输出 v2 目录分区用；缺省 `_adhoc` */
  code?: string;
  legacyPre?: boolean;
  toc?: boolean;
  /** `semantic`：Phase3 语义 HTML；`dashboard`：定性发布模板（KPI/维度/参数表） */
  mode?: "semantic" | "dashboard";
};

const REPORT_HTML_BOOLEAN_FLAGS = new Set(["legacy-pre", "toc"]);

function parseArgs(argv: string[]): CliArgs {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    if (REPORT_HTML_BOOLEAN_FLAGS.has(name)) {
      flags.add(name);
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for argument: --${name}`);
    values[name] = next;
    i += 1;
  }
  const modeRaw = values.mode;
  const mode: CliArgs["mode"] =
    modeRaw === "dashboard" ? "dashboard" : modeRaw === "semantic" ? "semantic" : undefined;
  return {
    inputMdPath: values["input-md"] ?? values["markdown"],
    outputHtmlPath: values["output-html"] ?? values["output"],
    code: values.code,
    legacyPre: flags.has("legacy-pre"),
    toc: flags.has("toc"),
    mode,
  };
}

async function main(): Promise<void> {
  initCliEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.inputMdPath) {
    throw new Error(
      "Missing required argument: --input-md <path-to-report.md> [--output-html <path>] [--mode semantic|dashboard] [--legacy-pre] [--toc]",
    );
  }

  const mdAbs = resolveInputPath(args.inputMdPath);
  const markdown = await readFile(mdAbs, "utf-8");
  const mode = args.mode ?? "semantic";
  const html =
    mode === "dashboard"
      ? qualitativeMarkdownToDashboardHtml(markdown)
      : renderPhase3Html(markdown, { legacyPre: args.legacyPre, toc: args.toc });

  const outHtml =
    args.outputHtmlPath !== undefined
      ? resolveOutputPath(args.outputHtmlPath)
      : resolveReportHtmlDefaultPath({
          inputMdAbsolute: mdAbs,
          stockCode: args.code,
        }).outputHtmlPath;

  await mkdir(path.dirname(outHtml), { recursive: true });
  await writeFile(outHtml, html, "utf-8");

  console.log(`[report-to-html] wrote -> ${outHtml}`);
}

void main();
