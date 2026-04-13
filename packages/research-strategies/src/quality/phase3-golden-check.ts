#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { QualitySuite } from "./regression-check.js";

type ManifestEntry = {
  sha256: string;
  bytes: number;
};

type GoldenManifest = Record<string, ManifestEntry>;

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

async function checksum(filePath: string): Promise<{ sha256: string; bytes: number }> {
  const buf = await readFile(filePath);
  return {
    sha256: createHash("sha256").update(buf).digest("hex"),
    bytes: buf.byteLength,
  };
}

async function runGoldenForSuite(
  root: string,
  name: "cn_a" | "hk",
  explicitManifest?: string,
): Promise<void> {
  const manifestPath =
    explicitManifest ?? path.join(root, `output/phase3_golden/${name}/run/golden_manifest.json`);

  if (!existsSync(manifestPath)) {
    throw new Error(`Cannot find golden_manifest.json for ${name}: ${manifestPath}`);
  }

  const manifestRaw = await readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestRaw) as GoldenManifest;
  const baseDir = path.dirname(manifestPath);

  const failures: string[] = [];
  for (const [relName, expected] of Object.entries(manifest)) {
    const filePath = path.join(baseDir, relName);
    const actual = await checksum(filePath);
    if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) {
      failures.push(
        `${name}/${relName}: expected sha256=${expected.sha256},bytes=${expected.bytes}; got sha256=${actual.sha256},bytes=${actual.bytes}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(`Phase3 golden check failed (${name})\n${failures.join("\n")}`);
  }

  console.log(`[quality] phase3 golden check passed (${name}, ${Object.keys(manifest).length} files)`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const suite = parseSuite(argv);
  let explicit: string | undefined;
  if (argv.includes("--manifest")) {
    const idx = argv.indexOf("--manifest");
    const value = argv[idx + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("Missing value for --manifest <path>");
    }
    explicit = path.resolve(value);
  }

  const root = resolveRepoRoot();

  if (explicit) {
    if (suite !== "all") {
      console.warn("[quality] --manifest is set; ignoring --suite (single manifest run).");
    }
    const manifestRaw = await readFile(explicit, "utf-8");
    const manifest = JSON.parse(manifestRaw) as GoldenManifest;
    const baseDir = path.dirname(explicit);
    const failures: string[] = [];
    for (const [fileName, expected] of Object.entries(manifest)) {
      const filePath = path.join(baseDir, fileName);
      const actual = await checksum(filePath);
      if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) {
        failures.push(
          `${fileName}: expected sha256=${expected.sha256},bytes=${expected.bytes}; got sha256=${actual.sha256},bytes=${actual.bytes}`,
        );
      }
    }
    if (failures.length > 0) {
      throw new Error(`Phase3 golden check failed\n${failures.join("\n")}`);
    }
    console.log(`[quality] phase3 golden check passed (${Object.keys(manifest).length} files)`);
    return;
  }

  for (const name of suitesToRun(suite)) {
    await runGoldenForSuite(root, name, undefined);
  }

  console.log(`[quality] phase3 golden check passed (suite=${suite})`);
}

void main();
