#!/usr/bin/env node
/**
 * 发版脚本（对齐 trade-signal-feed 风格）：同步 version、提交、打 tag、推送。
 *
 * 用法：
 *   pnpm run release                 # patch +1
 *   pnpm run release -- minor        # minor +1
 *   pnpm run release -- major        # major +1
 *   pnpm run release -- 0.2.3        # 指定版本
 *   pnpm run release:show            # 查看当前版本
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const SEMVER = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/u;
const BUMP_TYPES = ["patch", "minor", "major"];

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

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: root, stdio: "inherit", ...opts });
}

function cleanVersion(v) {
  return (v || "0.0.0").replace(/-.*$/u, "");
}

function bumpVersion(current, type) {
  const p = cleanVersion(current).split(".").map(Number);
  while (p.length < 3) p.push(0);
  if (type === "major") {
    p[0] += 1;
    p[1] = 0;
    p[2] = 0;
  } else if (type === "minor") {
    p[1] += 1;
    p[2] = 0;
  } else {
    p[2] += 1;
  }
  return p.slice(0, 3).join(".");
}

function resolveTargetVersion(arg) {
  const rootPkg = readJson(paths.rootPkg);
  const current = cleanVersion(rootPkg.version);
  const type = !arg || arg === "patch" ? "patch" : arg;
  if (BUMP_TYPES.includes(type)) {
    const version = bumpVersion(current, type);
    console.log(`Current ${current} -> ${type} => ${version}`);
    return version;
  }
  if (SEMVER.test(arg)) return arg;
  console.error("Usage: pnpm run release [patch|minor|major|X.Y.Z]");
  process.exit(1);
}

function runRelease(version) {
  if (!SEMVER.test(version)) {
    console.error(`Invalid version "${version}". Expected patch|minor|major|X.Y.Z`);
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

  run("git add package.json apps/research-hub/package.json");

  let hasStaged;
  try {
    execSync("git diff --cached --quiet", { cwd: root, stdio: "pipe" });
    hasStaged = false;
  } catch {
    hasStaged = true;
  }

  if (hasStaged) {
    run(`git commit -m "chore(release): ${gitTag}"`);
  } else {
    console.log("Nothing to commit (version files unchanged). Creating tag only.");
  }

  run(`git tag ${gitTag}`);
  console.log(`Created tag ${gitTag}`);

  run("git push");
  run(`git push origin ${gitTag}`);
  console.log(`Pushed commit + tag ${gitTag}`);
}

const arg = process.argv[2];
if (arg === "--show" || arg === "show") {
  show();
  process.exit(0);
}

runRelease(resolveTargetVersion(arg));
