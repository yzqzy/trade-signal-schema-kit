#!/usr/bin/env node

import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { resolveInputPath, resolveOutputPath } from "../crosscut/normalization/resolve-monorepo-path.js";
import { initCliEnv } from "../lib/init-cli-env.js";
import type { ReportTopicType, SiteReportsIndex } from "../reports-site/types.js";

type TargetPreset = "app" | "site" | "legacy-docs";
type ClearPart = "all" | "entries" | "timeline" | "by-topic" | "by-code" | "index";

const TOPICS: ReportTopicType[] = ["business-quality", "valuation", "penetration-return", "turtle-strategy"];

type CliArgs = {
  target: TargetPreset;
  dir?: string;
  parts: Set<ClearPart>;
  topicFilters: Set<ReportTopicType>;
  codeFilters: Set<string>;
};

function parseArgs(argv: string[]): CliArgs {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for argument: ${key}`);
    values[key.slice(2)] = value;
    i += 1;
  }

  const targetRaw = (values["target"]?.trim() || "app").toLowerCase();
  if (targetRaw !== "app" && targetRaw !== "site" && targetRaw !== "legacy-docs") {
    throw new Error(`Invalid --target: ${targetRaw} (expected: app | site | legacy-docs)`);
  }

  const partsRaw = values["parts"]?.trim() || "all";
  const parts = new Set<ClearPart>();
  for (const token of partsRaw.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (
      token !== "all" &&
      token !== "entries" &&
      token !== "timeline" &&
      token !== "by-topic" &&
      token !== "by-code" &&
      token !== "index"
    ) {
      throw new Error(`Invalid part in --parts: ${token}`);
    }
    parts.add(token);
  }
  if (parts.size === 0) parts.add("all");

  const topicFilters = new Set<ReportTopicType>();
  const topicsRaw = values["topics"]?.trim();
  if (topicsRaw) {
    for (const t of topicsRaw.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (TOPICS.includes(t as ReportTopicType)) {
        topicFilters.add(t as ReportTopicType);
      } else {
        throw new Error(`Invalid topic in --topics: ${t}`);
      }
    }
  }

  const codeFilters = new Set<string>();
  const codesRaw = values["codes"]?.trim();
  if (codesRaw) {
    for (const c of codesRaw.split(",").map((s) => s.trim()).filter(Boolean)) {
      codeFilters.add(c);
    }
  }

  return {
    target: targetRaw as TargetPreset,
    dir: values["dir"]?.trim(),
    parts,
    topicFilters,
    codeFilters,
  };
}

function resolveTargetDir(args: CliArgs): string {
  if (args.dir?.trim()) return resolveInputPath(args.dir.trim());
  if (args.target === "site") return resolveOutputPath(path.join("output", "site", "reports"));
  if (args.target === "legacy-docs") return resolveOutputPath(path.join("..", "trade-signal-docs", "public", "reports"));
  return resolveOutputPath(path.join("apps", "research-hub", "public", "reports"));
}

function formatLocalDateTime(input: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const y = input.getFullYear();
  const m = pad(input.getMonth() + 1);
  const d = pad(input.getDate());
  const hh = pad(input.getHours());
  const mm = pad(input.getMinutes());
  const ss = pad(input.getSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

async function writeEmptyJsonArray(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "[]\n", "utf-8");
}

async function clearByTopic(targetDir: string, topicFilters: Set<ReportTopicType>): Promise<void> {
  const byTopicDir = path.join(targetDir, "views", "by-topic");
  if (topicFilters.size === 0) {
    await rm(byTopicDir, { recursive: true, force: true });
    await mkdir(byTopicDir, { recursive: true });
    for (const topic of TOPICS) {
      await writeEmptyJsonArray(path.join(byTopicDir, `${topic}.json`));
    }
    return;
  }
  for (const topic of topicFilters) {
    await writeEmptyJsonArray(path.join(byTopicDir, `${topic}.json`));
  }
}

async function clearByCode(targetDir: string, codeFilters: Set<string>): Promise<void> {
  const byCodeDir = path.join(targetDir, "views", "by-code");
  if (codeFilters.size === 0) {
    await rm(byCodeDir, { recursive: true, force: true });
    await mkdir(byCodeDir, { recursive: true });
    return;
  }
  await mkdir(byCodeDir, { recursive: true });
  for (const code of codeFilters) {
    await writeEmptyJsonArray(path.join(byCodeDir, `${code}.json`));
  }
}

async function rebuildIndexFromTimeline(targetDir: string): Promise<void> {
  const timelinePath = path.join(targetDir, "views", "timeline.json");
  let entryCount = 0;
  try {
    const raw = await readFile(timelinePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) entryCount = parsed.length;
  } catch {
    entryCount = 0;
  }

  const index: SiteReportsIndex = {
    version: "2.0",
    generatedAt: formatLocalDateTime(new Date()),
    entryCount,
    timelineHref: "/reports/",
  };
  await writeFile(path.join(targetDir, "index.json"), JSON.stringify(index, null, 2) + "\n", "utf-8");
}

async function main(): Promise<void> {
  initCliEnv();
  const args = parseArgs(process.argv.slice(2));
  const targetDir = resolveTargetDir(args);
  await mkdir(targetDir, { recursive: true });

  const clearAll = args.parts.has("all");

  if (clearAll || args.parts.has("entries")) {
    await rm(path.join(targetDir, "entries"), { recursive: true, force: true });
    await mkdir(path.join(targetDir, "entries"), { recursive: true });
  }

  if (clearAll || args.parts.has("timeline")) {
    await writeEmptyJsonArray(path.join(targetDir, "views", "timeline.json"));
  }

  if (clearAll || args.parts.has("by-topic")) {
    await clearByTopic(targetDir, args.topicFilters);
  }

  if (clearAll || args.parts.has("by-code")) {
    await clearByCode(targetDir, args.codeFilters);
  }

  if (clearAll || args.parts.has("index") || args.parts.has("timeline")) {
    await rebuildIndexFromTimeline(targetDir);
  }

  console.log(
    `[reports-site:clear] target=${targetDir} parts=${[...args.parts].join(",")} ` +
      `topics=${[...args.topicFilters].join(",") || "-"} codes=${[...args.codeFilters].join(",") || "-"}`,
  );
}

void main();
