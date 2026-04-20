#!/usr/bin/env node

import { strict as assert } from "node:assert";
import { evaluateP1CashQualityGate } from "../contracts/report-topic-contract.js";

async function main(): Promise<void> {
  const sample600941 = {
    code: "600941",
    accountsReceivable: 1240.5,
    contractLiabilities: 3520.2,
    creditImpairmentLoss: 180.1,
    ebitda: 11200.4,
  };
  const sample002714 = {
    code: "002714",
    accountsReceivable: 860.3,
    contractLiabilities: 920.6,
    creditImpairmentLoss: null,
    ebitda: 2310.8,
  };

  const gate600941 = evaluateP1CashQualityGate(sample600941);
  const gate002714 = evaluateP1CashQualityGate(sample002714);

  assert.equal(gate600941.status, "pass", "600941 should pass P1 cash quality gate");
  assert.equal(gate600941.missingFields.length, 0, "600941 should have no missing P1 fields");

  assert.equal(gate002714.status, "degraded", "002714 should degrade when any P1 field is missing");
  assert.ok(gate002714.missingFields.includes("creditImpairmentLoss"), "missing field should include creditImpairmentLoss");

  console.log("[quality] P1 gate check passed (600941 pass, 002714 degraded)");
}

void main();
