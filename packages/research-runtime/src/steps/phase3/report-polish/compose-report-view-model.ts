import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ValuationComputed } from "@trade-signal/schema-core";
import type { PolicyResult, SourceRef, TopicReport } from "@trade-signal/research-contracts";

import { parseDataPackMarket } from "../market-pack-parser.js";
import type { Phase3ExecutionResult } from "../types.js";
import type {
  ReportPolishComposeResult,
  ReportViewModelTodoV1,
  ReportViewModelV1,
} from "./report-view-model.js";

function rel(outputDir: string, filePath: string): string {
  const r = path.relative(outputDir, filePath);
  return r && !r.startsWith("..") ? r : path.basename(filePath);
}

function fileRef(outputDir: string, filePath: string, note?: string): SourceRef {
  return { kind: "file", ref: rel(outputDir, filePath), note };
}

function pickPdfGate(md: string): "OK" | "DEGRADED" | "CRITICAL" | undefined {
  const m = md.match(/gateVerdict[^`]*`([A-Z_]+)`/);
  const v = m?.[1];
  if (v === "OK" || v === "DEGRADED" || v === "CRITICAL") return v;
  return undefined;
}

function firstMeaningfulLine(md: string): string | undefined {
  for (const line of md.split(/\r?\n/u)) {
    const t = line.trim();
    if (t && !t.startsWith("<!--")) return t.slice(0, 200);
  }
  return undefined;
}

function isValuationComputed(v: unknown): v is ValuationComputed {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.code === "string" && Array.isArray(o.methods);
}

function summarizeValuation(raw: string): {
  summary: ReportViewModelV1["valuation"];
  todos: ReportViewModelTodoV1[];
} {
  const todos: ReportViewModelTodoV1[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    todos.push({
      id: "valuation-json-parse",
      message: "TODO：`valuation_computed.json` 解析失败，无法写入估值摘要字段。",
      suggestedSource: "valuation_computed.json",
    });
    return {
      summary: { code: "—", methodCount: 0 },
      todos,
    };
  }
  if (!isValuationComputed(parsed)) {
    todos.push({
      id: "valuation-json-shape",
      message: "TODO：`valuation_computed.json` 结构异常（缺少 code/methods）。",
      suggestedSource: "valuation_computed.json",
    });
    return {
      summary: { code: "—", methodCount: 0 },
      todos,
    };
  }
  const cv = parsed.crossValidation;
  return {
    summary: {
      code: parsed.code,
      generatedAt: parsed.generatedAt,
      companyType: parsed.companyType,
      wacc: parsed.wacc,
      ke: parsed.ke,
      methodCount: parsed.methods.length,
      weightedAverage: cv?.weightedAverage,
      coefficientOfVariation: cv?.coefficientOfVariation,
      consistency: cv?.consistency,
    },
    todos,
  };
}

function readPhase1aSummary(raw: string): ReportViewModelV1["phase1a"] {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const inst = j.instrument as Record<string, unknown> | undefined;
    const peerPool = j.peerComparablePool as Record<string, unknown> | undefined;
    const industryProfile = j.industryProfileSnapshot as Record<string, unknown> | undefined;
    const peersRaw = Array.isArray(peerPool?.peers) ? (peerPool.peers as Array<Record<string, unknown>>) : [];
    const kpiSignalsRaw = Array.isArray(industryProfile?.kpiSignals)
      ? (industryProfile.kpiSignals as Array<Record<string, unknown>>)
      : [];
    if (!inst) return { notes: ["TODO：phase1a_data_pack.json 缺少 instrument 节点。"] };
    return {
      instrument: {
        code: typeof inst.code === "string" ? inst.code : undefined,
        name: typeof inst.name === "string" ? inst.name : undefined,
        market: typeof inst.market === "string" ? inst.market : undefined,
        currency: typeof inst.currency === "string" ? inst.currency : undefined,
      },
      peerComparablePool: peerPool
        ? {
            source: typeof peerPool.source === "string" ? peerPool.source : undefined,
            industryName: typeof peerPool.industryName === "string" ? peerPool.industryName : undefined,
            sortColumn: typeof peerPool.sortColumn === "string" ? peerPool.sortColumn : undefined,
            peerCodes: Array.isArray(peerPool.peerCodes)
              ? peerPool.peerCodes.filter((c): c is string => typeof c === "string")
              : peersRaw.map((p) => p.code).filter((c): c is string => typeof c === "string"),
            peers: peersRaw
              .filter((p) => typeof p.code === "string")
              .map((p) => ({
                code: p.code as string,
                name: typeof p.name === "string" ? p.name : undefined,
                industryName: typeof p.industryName === "string" ? p.industryName : undefined,
                year: p.year !== undefined ? String(p.year) : undefined,
                revenueAllYear: typeof p.revenueAllYear === "number" ? p.revenueAllYear : undefined,
                parentNiAllYear: typeof p.parentNiAllYear === "number" ? p.parentNiAllYear : undefined,
                parentNi3Q: typeof p.parentNi3Q === "number" ? p.parentNi3Q : undefined,
                marketCap1Q: typeof p.marketCap1Q === "number" ? p.marketCap1Q : undefined,
                marketCap4Q: typeof p.marketCap4Q === "number" ? p.marketCap4Q : undefined,
              })),
            note: typeof peerPool.note === "string" ? peerPool.note : undefined,
          }
        : undefined,
      industryProfile: industryProfile
        ? {
            profileId:
              typeof industryProfile.profileId === "string" ? industryProfile.profileId : "generic",
            industryName:
              typeof industryProfile.industryName === "string" ? industryProfile.industryName : undefined,
            confidence:
              typeof industryProfile.confidence === "string" ? industryProfile.confidence : undefined,
            matchedBy:
              typeof industryProfile.matchedBy === "string" ? industryProfile.matchedBy : undefined,
            kpiSignals: kpiSignalsRaw
              .filter((s) => typeof s.key === "string" && typeof s.label === "string")
              .slice(0, 10)
              .map((s) => ({
                key: s.key as string,
                label: s.label as string,
                summary: typeof s.summary === "string" ? s.summary : "",
                source: typeof s.source === "string" ? s.source : undefined,
                confidence: typeof s.confidence === "string" ? s.confidence : undefined,
              })),
            missingKpis: Array.isArray(industryProfile.missingKpis)
              ? industryProfile.missingKpis.filter((x): x is string => typeof x === "string")
              : [],
            sourceRefs: Array.isArray(industryProfile.sourceRefs)
              ? industryProfile.sourceRefs.filter((x): x is string => typeof x === "string")
              : [],
          }
        : undefined,
    };
  } catch {
    return { notes: ["TODO：phase1a_data_pack.json 非合法 JSON。"] };
  }
}

export type ComposeReportViewModelInput = {
  outputDir: string;
  runId?: string;
  normalizedCode: string;
  displayCompanyName?: string;
  phase1aJsonPath: string;
  marketPackPath: string;
  marketPackMarkdown: string;
  phase1bMarkdownPath: string;
  phase2bMarkdownPath?: string;
  phase2bInterimMarkdownPath?: string;
  valuationPath: string;
  reportMarkdownPath: string;
  phase3PreflightPath?: string;
  phase3Execution: Phase3ExecutionResult;
};

/**
 * 从磁盘与同进程 Phase3 结果组装 `ReportViewModelV1` 与渲染用全文缓冲。
 */
export async function composeReportViewModel(input: ComposeReportViewModelInput): Promise<ReportPolishComposeResult> {
  const outputDir = input.outputDir;
  const todos: ReportViewModelTodoV1[] = [];

  const phase1aRaw = await readFile(input.phase1aJsonPath, "utf-8");
  const phase1a = readPhase1aSummary(phase1aRaw);

  const parsedMarket = parseDataPackMarket(input.marketPackMarkdown);
  const market = {
    code: parsedMarket.code,
    name: parsedMarket.name,
    market: parsedMarket.market,
    currency: parsedMarket.currency,
    price: parsedMarket.price,
    marketCap: parsedMarket.marketCap,
    totalShares: parsedMarket.totalShares,
    peTtm: parsedMarket.peTtm,
    pePercentile: parsedMarket.pePercentile,
    peP25: parsedMarket.peP25,
    peP50: parsedMarket.peP50,
    peP75: parsedMarket.peP75,
    riskFreeRate: parsedMarket.rf,
    warningsCount: parsedMarket.warnings?.length ?? 0,
  };

  const phase1bMarkdown = await readFile(input.phase1bMarkdownPath, "utf-8");
  const phase1bMeta = {
    present: phase1bMarkdown.trim().length > 0,
    charCount: phase1bMarkdown.length,
    leadLine: firstMeaningfulLine(phase1bMarkdown),
  };
  if (!phase1bMeta.present) {
    todos.push({
      id: "phase1b-empty",
      message: "TODO：Phase1B 稿件为空，商业质量页仅能降级展示。",
      suggestedSource: "phase1b_qualitative.md",
    });
  }

  let dataPackReportMarkdown = "";
  if (input.phase2bMarkdownPath) {
    try {
      dataPackReportMarkdown = await readFile(input.phase2bMarkdownPath, "utf-8");
    } catch {
      todos.push({
        id: "data-pack-report-read",
        message: "TODO：无法读取 `data_pack_report.md`（年报证据包）。",
        suggestedSource: rel(outputDir, input.phase2bMarkdownPath),
      });
    }
  } else {
    todos.push({
      id: "data-pack-report-missing",
      message: "TODO：本 run 未挂载 `data_pack_report.md`（phase2bMarkdownPath）。",
      suggestedSource: "data_pack_report.md",
    });
  }

  const dataPackReport = {
    present: dataPackReportMarkdown.trim().length > 0,
    pdfGateVerdict: dataPackReportMarkdown ? pickPdfGate(dataPackReportMarkdown) : undefined,
    charCount: dataPackReportMarkdown.length,
  };

  let interimMd = "";
  if (input.phase2bInterimMarkdownPath) {
    try {
      interimMd = await readFile(input.phase2bInterimMarkdownPath, "utf-8");
    } catch {
      /* optional */
    }
  }

  const valuationRawJson = await readFile(input.valuationPath, "utf-8");
  const { summary: valuation, todos: valTodos } = summarizeValuation(valuationRawJson);
  todos.push(...valTodos);

  const analysisReportMarkdown = await readFile(input.reportMarkdownPath, "utf-8");
  const exec = input.phase3Execution;
  const report = exec.report;

  const phase3: ReportViewModelV1["phase3"] = {
    decision: exec.decision,
    confidence: exec.confidence,
    reportMode: exec.reportMode,
    reportTitle: report.title,
    factor2: exec.factor2
      ? {
          passed: exec.factor2.passed,
          A: exec.factor2.A,
          C: exec.factor2.C,
          D: exec.factor2.D,
          I: exec.factor2.I,
          R: exec.factor2.R,
          II: exec.factor2.II,
          rejectType: exec.factor2.rejectType,
          reason: exec.factor2.reason,
        }
      : undefined,
    factor3: exec.factor3
      ? {
          passed: exec.factor3.passed,
          GG: exec.factor3.GG,
          HH: exec.factor3.HH,
          extrapolationTrust: exec.factor3.extrapolationTrust,
          reason: exec.factor3.reason,
        }
      : undefined,
    factor4: exec.factor4
      ? {
          passed: exec.factor4.passed,
          trapRisk: exec.factor4.trapRisk,
          position: exec.factor4.position,
        }
      : undefined,
  };

  if (!dataPackReport.present) {
    todos.push({
      id: "narrative-data-pack",
      message: "TODO：缺少年报 `data_pack_report.md` 时，叙事层不得编造章节置信；请在 Phase2B 后重跑。",
      suggestedSource: "data_pack_report.md",
    });
  }

  const evidence: ReportViewModelV1["evidence"] = {
    phase1aJsonRelative: rel(outputDir, input.phase1aJsonPath),
    dataPackMarketMdRelative: rel(outputDir, input.marketPackPath),
    phase1bQualitativeMdRelative: rel(outputDir, input.phase1bMarkdownPath),
    dataPackReportMdRelative: input.phase2bMarkdownPath ? rel(outputDir, input.phase2bMarkdownPath) : undefined,
    dataPackReportInterimMdRelative: input.phase2bInterimMarkdownPath
      ? rel(outputDir, input.phase2bInterimMarkdownPath)
      : undefined,
    valuationComputedJsonRelative: rel(outputDir, input.valuationPath),
    analysisReportMdRelative: rel(outputDir, input.reportMarkdownPath),
    phase3PreflightMdRelative: input.phase3PreflightPath ? rel(outputDir, input.phase3PreflightPath) : undefined,
  };

  const policyReasonRefs: SourceRef[] = [
    fileRef(outputDir, input.reportMarkdownPath, "Phase3 规则报告"),
    fileRef(outputDir, input.valuationPath, "估值计算结果"),
    fileRef(outputDir, input.marketPackPath, "市场与财务数据包"),
  ];
  if (input.phase2bMarkdownPath) {
    policyReasonRefs.push(fileRef(outputDir, input.phase2bMarkdownPath, "年报证据包"));
  }
  const policyResult: PolicyResult = {
    policyId: "policy:turtle",
    runId: input.runId ?? "",
    code: input.normalizedCode,
    payload: {
      decision: exec.decision,
      confidence: exec.confidence,
      reportMode: exec.reportMode ?? "full",
      factor2: phase3.factor2,
      factor3: phase3.factor3,
      factor4: phase3.factor4,
      valuation,
    },
    reasonRefs: policyReasonRefs,
  };

  const topicEvidenceRefs: SourceRef[] = [
    fileRef(outputDir, input.phase1aJsonPath, "Phase1A 数据包"),
    fileRef(outputDir, input.marketPackPath, "市场数据包"),
    fileRef(outputDir, input.phase1bMarkdownPath, "Phase1B 外部证据补充"),
    fileRef(outputDir, input.valuationPath, "估值 JSON"),
    fileRef(outputDir, input.reportMarkdownPath, "Phase3 规则报告"),
  ];
  if (input.phase2bMarkdownPath) topicEvidenceRefs.push(fileRef(outputDir, input.phase2bMarkdownPath, "年报 data_pack"));
  if (input.phase3PreflightPath) topicEvidenceRefs.push(fileRef(outputDir, input.phase3PreflightPath, "Phase3 预检"));
  const businessStatus = dataPackReport.present && dataPackReport.pdfGateVerdict !== "CRITICAL" ? "degraded" : "blocked";
  const topicReports: TopicReport[] = [
    {
      topicId: "topic:turtle-strategy-explainer",
      runId: input.runId ?? "",
      code: input.normalizedCode,
      siteTopicType: "turtle-strategy",
      markdownPath: "turtle_overview.md",
      qualityStatus: "complete",
      evidenceRefs: topicEvidenceRefs,
    },
    {
      topicId: "topic:business-six-dimension",
      runId: input.runId ?? "",
      code: input.normalizedCode,
      siteTopicType: "business-quality",
      markdownPath: "business_quality.md",
      qualityStatus: businessStatus,
      blockingReasons:
        businessStatus === "blocked"
          ? ["商业六维页未达到完整发布条件，且年报证据包缺失或抽取质量为 CRITICAL"]
          : ["商业六维页仍为结构化预览；完整发布需六维成稿质量达标"],
      evidenceRefs: topicEvidenceRefs,
    },
    {
      topicId: "topic:penetration-return",
      runId: input.runId ?? "",
      code: input.normalizedCode,
      siteTopicType: "penetration-return",
      markdownPath: "penetration_return.md",
      qualityStatus: "complete",
      evidenceRefs: topicEvidenceRefs,
    },
    {
      topicId: "topic:valuation",
      runId: input.runId ?? "",
      code: input.normalizedCode,
      siteTopicType: "valuation",
      markdownPath: "valuation.md",
      qualityStatus: valuation.methodCount > 0 ? "complete" : "degraded",
      evidenceRefs: topicEvidenceRefs,
    },
  ];

  const viewModel: ReportViewModelV1 = {
    schema: "report_view_model",
    version: "1.0",
    generatedAt: new Date().toISOString(),
    runId: input.runId,
    normalizedCode: input.normalizedCode,
    displayCompanyName: input.displayCompanyName ?? phase1a.instrument?.name ?? parsedMarket.name,
    evidence,
    phase1a,
    market,
    dataPackReport,
    phase1b: phase1bMeta,
    phase3,
    valuation,
    policyResult,
    topicReports,
    todos,
  };

  return {
    viewModel,
    buffers: {
      phase1bMarkdown,
      dataPackReportMarkdown,
      interimDataPackMarkdown: interimMd,
      marketPackMarkdown: input.marketPackMarkdown,
      analysisReportMarkdown,
      valuationRawJson,
    },
  };
}
