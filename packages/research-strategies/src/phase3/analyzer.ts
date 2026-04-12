import type { AnalysisReport, ValuationMethodResult } from "@trade-signal/schema-core";

import { runPhase3ValuationEngine } from "./valuation-engine.js";
import type { Phase3EngineOutput, Phase3RunInput } from "./types.js";

function decideFromCentral(central?: number, price?: number): "buy" | "watch" | "avoid" {
  if (!central || !price || price <= 0) return "watch";
  const margin = (central - price) / price;
  if (margin >= 0.25) return "buy";
  if (margin <= -0.15) return "avoid";
  return "watch";
}

function confidenceFromCoverage(methodCoverage: number, hasReportPack: boolean): "high" | "medium" | "low" {
  if (methodCoverage >= 4 && hasReportPack) return "high";
  if (methodCoverage >= 2) return "medium";
  return "low";
}

function renderMethodRows(methods: ValuationMethodResult[]): string {
  const methodRows = [
    "| 方法 | 值 | 说明 |",
    "|---|---:|---|",
    ...methods.map((m) => {
      const value = typeof m.value === "number" ? m.value.toFixed(2) : "N/A";
      const note = m.note ?? "ok";
      return `| ${m.method} | ${value} | ${note} |`;
    }),
  ];
  if (methods.length === 0) {
    methodRows.push("| N/A | N/A | 未提供完整年度财务序列，部分方法自动降级 |");
  }
  return methodRows.join("\n");
}

function buildSections(
  input: Phase3RunInput,
  valuationSummary: {
    central?: number;
    decision: "buy" | "watch" | "avoid";
    confidence: "high" | "medium" | "low";
    methods: ValuationMethodResult[];
  },
): Array<{ heading: string; content: string }> {
  const summary = valuationSummary;
  return [
    {
      heading: "Executive Summary",
      content: [
        `结论：**${summary.decision}**`,
        `分析置信度：**${summary.confidence}**`,
        summary.central !== undefined ? `估值中枢：**${summary.central.toFixed(2)}**` : "估值中枢：⚠️数据不可用",
      ].join("\n\n"),
    },
    {
      heading: "Valuation Methods",
      content: renderMethodRows(summary.methods),
    },
    {
      heading: "Risk Notes",
      content: input.reportMarkdown?.includes("⚠️")
        ? "来自 data_pack_report 的警示项已检测，建议人工复核附注证据。"
        : "未检测到结构化警示文本；若数据包缺失，建议补充人工复核。",
    },
  ];
}

export function runPhase3Analysis(input: Phase3RunInput): Phase3EngineOutput {
  const valuation = runPhase3ValuationEngine(input.market);
  const central = valuation.crossValidation?.range?.central;
  const decision = decideFromCentral(central, input.market.price);
  const validMethods = valuation.methods.filter((m) => typeof m.value === "number" && m.value > 0).length;
  const confidence = confidenceFromCoverage(validMethods, Boolean(input.reportMarkdown));

  const report: AnalysisReport = {
    meta: {
      code: input.market.code,
      schemaVersion: "v0.1-alpha",
      dataSource: "phase1a+phase1b+phase2b",
      generatedAt: new Date().toISOString(),
      capabilityFlags: [],
    },
    title: `${input.market.name ?? input.market.code} 分析报告`,
    decision,
    confidence,
    sections: buildSections(input, { central, decision, confidence, methods: valuation.methods }),
  };

  return {
    valuation,
    report,
  };
}
