#!/usr/bin/env node
/**
 * 链路级烟测（不替代 quality:all）：市场包结构、2B 含 MDA、D1~D6 契约稿。
 * 运行：`pnpm run build && pnpm --filter @trade-signal/research-runtime run test:linkage`
 */
import { initCliEnv } from "../lib/init-cli-env.js";
import { shellQuoteArg } from "../lib/shell-quote-arg.js";
import assert from "node:assert/strict";

import { renderQualitativeD1D6Scaffold } from "../runtime/business-analysis/d1-d6-scaffold.js";
import { evaluatePhase3Preflight } from "../crosscut/preflight/phase3-preflight.js";
import { projectEvidenceToC2 } from "../steps/phase1b/collector.js";
import { resolveIndustryProfileSnapshot } from "../steps/phase1a/industry-profile.js";
import { renderPhase2BDataPackReport } from "../steps/phase2b/renderer.js";
import { buildMarketPackMarkdown } from "../runtime/workflow/build-market-pack.js";
import { refreshMarketPackMarkdown } from "../runtime/workflow/refresh-market-pack.js";
import { sampleCnADataPack, samplePdfSections } from "./fixtures/phase3-golden-sample.js";

function main(): void {
  initCliEnv();
  const md = buildMarketPackMarkdown("600887", sampleCnADataPack());
  assert.match(md, /## §13 Warnings/);
  assert.match(md, /\| 指标 \| 2024 \| 2023 \|/);
  assert.match(md, /## §17 衍生指标/);
  assert.match(md, /## §18 费用率趋势/);
  assert.match(md, /销售费用率/);
  assert.match(md, /## §19 营运资本与现金转换周期/);
  assert.match(md, /CCC天数/);
  assert.match(md, /## §20 主营业务画像/);
  assert.match(md, /## §21 治理与监管事件时间线/);
  assert.match(md, /## §22 行业 Profile KPI/);
  assert.match(md, /Profile：dairy_food/);
  assert.doesNotMatch(md, /ARPU/);
  assert.match(md, /年报问询函/);
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
  assert.match(report, /## 行业 KPI 候选证据摘要/);
  assert.match(report, /BUSINESS 主营业务与业务模式/);
  assert.match(report, /OPERATING 经营指标 \| 已定位/);

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

  const d1d6WithPack = renderQualitativeD1D6Scaffold({
    phase1b: {
      stockCode: "600887",
      companyName: "测试公司",
      year: "2024",
      generatedAt: new Date().toISOString(),
      channel: "http",
      section7: [],
      section8: [],
      section10: [],
    },
    pdfPath: "/tmp/x.pdf",
    hasDataPackReport: true,
    dataPackReportExcerpt: "## MDA 管理层讨论与分析\n摘录",
  });
  assert.match(d1d6WithPack, /data_pack_report 摘录/);
  assert.match(d1d6WithPack, /摘录/);

  assert.equal(shellQuoteArg("600887"), "600887");
  assert.match(shellQuoteArg("path with space"), /^"/);

  const mf = JSON.parse(
    '{"outputLayout":{"code":"600887","runId":"r1"},"pipeline":{"valuation":{"relativePaths":{"marketMd":"m.md"}}}}',
  ) as { outputLayout?: { code?: string } };
  assert.equal(mf.outputLayout?.code?.trim(), "600887");

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

  const telecomProfile = resolveIndustryProfileSnapshot({
    instrumentIndustry: "电信运营",
    companyOperationsSnapshot: {
      source: "fixture",
      status: "pass",
      missingFields: [],
      degradeReasons: [],
      signals: [
        {
          category: "operating_metric",
          label: "5G客户",
          summary: "5G套餐客户数持续增长，移动 ARPU 保持稳定。",
          source: "fixture",
          confidence: "medium",
        },
        {
          category: "operating_metric",
          label: "资本开支",
          summary: "资本开支聚焦 5G 与算力网络。",
          source: "fixture",
          confidence: "medium",
        },
      ],
    },
  });
  assert.equal(telecomProfile.profileId, "telecom");
  assert.equal(telecomProfile.matchedBy, "instrument");
  assert.ok(telecomProfile.kpiSignals.some((s) => s.key === "five_g_customers"));

  const genericProfile = resolveIndustryProfileSnapshot({ instrumentIndustry: "未知行业" });
  assert.equal(genericProfile.profileId, "generic");

  console.log("[test:linkage] ok");
}

main();
