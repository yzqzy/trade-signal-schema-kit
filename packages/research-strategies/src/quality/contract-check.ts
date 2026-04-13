#!/usr/bin/env node

import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import path from "node:path";

function resolveRoot(cwd: string): string {
  return path.resolve(cwd, "../..");
}

async function main(): Promise<void> {
  const root = resolveRoot(process.cwd());
  const marketPackPath = path.join(root, "output/phase3_golden/cn_a/data_pack_market.md");
  const valuationPath = path.join(root, "output/phase3_golden/cn_a/run/valuation_computed.json");

  const marketPack = await readFile(marketPackPath, "utf-8");
  assert.match(marketPack, /#\s*.+（\d{5,6}）/, "data_pack_market title/code contract mismatch");
  assert.match(marketPack, /经营活动现金流OCF/, "data_pack_market missing OCF field");
  assert.match(marketPack, /资本开支Capex/, "data_pack_market missing Capex field");
  assert.match(marketPack, /归母净利润/, "data_pack_market missing net profit row");
  assert.match(marketPack, /总资产/, "data_pack_market missing balance sheet anchor");
  assert.match(marketPack, /§13 Warnings/, "data_pack_market missing §13 Warnings section");

  const valuation = JSON.parse(await readFile(valuationPath, "utf-8")) as {
    code?: unknown;
    generatedAt?: unknown;
    methods?: Array<{ method?: string }>;
  };
  assert.equal(typeof valuation.code, "string", "valuation_computed.code must be string");
  assert.equal(typeof valuation.generatedAt, "string", "valuation_computed.generatedAt must be string");
  assert.ok(Array.isArray(valuation.methods), "valuation_computed.methods must be array");
  for (const method of valuation.methods ?? []) {
    assert.ok(
      ["DCF", "DDM", "PE_BAND", "PEG", "PS"].includes(String(method.method ?? "")),
      `Unknown valuation method: ${String(method.method ?? "")}`,
    );
  }

  console.log("[quality] contract check passed (market pack + valuation contract)");
}

void main();
