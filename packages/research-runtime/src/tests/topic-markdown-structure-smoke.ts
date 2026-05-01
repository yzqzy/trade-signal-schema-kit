#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { validateFinalNarrativeMarkdown } from "../runtime/business-analysis/final-narrative-status.js";
import { PHASE1B_WEB_SEARCH_ITEMS } from "../adapters/websearch/query-templates.js";
import {
  emitSiteReportsFromRun,
  findPublishedMarkdownQualityViolations,
  rebuildSiteReportsIndex,
} from "../reports-site/emit-site-reports.js";
import { filterPhase1BHighSensitivityEvidencesForTest } from "../steps/phase1b/collector.js";
import { renderPhase1BMarkdown } from "../steps/phase1b/renderer.js";
import { renderAllReportPolishMarkdowns } from "../steps/phase3/report-polish/render-report-polish-markdown.js";
import type {
  ReportPolishComposeBuffers,
  ReportViewModelV1,
} from "../steps/phase3/report-polish/report-view-model.js";

function sampleVm(): ReportViewModelV1 {
  return {
    schema: "report_view_model",
    version: "1.0",
    generatedAt: "2026-04-25T00:00:00.000Z",
    runId: "r1",
    normalizedCode: "600887",
    displayCompanyName: "测试公司",
    evidence: {
      phase1aJsonRelative: "phase1a_data_pack.json",
      dataPackMarketMdRelative: "data_pack_market.md",
      phase1bQualitativeMdRelative: "phase1b_qualitative.md",
      dataPackReportMdRelative: "data_pack_report.md",
      valuationComputedJsonRelative: "valuation_computed.json",
      analysisReportMdRelative: "analysis_report.md",
      phase3PreflightMdRelative: "phase3_preflight.md",
    },
    phase1a: { instrument: { code: "600887", name: "测试公司", market: "CN_A", currency: "CNY" } },
    market: {
      code: "600887",
      name: "测试公司",
      market: "CN_A",
      currency: "CNY",
      price: 20,
      marketCap: 1000,
      totalShares: 50,
      riskFreeRate: 2,
      warningsCount: 1,
    },
    dataPackReport: { present: true, pdfGateVerdict: "DEGRADED", charCount: 1000 },
    phase1b: { present: true, charCount: 1000, leadLine: "# Phase1B" },
    phase3: {
      decision: "buy",
      confidence: "high",
      reportMode: "full",
      reportTitle: "测试",
      factor2: { passed: true, R: 8, II: 4, reason: "ok" },
      factor3: { passed: true, GG: 6, extrapolationTrust: "medium" },
      factor4: { passed: true, trapRisk: "low", position: "标准仓位" },
    },
    valuation: {
      code: "600887",
      generatedAt: "2026-04-25T00:00:00.000Z",
      companyType: "blue_chip_value",
      wacc: 7,
      ke: 8,
      methodCount: 1,
      weightedAverage: 30,
      coefficientOfVariation: 10,
      consistency: "medium",
    },
    policyResult: {
      policyId: "policy:turtle",
      runId: "r1",
      code: "600887",
      payload: { decision: "buy" },
      reasonRefs: [{ kind: "file", ref: "analysis_report.md" }],
    },
    topicReports: [
      {
        topicId: "topic:business-six-dimension",
        runId: "r1",
        code: "600887",
        siteTopicType: "business-quality",
        markdownPath: "business_quality.md",
        qualityStatus: "degraded",
        blockingReasons: ["草稿"],
        evidenceRefs: [{ kind: "file", ref: "data_pack_report.md" }],
      },
    ],
    todos: [],
  };
}

function sampleBuffers(): ReportPolishComposeBuffers {
  return {
    phase1bMarkdown: "## 7. 管理层与治理\n无裸链接正文\n## 8. 行业与竞争\n未搜索到相关信息\n## 10. MD&A 摘要",
    dataPackReportMarkdown: "gateVerdict `DEGRADED`\n## MDA 管理层讨论与分析\n摘录",
    interimDataPackMarkdown: "",
    marketPackMarkdown: "# 测试公司（600887）\n\n## §13 Warnings\n- ok",
    analysisReportMarkdown: "## 四、因子2\nR ok\n## 五、因子3\nGG ok\n## 六、因子4",
    valuationRawJson: JSON.stringify({
      code: "600887",
      generatedAt: "2026-04-25T00:00:00.000Z",
      methods: [{ method: "DCF", fairValue: 30, weight: 1 }],
    }),
  };
}

function assertTopicStructures(): void {
  const rendered = renderAllReportPolishMarkdowns(sampleVm(), sampleBuffers());
  const allMarkdown = Object.values(rendered).join("\n\n");
  assert.deepEqual(findPublishedMarkdownQualityViolations(allMarkdown), []);
  for (const forbidden of [
    "机械锚点",
    "候选片段",
    "供六维成稿引用",
    "站点只展示",
    "完整发布依据",
    "审计用",
    "缺口与 TODO",
    "本 run 无显式 TODO",
    "valuation_computed.json 为准",
    "估值结果（valuation_computed）",
    "原始 JSON",
    "发布链路",
    "F10 主链路",
    "结构化接口",
    "gateVerdict",
  ]) {
    assert.doesNotMatch(allMarkdown, new RegExp(forbidden, "u"));
  }
  assert.match(rendered.turtleOverviewMarkdown, /## Turtle KPI Snapshot/);
  assert.match(rendered.turtleOverviewMarkdown, /## 投资论点卡（Thesis Card）/);
  assert.match(rendered.turtleOverviewMarkdown, /现有材料未形成稳定股东回报证据|现有材料未形成可发布摘要/u);
  assert.match(rendered.businessQualityMarkdown, /## 维度一：商业模式与资本特征/);
  assert.match(rendered.businessQualityMarkdown, /## 监管与合规要点/);
  assert.doesNotMatch(rendered.businessQualityMarkdown, /https?:\/\//);
  assert.match(rendered.penetrationReturnMarkdown, /## STEP 0 数据校验与口径锚定/);
  assert.match(rendered.penetrationReturnMarkdown, /## STEP 11 交叉验证与可信度评级/);
  assert.match(rendered.penetrationReturnMarkdown, /## 附录：计算底稿摘要/);
  assert.doesNotMatch(rendered.penetrationReturnMarkdown, /结论：通过|通过门槛/);
  assert.match(rendered.valuationMarkdown, /## 五、DCF 敏感性矩阵/);
  assert.match(rendered.valuationMarkdown, /## 七、PE Band 历史分位区间/);
  assert.match(rendered.valuationMarkdown, /## 八、DDM \/ PEG 适用性说明/);
  assert.match(rendered.valuationMarkdown, /## 附录：结构化估值明细/);
  assert.ok(rendered.valuationMarkdown.indexOf("## 附录：结构化估值明细") > rendered.valuationMarkdown.indexOf("## 十一、估值结论"));
  assert.match(rendered.valuationMarkdown, /## 十、反向估值：当前价格隐含了什么？/);
  assert.match(rendered.valuationMarkdown, /## 十二、关键假设与风险提示/);
}

function assertFinalNarrativeValidation(): void {
  const completeReport = [
    "[终稿状态: 完成]",
    "> PDF 抽取质量声明：gate=DEGRADED，涉及年报章节均降级引用。",
    "## 监管与合规要点",
    "审计意见正常。[E1]",
    "## 附录：证据索引",
    "| 证据ID | 类型 | 摘要 | 链接或定位 |",
  ].join("\n\n");
  const d1d6 = [
    "[终稿状态: 完成]",
    "> PDF 抽取质量声明：gate=DEGRADED。",
    ...["D1", "D2", "D3", "D4", "D5", "D6"].map((d) => `## ${d} 测试\n核心判断。[E1]\n证据链条。[E1]\n结论。`),
    "## 附录：证据索引",
    "| 证据ID | 类型 | 摘要 | 链接或定位 |",
  ].join("\n\n");
  assert.equal(
    validateFinalNarrativeMarkdown({
      qualitativeReportMarkdown: completeReport,
      qualitativeD1D6Markdown: d1d6,
      dataPackReportMarkdown: "gateVerdict `DEGRADED`",
    }).status,
    "complete",
  );
  assert.equal(
    validateFinalNarrativeMarkdown({
      qualitativeReportMarkdown: completeReport.replace("## 附录：证据索引", "https://example.com\n## 附录：证据索引"),
      qualitativeD1D6Markdown: d1d6,
      dataPackReportMarkdown: "gateVerdict `DEGRADED`",
    }).status,
    "draft",
  );
  assert.equal(
    validateFinalNarrativeMarkdown({
      qualitativeReportMarkdown: completeReport,
      qualitativeD1D6Markdown: d1d6,
      dataPackReportMarkdown: "gateVerdict `CRITICAL`",
    }).status,
    "blocked",
  );
}

async function assertPublishedQualityGate(): Promise<void> {
  assert.deepEqual(findPublishedMarkdownQualityViolations("## qualitative_report.md\n\n正文"), ["文件名包装标题"]);
  assert.deepEqual(findPublishedMarkdownQualityViolations("本页是草稿，待 Claude Code 收口。"), [
    "内部状态词：草稿",
    "内部状态词：待 Claude",
  ]);
  assert.deepEqual(findPublishedMarkdownQualityViolations("估值页以 valuation_computed.json 为准，是机械锚点。"), [
    "内部流程词：机械锚点",
    "内部流程词：valuation_computed.json 为准",
  ]);
  assert.deepEqual(findPublishedMarkdownQualityViolations("本页包含候选片段，供六维成稿引用，站点只展示完整发布依据，审计用。"), [
    "内部流程词：候选片段",
    "内部流程词：供六维成稿引用",
    "内部流程词：站点只展示",
    "内部流程词：完整发布依据",
    "内部流程词：审计用",
  ]);
  assert.deepEqual(findPublishedMarkdownQualityViolations("## 缺口与 TODO\n\n_本 run 无显式 TODO 缺口项。_"), [
    "内部流程词：缺口与 TODO",
  ]);
  assert.deepEqual(findPublishedMarkdownQualityViolations("## 估值结果（valuation_computed）\n原始 JSON 仅作为发布链路。"), [
    "内部流程词：估值结果 valuation_computed",
    "内部流程词：原始 JSON",
    "内部流程词：发布链路",
  ]);
  assert.deepEqual(findPublishedMarkdownQualityViolations("gateVerdict=OK，F10 主链路可用，仍需补充结构化接口。"), [
    "内部流程词：F10 主链路",
    "内部流程词：结构化接口",
    "内部流程词：gateVerdict",
  ]);
}

async function assertSiteDedupPrefersComplete(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "reports-dedup-"));
  try {
    const siteDir = path.join(root, "site");
    const entries = path.join(siteDir, "entries");
    const degraded = path.join(entries, "2026-04-25-600887-biz-quality-aaaa1111");
    const complete = path.join(entries, "2026-04-25-600887-biz-quality-bbbb2222");
    await mkdir(degraded, { recursive: true });
    await mkdir(complete, { recursive: true });
    const base = {
      code: "600887",
      topicType: "business-quality",
      displayTitle: "测试公司（600887.SH） · 商业质量评估",
      publishedAt: "2026-04-25T01:00:00.000Z",
      sourceRunId: "r",
      confidenceState: "high",
      contentFile: "content.md",
    };
    await writeFile(
      path.join(degraded, "meta.json"),
      JSON.stringify({ ...base, entryId: path.basename(degraded), requiredFieldsStatus: "degraded" }, null, 2),
      "utf-8",
    );
    await writeFile(path.join(degraded, "content.md"), "# degraded", "utf-8");
    await writeFile(
      path.join(complete, "meta.json"),
      JSON.stringify({ ...base, entryId: path.basename(complete), requiredFieldsStatus: "complete" }, null, 2),
      "utf-8",
    );
    await writeFile(path.join(complete, "content.md"), "# complete", "utf-8");
    await rebuildSiteReportsIndex(siteDir);
    const timeline = JSON.parse(await readFile(path.join(siteDir, "views", "timeline.json"), "utf-8")) as Array<{
      entryId: string;
      requiredFieldsStatus: string;
    }>;
    assert.equal(timeline.length, 1);
    assert.equal(timeline[0]?.entryId, path.basename(complete));
    assert.equal(timeline[0]?.requiredFieldsStatus, "complete");
    await assert.rejects(readFile(path.join(degraded, "meta.json"), "utf-8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function assertBusinessAnalysisPublishesSingleMarkdown(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "reports-ba-"));
  try {
    const runDir = path.join(root, "run");
    const siteDir = path.join(root, "site");
    await mkdir(runDir, { recursive: true });
    const report = [
      "[终稿状态: 完成]",
      "# 测试公司（600887）· 商业质量评估",
      "> PDF 抽取质量声明：gate=DEGRADED，年报章节降级使用。[E1]",
      "## Executive Summary",
      "核心判断。[E1]",
      "## 关键发现",
      "- 发现一。[E1]",
      "## 监管与合规要点",
      "监管披露完整。[E1]",
      "## 交叉验证与深度分析",
      "数字与叙事一致。[E1]",
      "## 深度总结",
      "质量结论清晰。[E1]",
      "## 未来1-3年关键观察变量",
      "| 变量 | 观察 |",
      "|:--|:--|",
      "| 现金流 | 跟踪 |",
      "## 附录：证据索引",
      "| 证据ID | 类型 | 摘要 | 链接或定位 |",
      "|:--|:--|:--|:--|",
      "| E1 | 年报 | 摘要 | data_pack_report.md |",
    ].join("\n\n");
    const d1d6 = [
      "[终稿状态: 完成]",
      "> PDF 抽取质量声明：gate=DEGRADED。[E1]",
      ...["D1", "D2", "D3", "D4", "D5", "D6"].map((d) => `## ${d} 测试\n\n核心判断。[E1]\n\n证据链条。[E1]\n\n结论。`),
      "## 附录：证据索引",
      "| 证据ID | 类型 | 摘要 | 链接或定位 |",
      "| E1 | 年报 | 摘要 | data_pack_report.md |",
    ].join("\n\n");
    await writeFile(path.join(runDir, "qualitative_report.md"), report, "utf-8");
    await writeFile(path.join(runDir, "qualitative_d1_d6.md"), d1d6, "utf-8");
    await writeFile(
      path.join(runDir, "data_pack_report.md"),
      '<!-- PDF_EXTRACT_QUALITY:{"gateVerdict":"DEGRADED","missingCritical":[],"lowConfidenceCritical":["P13"],"allowsFinalNarrativeComplete":true,"humanReviewPriority":["P13"]} -->',
      "utf-8",
    );
    await writeFile(
      path.join(runDir, "phase1b_qualitative.json"),
      JSON.stringify(
        {
          stockCode: "600887",
          companyName: "测试公司",
          year: "2024",
          generatedAt: "2026-04-25T02:00:00.000Z",
          channel: "http",
          section7: [
            {
              item: "违规/处罚记录",
              content: "公司收到立案告知书，涉及信息披露违法违规风险。",
              evidences: [
                {
                  title: "关于公司收到立案告知书的公告",
                  url: "https://example.com/reg.pdf",
                  source: "交易所",
                  snippet: "公司涉嫌信息披露违法违规，被证监会立案调查。",
                },
              ],
              retrievalDiagnostics: {
                webSearchUsed: false,
                feedFallbackUsed: true,
                feedEvidenceCount: 1,
                evidenceRetrievalStatus: "feed_hit",
              },
            },
          ],
          section8: [],
          section10: [],
        },
        null,
        2,
      ),
      "utf-8",
    );
    await writeFile(
      path.join(runDir, "business_analysis_manifest.json"),
      JSON.stringify(
        {
          manifestVersion: "1.0",
          generatedAt: "2026-04-25T02:00:00.000Z",
          finalNarrativeStatus: "complete",
          finalNarrativeBlockingReasons: [],
          outputLayout: { code: "600887", runId: "ba-run" },
          input: { code: "600887", runId: "ba-run", companyName: "测试公司" },
          outputs: {
            qualitativeReportPath: "qualitative_report.md",
            qualitativeD1D6Path: "qualitative_d1_d6.md",
            phase1bJsonPath: "phase1b_qualitative.json",
            dataPackReportPath: "data_pack_report.md",
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    await emitSiteReportsFromRun({ runDir, siteDir });
    const entriesRoot = path.join(siteDir, "entries");
    const entryId = "2026-04-25-600887-biz-quality-barun";
    const content = await readFile(path.join(entriesRoot, entryId, "content.md"), "utf-8");
    const meta = JSON.parse(await readFile(path.join(entriesRoot, entryId, "meta.json"), "utf-8")) as {
      confidenceState: string;
    };
    assert.equal(meta.confidenceState, "medium");
    assert.doesNotMatch(content, /^##\s+qualitative_report\.md$/imu);
    assert.doesNotMatch(content, /^##\s+qualitative_d1_d6\.md$/imu);
    assert.doesNotMatch(content.slice(0, 300), /PDF 抽取质量声明/);
    assert.doesNotMatch(content, /rate_limit_exceeded|Volc WebSearch API/);
    assert.match(content, /证据质量：年报抽取为 DEGRADED，P13 需复核，详见文末。/);
    assert.match(content, /## 证据质量与限制/);
    assert.match(content, /## D1-D6 深度章节/);
    assert.equal((content.match(/^##\s+Quality Snapshot\s*$/gmu) ?? []).length, 1);
    assert.match(content, /\| 商业质量 \| 偏弱\/观察 \|/);
    assert.doesNotMatch(content, /\| 商业质量 \| 较强/);
    assert.deepEqual(findPublishedMarkdownQualityViolations(content), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function assertPhase1BRetrievalPresentation(): void {
  assert.equal(PHASE1B_WEB_SEARCH_ITEMS.has("违规/处罚记录"), false);
  assert.equal(PHASE1B_WEB_SEARCH_ITEMS.has("行业监管动态"), true);

  const md = renderPhase1BMarkdown({
    stockCode: "600887",
    companyName: "测试公司",
    year: "2024",
    generatedAt: "2026-04-25T02:00:00.000Z",
    channel: "http",
    section7: [
      {
        item: "违规/处罚记录",
        content: "⚠️ 未搜索到相关信息",
        evidences: [],
        retrievalDiagnostics: {
          webSearchUsed: true,
          webSearchProviderId: "volc",
          webSearchFailureReason: "UNKNOWN(rate_limit_exceeded): upstream",
          feedFallbackUsed: true,
          feedEvidenceCount: 0,
          evidenceRetrievalStatus: "web_limited_feed_empty",
        },
      },
    ],
    section8: [],
    section10: [],
  });
  assert.match(md, /官方源与开放信息补充检索均未形成可确认事项/);
  assert.doesNotMatch(md, /回退 Feed|WebSearch 受限/);

  const filtered = filterPhase1BHighSensitivityEvidencesForTest("违规/处罚记录", [
    {
      title: "募集资金专项账户开立及签署资金存储三方监管协议的核查意见",
      url: "https://example.com/a.pdf",
      source: "公告",
    },
    {
      title: "关于收到监管警示函的公告",
      url: "https://example.com/b.pdf",
      source: "交易所",
    },
  ]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.title, "关于收到监管警示函的公告");
}

assertTopicStructures();
assertFinalNarrativeValidation();
await assertPublishedQualityGate();
await assertSiteDedupPrefersComplete();
await assertBusinessAnalysisPublishesSingleMarkdown();
assertPhase1BRetrievalPresentation();
console.log("[test:topic-markdown-structure] ok");
