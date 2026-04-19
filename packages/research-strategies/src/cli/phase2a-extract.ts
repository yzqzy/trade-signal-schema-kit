#!/usr/bin/env node

import { initCliEnv } from "../lib/init-cli-env.js";
import { runPhase2AExtractPdfSections } from "../steps/phase2a/extractor.js";

type CliArgs = {
  pdfPath?: string;
  outputPath: string;
  verbose: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const values: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    if (name === "verbose") {
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
    outputPath: values["output"] ? String(values["output"]) : "output/pdf_sections.json",
    verbose: Boolean(values["verbose"]),
  };
}

async function main(): Promise<void> {
  initCliEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.pdfPath) {
    throw new Error("Missing required argument --pdf <path-to-pdf>");
  }
  const sections = await runPhase2AExtractPdfSections({
    pdfPath: args.pdfPath,
    outputPath: args.outputPath,
    verbose: args.verbose,
  });
  console.log(
    `[phase2a] done: ${sections.metadata.sectionsFound}/${sections.metadata.sectionsTotal} sections -> ${args.outputPath}`,
  );
  if (sections.metadata.sectionsFound === 0) {
    console.warn(
      "[phase2a] warning: 0 section matched. This PDF may be non-annual-report or use very different headings.",
    );
  } else if (sections.metadata.sectionsFound <= 2) {
    console.warn(
      "[phase2a] warning: very low section match count. Consider using a full annual report PDF for better coverage.",
    );
  }
}

void main();
