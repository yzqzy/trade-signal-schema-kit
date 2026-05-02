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
  assert.match(md, /Profile：consumer_food/);
  assert.match(md, /申万行业：一级=食品饮料；二级=饮料乳品；三级=乳品/);
  assert.match(md, /Profile 映射依据：sw_l1/);
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

  const swTelecomProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "600941",
      industryCode: "730100",
      level1Code: "730000",
      level1Name: "通信",
      level2Code: "730100",
      level2Name: "通信服务",
      level3Code: "730101",
      level3Name: "电信运营",
      confidence: "high",
    },
    instrumentIndustry: "电信运营",
  });
  assert.equal(swTelecomProfile.profileId, "telecom");
  assert.equal(swTelecomProfile.matchedBy, "sw_l1");
  assert.equal(swTelecomProfile.swLevel1Name, "通信");
  assert.equal(swTelecomProfile.swLevel2Name, "通信服务");
  assert.equal(swTelecomProfile.swLevel3Name, "电信运营");

  const swFoodProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "000716",
      industryCode: "340400",
      level1Code: "340000",
      level1Name: "食品饮料",
      level2Code: "340400",
      level2Name: "休闲食品",
      level3Code: "340402",
      level3Name: "其他休闲食品",
    },
  });
  assert.equal(swFoodProfile.profileId, "consumer_food");
  assert.equal(swFoodProfile.matchedBy, "sw_l1");

  const swAgricultureProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "000998",
      industryCode: "110100",
      level1Code: "110000",
      level1Name: "农林牧渔",
      level2Code: "110100",
      level2Name: "种植业",
      level3Code: "110101",
      level3Name: "粮食种植",
    },
    instrumentIndustry: "食品消费",
  });
  assert.equal(swAgricultureProfile.profileId, "generic");
  assert.equal(swAgricultureProfile.matchedBy, "sw_l1");

  const swRetailFoodProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "000759",
      industryCode: "450300",
      level1Code: "450000",
      level1Name: "商贸零售",
      level2Code: "450300",
      level2Name: "超市",
      level3Code: "450301",
      level3Name: "超市",
    },
  });
  assert.equal(swRetailFoodProfile.profileId, "consumer_food");
  assert.equal(swRetailFoodProfile.matchedBy, "sw_l1");

  const swBrokerProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "600030",
      industryCode: "490100",
      level1Code: "490000",
      level1Name: "非银金融",
      level2Code: "490100",
      level2Name: "证券",
      level3Code: "490101",
      level3Name: "证券",
    },
    instrumentIndustry: "保险金融",
  });
  assert.equal(swBrokerProfile.profileId, "generic");
  assert.equal(swBrokerProfile.matchedBy, "sw_l1");

  const swElectricEquipmentProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "300750",
      industryCode: "630100",
      level1Code: "630000",
      level1Name: "电力设备",
      level2Code: "630100",
      level2Name: "电池",
      level3Code: "630101",
      level3Name: "锂电池",
    },
  });
  assert.equal(swElectricEquipmentProfile.profileId, "energy_utility");
  assert.equal(swElectricEquipmentProfile.matchedBy, "sw_l1");

  const swBankProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "000001",
      industryCode: "480100",
      level1Code: "480000",
      level1Name: "银行",
      level2Code: "480100",
      level2Name: "股份制银行",
      level3Code: "480101",
      level3Name: "股份制银行",
    },
  });
  assert.equal(swBankProfile.profileId, "bank");
  assert.equal(swBankProfile.matchedBy, "sw_l1");

  const swTransportProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "601111",
      industryCode: "420100",
      level1Code: "420000",
      level1Name: "交通运输",
      level2Code: "420100",
      level2Name: "航空机场",
      level3Code: "420101",
      level3Name: "航空运输",
    },
  });
  assert.equal(swTransportProfile.profileId, "transportation_logistics");
  assert.equal(swTransportProfile.matchedBy, "sw_l1");
  assert.ok(swTransportProfile.missingKpis.includes("freight_passenger_volume"));
  assert.ok(!swTransportProfile.missingKpis.includes("mobile_customers"));

  const swSoftwareProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "600570",
      industryCode: "710100",
      level1Code: "710000",
      level1Name: "计算机",
      level2Code: "710100",
      level2Name: "软件开发",
      level3Code: "710101",
      level3Name: "垂直应用软件",
    },
  });
  assert.equal(swSoftwareProfile.profileId, "software_it");
  assert.equal(swSoftwareProfile.matchedBy, "sw_l1");

  const swMediaProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "300413",
      industryCode: "720100",
      level1Code: "720000",
      level1Name: "传媒",
      level2Code: "720100",
      level2Name: "游戏",
      level3Code: "720101",
      level3Name: "游戏",
    },
  });
  assert.equal(swMediaProfile.profileId, "media_entertainment");
  assert.equal(swMediaProfile.matchedBy, "sw_l1");

  const swEnvironmentalProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "300070",
      industryCode: "760100",
      level1Code: "760000",
      level1Name: "环保",
      level2Code: "760100",
      level2Name: "环境治理",
      level3Code: "760101",
      level3Name: "水务及水治理",
    },
  });
  assert.equal(swEnvironmentalProfile.profileId, "environmental_services");
  assert.equal(swEnvironmentalProfile.matchedBy, "sw_l1");

  const swBeautyProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "603605",
      industryCode: "770100",
      level1Code: "770000",
      level1Name: "美容护理",
      level2Code: "770100",
      level2Name: "化妆品",
      level3Code: "770101",
      level3Name: "化妆品",
    },
  });
  assert.equal(swBeautyProfile.profileId, "beauty_personalcare");
  assert.equal(swBeautyProfile.matchedBy, "sw_l1");

  const swConsumerServicesProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "600754",
      industryCode: "460100",
      level1Code: "460000",
      level1Name: "社会服务",
      level2Code: "460100",
      level2Name: "酒店餐饮",
      level3Code: "460101",
      level3Name: "酒店",
    },
  });
  assert.equal(swConsumerServicesProfile.profileId, "consumer_services");
  assert.equal(swConsumerServicesProfile.matchedBy, "sw_l1");

  const swConglomerateProfile = resolveIndustryProfileSnapshot({
    swIndustryClassification: {
      provider: "sw",
      version: "2021",
      code: "600620",
      industryCode: "510100",
      level1Code: "510000",
      level1Name: "综合",
      level2Code: "510100",
      level2Name: "综合",
      level3Code: "510101",
      level3Name: "综合",
    },
    instrumentIndustry: "软件传媒消费综合",
  });
  assert.equal(swConglomerateProfile.profileId, "generic");
  assert.equal(swConglomerateProfile.matchedBy, "sw_l1");

  const genericProfile = resolveIndustryProfileSnapshot({ instrumentIndustry: "未知行业" });
  assert.equal(genericProfile.profileId, "generic");

  console.log("[test:linkage] ok");
}

main();
