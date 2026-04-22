#!/usr/bin/env node
/**
 * 最小化发版：同步根与 apps/research-hub 的 version，提交并打 v* 标签。
 *
 * 用法：
 *   pnpm run release:show
 *   pnpm run release:tag -- <X.Y.Z>
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const SEMVER = /^\d+\.\d+\.\d+$/u;

const paths = {
  rootPkg: path.join(root, "package.json"),
  hubPkg: path.join(root, "apps", "research-hub", "package.json"),
};

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`, "utf-8");
}

function show() {
  const r = readJson(paths.rootPkg);
  const h = readJson(paths.hubPkg);
  console.log(`trade-signal-schema-kit: ${r.version}`);
  console.log(`@trade-signal/research-hub: ${h.version}`);
}

function tagExists(tag) {
  try {
    execSync(`git rev-parse -q --verify refs/tags/${tag}`, { cwd: root, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function runTag(version) {
  if (!SEMVER.test(version)) {
    console.error(`Invalid version "${version}". Expected X.Y.Z (e.g. 0.2.0).`);
    process.exit(1);
  }

  const gitTag = `v${version}`;
  if (tagExists(gitTag)) {
    console.error(`Tag ${gitTag} already exists.`);
    process.exit(1);
  }

  const pkg = readJson(paths.rootPkg);
  const hub = readJson(paths.hubPkg);

  if (pkg.version === version && hub.version === version) {
    console.log(`Version already ${version} in both package.json files.`);
  } else {
    pkg.version = version;
    hub.version = version;
    writeJson(paths.rootPkg, pkg);
    writeJson(paths.hubPkg, hub);
    console.log(`Updated version to ${version} in package.json and apps/research-hub/package.json`);
  }

  execSync("git add package.json apps/research-hub/package.json", { cwd: root, stdio: "inherit" });

  let hasStaged;
  try {
    execSync("git diff --cached --quiet", { cwd: root, stdio: "pipe" });
    hasStaged = false;
  } catch {
    hasStaged = true;
  }

  if (hasStaged) {
    execSync(`git commit -m "chore(release): ${gitTag}"`, { cwd: root, stdio: "inherit" });
  } else {
    console.log("Nothing to commit (version files unchanged). Creating tag only.");
  }

  execSync(`git tag ${gitTag}`, { cwd: root, stdio: "inherit" });
  console.log(`Created tag ${gitTag}. Push with: git push && git push origin ${gitTag}`);
}

const arg = process.argv[2];
if (arg === "--show" || arg === "show") {
  show();
  process.exit(0);
}

if (!arg) {
  console.error("Usage: pnpm run release:tag -- <X.Y.Z>");
  console.error("       pnpm run release:show");
  process.exit(1);
}

runTag(arg);
