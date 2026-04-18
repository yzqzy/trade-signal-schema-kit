#!/usr/bin/env node
/**
 * 链路级烟测（不替代 quality:all）：市场包结构、2B 含 MDA、D1~D6 契约稿。
 * 运行：`pnpm run build && pnpm --filter @trade-signal/research-strategies run test:linkage`
 */
import { initCliEnv } from "../lib/init-cli-env.js";
import assert from "node:assert/strict";

import { renderQualitativeD1D6Scaffold } from "../app/business-analysis/d1-d6-scaffold.js";
import { evaluatePhase3Preflight } from "../pipeline/phase3-preflight.js";
import { projectEvidenceToC2 } from "../stages/phase1b/collector.js";
import { renderPhase2BDataPackReport } from "../stages/phase2b/renderer.js";
import { buildMarketPackMarkdown } from "../app/workflow/build-market-pack.js";
import { refreshMarketPackMarkdown } from "../app/workflow/refresh-market-pack.js";
import { sampleCnADataPack, samplePdfSections } from "./fixtures/phase3-golden-sample.js";

function main(): void {
  initCliEnv();
  const md = buildMarketPackMarkdown("600887", sampleCnADataPack());
  assert.match(md, /## §13 Warnings/);
  assert.match(md, /\| 指标 \| 2024 \| 2023 \|/);
  assert.match(md, /## §17 衍生指标/);
  assert.match(md, /## §3P 母公司利润表/);
  assert.match(md, /母公司营业收入/);
  const refreshed = refreshMarketPackMarkdown("600887", md, {
    ...sampleCnADataPack(),
    quote: { code: "600887", price: 99, timestamp: new Date().toISOString() },
  });
  assert.match(refreshed, /99\.0000/);

  const pf = evaluatePhase3Preflight({
    companyName: "伊利股份",
    marketMarkdown: md,
    reportMarkdown: `# x\n\n## MDA 管理层讨论与分析\n${"摘录".repeat(40)}\n`,
  });
  assert.equal(pf.verdict, "PROCEED");

  const report = renderPhase2BDataPackReport({
    sections: samplePdfSections(),
    includeMda: true,
    reportKind: "annual",
  });
  assert.match(report, /reportKind.*annual/);
  assert.match(report, /PDF_EXTRACT_QUALITY:/);
  assert.match(report, /## MDA /);
  assert.match(report, /管理层讨论与分析/);
  const interimRep = renderPhase2BDataPackReport({
    sections: samplePdfSections(),
    reportKind: "interim",
  });
  assert.match(interimRep, /# data_pack_report_interim/);

  const reportNoMda = renderPhase2BDataPackReport({ sections: samplePdfSections(), includeMda: false });
  assert.ok(!reportNoMda.includes("## MDA "));

  const d1d6 = renderQualitativeD1D6Scaffold({
    phase1b: {
      stockCode: "600887",
      companyName: "测试公司",
      year: "2024",
      generatedAt: new Date().toISOString(),
      channel: "http",
      section7: [{ item: "竞争", content: "行业集中", evidences: [] }],
      section8: [],
      section10: [],
    },
    pdfPath: "/tmp/x.pdf",
  });
  assert.match(d1d6, /## D1 商业模式/);
  assert.match(d1d6, /## D6 控股结构/);
  assert.match(d1d6, /证据约束/);

  const c1 = {
    stockCode: "600887",
    companyName: "测试公司",
    year: "2024",
    channel: "http" as const,
    collectedAt: new Date().toISOString(),
    hits: [
      {
        catalog: "7" as const,
        promptItem: "控股股东及持股比例",
        searchQuery: "测试公司 大股东 控股 持股比例 2024",
        evidences: [{ title: "公告", url: "https://example.com/1", snippet: "控股股东持股 52%" }],
      },
      {
        catalog: "8" as const,
        promptItem: "主要竞争对手",
        searchQuery: "测试公司 竞争对手 市场份额 2024",
        evidences: [],
      },
      {
        catalog: "10" as const,
        promptItem: "经营回顾",
        searchQuery: "测试公司 管理层讨论 经营回顾 2024",
        evidences: [{ title: "年报", url: "https://example.com/2", snippet: "渠道拓展与成本优化" }],
      },
    ],
  };
  assert.ok(!("decision" in c1), "C1 数据不应包含策略决策字段");
  const c2 = projectEvidenceToC2(c1);
  assert.equal(c2.section7.length, 1);
  assert.equal(c2.section8.length, 1);
  assert.equal(c2.section10.length, 1);
  assert.match(c2.section8[0]?.content ?? "", /未搜索到相关信息/);

  console.log("[test:linkage] ok");
}

main();
