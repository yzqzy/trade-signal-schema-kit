#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveInputPath, resolveOutputPath } from "../pipeline/resolve-monorepo-path.js";
import { renderPhase3Html } from "../phase3/report-renderer.js";

type CliArgs = {
  inputMdPath?: string;
  outputHtmlPath?: string;
  legacyPre?: boolean;
  toc?: boolean;
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
  return {
    inputMdPath: values["input-md"] ?? values["markdown"],
    outputHtmlPath: values["output-html"] ?? values["output"],
    legacyPre: flags.has("legacy-pre"),
    toc: flags.has("toc"),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.inputMdPath) {
    throw new Error(
      "Missing required argument: --input-md <path-to-report.md> [--output-html <path>] [--legacy-pre] [--toc]",
    );
  }

  const mdAbs = resolveInputPath(args.inputMdPath);
  const markdown = await readFile(mdAbs, "utf-8");
  const html = renderPhase3Html(markdown, { legacyPre: args.legacyPre, toc: args.toc });

  const outHtml =
    args.outputHtmlPath !== undefined
      ? resolveOutputPath(args.outputHtmlPath)
      : path.join(path.dirname(mdAbs), `${path.basename(mdAbs, path.extname(mdAbs))}.html`);

  await mkdir(path.dirname(outHtml), { recursive: true });
  await writeFile(outHtml, html, "utf-8");

  console.log(`[report-to-html] wrote -> ${outHtml}`);
}

void main();
