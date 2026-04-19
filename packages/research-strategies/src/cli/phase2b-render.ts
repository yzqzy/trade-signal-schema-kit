#!/usr/bin/env node

import { initCliEnv } from "../lib/init-cli-env.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PdfSections } from "@trade-signal/schema-core";

import { runPhase2AExtractPdfSections } from "../steps/phase2a/extractor.js";
import { renderPhase2BDataPackReport } from "../steps/phase2b/renderer.js";

type CliArgs = {
  pdfPath?: string;
  sectionsPath?: string;
  outputPath: string;
  phase2aOutputPath?: string;
  verbose: boolean;
  noMda: boolean;
  /** 输出 `data_pack_report_interim` 契约头（中报/季报） */
  interim: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const values: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    if (name === "verbose" || name === "no-mda" || name === "interim") {
      values[name] = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for argument: ${key}`);
    values[name] = value;
    i += 1;
  }

  return {
    pdfPath: values["pdf"] ? String(values["pdf"]) : undefined,
    sectionsPath: values["sections"] ? String(values["sections"]) : undefined,
    outputPath: values["output"] ? String(values["output"]) : "output/data_pack_report.md",
    phase2aOutputPath: values["phase2a-output"] ? String(values["phase2a-output"]) : undefined,
    verbose: Boolean(values["verbose"]),
    noMda: Boolean(values["no-mda"]),
    interim: Boolean(values["interim"]),
  };
}

async function loadSectionsByArgs(args: CliArgs): Promise<PdfSections> {
  if (args.sectionsPath) {
    const raw = await readFile(args.sectionsPath, "utf-8");
    return JSON.parse(raw) as PdfSections;
  }
  if (!args.pdfPath) {
    throw new Error("Missing required argument: use --pdf <path> or --sections <path>");
  }
  return runPhase2AExtractPdfSections({
    pdfPath: args.pdfPath,
    outputPath: args.phase2aOutputPath,
    verbose: args.verbose,
  });
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

async function main(): Promise<void> {
  initCliEnv();
  const args = parseArgs(process.argv.slice(2));
  const sections = await loadSectionsByArgs(args);
  const markdown = renderPhase2BDataPackReport({
    sections,
    includeMda: !args.noMda,
    reportKind: args.interim ? "interim" : "annual",
  });
  await writeTextFile(args.outputPath, markdown);

  console.log(`[phase2b] done -> ${args.outputPath}`);
  if (sections.metadata.sectionsFound <= 2) {
    console.warn("[phase2b] warning: low section match count, output may have large gaps.");
  }
}

void main();
