import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DataPackMarket, Market } from "@trade-signal/schema-core";

import { resolveOutputPath } from "../crosscut/normalization/resolve-monorepo-path.js";
import { formatListedCode } from "./listed-code.js";
import { buildDisplayTitle, TOPIC_ENTRY_SLUG } from "./topic-labels.js";
import { renderValuationComputedMarkdownFromJson } from "./valuation-computed-markdown.js";
import type {
  ConfidenceState,
  EntryMeta,
  ReportTopicType,
  RequiredFieldsStatus,
  SiteReportsIndex,
  TimelineItem,
} from "./types.js";
import {
  siteTopicTypeToV2TopicId,
  TOPIC_MANIFEST_VERSION,
  type TopicManifestEntryV1,
  type TopicManifestV1,
} from "./topic-manifest-v2.js";
import {
  validateFinalNarrativeMarkdown,
  type FinalNarrativeStatus,
} from "../runtime/business-analysis/final-narrative-status.js";
import type { Phase1BItem, Phase1BQualitativeSupplement } from "../steps/phase1b/types.js";

export type EmitSiteReportsOptions = {
  /** workflow 或 business-analysis 单次 run 根目录（含 manifest） */
  runDir: string;
  /** 聚合站点根目录，默认 `output/site/reports`（相对 monorepo 根） */
  siteDir?: string;
};

function shortRunId(runId: string): string {
  const compact = runId.replace(/-/g, "");
  return (compact.slice(0, 8) || "00000000").toLowerCase();
}

function dateKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function formatLocalDateTime(input: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const y = input.getFullYear();
  const m = pad(input.getMonth() + 1);
  const d = pad(input.getDate());
  const hh = pad(input.getHours());
  const mm = pad(input.getMinutes());
  const ss = pad(input.getSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(p: string): Promise<T> {
  const raw = await readFile(p, "utf-8");
  return JSON.parse(raw) as T;
}

function resolveArtifactPath(runDir: string, filePath?: string): string | undefined {
  const p = filePath?.trim();
  if (!p) return undefined;
  return path.isAbsolute(p) ? p : path.resolve(runDir, p);
}

function relFromRun(runDir: string, absPath?: string): string | undefined {
  if (!absPath) return undefined;
  try {
    const r = path.relative(runDir, absPath);
    return r && !r.startsWith("..") ? r : undefined;
  } catch {
    return undefined;
  }
}

async function writeTopicManifest(runDir: string, body: TopicManifestV1): Promise<void> {
  const out = path.join(runDir, "topic_manifest.json");
  await writeFile(out, JSON.stringify(body, null, 2), "utf-8");
}

/** 从 `data_pack_market.md` 首行标题（如 `# 伊利股份（600887）`）与「市场」行推断展示名与板块 */
function parseMarketPackMarkdownContext(md: string): { companyName?: string; market?: Market } {
  const firstLine = (md.trim().split(/\r?\n/u)[0] ?? "").trim();
  const h1 = firstLine.match(/^#\s*(.+)$/u);
  let companyName: string | undefined;
  if (h1) {
    const inner = h1[1].trim();
    const paren = inner.match(/^(.+?)（\s*([0-9A-Za-z._-]+)\s*）\s*$/u);
    companyName = paren ? paren[1].trim() : inner;
  }
  const marketLine = md.match(/^\s*-\s*市场：\s*(\S+)/imu);
  const rawM = marketLine?.[1]?.trim();
  const market: Market | undefined = rawM === "HK" || rawM === "CN_A" ? rawM : undefined;
  return { companyName, market };
}

async function tryReadCompanyContext(
  runDir: string,
  manifestInput: Record<string, unknown>,
  options?: { marketPackPath?: string },
): Promise<{ name: string; market?: Market }> {
  const code = String(manifestInput.code ?? "").trim() || "—";
  const fromInput = manifestInput.companyName;
  if (typeof fromInput === "string" && fromInput.trim()) {
    return { name: fromInput.trim() };
  }
  const p1 = path.join(runDir, "phase1a_data_pack.json");
  if (await pathExists(p1)) {
    try {
      const pack = await readJson<DataPackMarket>(p1);
      const name = pack.instrument?.name?.trim();
      const market = pack.instrument?.market;
      if (name) return { name, market };
    } catch {
      /* ignore */
    }
  }
  const marketAbs = resolveArtifactPath(runDir, options?.marketPackPath);
  if (marketAbs && (await pathExists(marketAbs))) {
    try {
      const md = await readFile(marketAbs, "utf-8");
      const parsed = parseMarketPackMarkdownContext(md);
      if (parsed.companyName) return { name: parsed.companyName, market: parsed.market };
      if (parsed.market) return { name: code, market: parsed.market };
    } catch {
      /* ignore */
    }
  }
  return { name: code };
}

function normalizeConfidenceToken(raw: string | undefined): ConfidenceState | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === "high" || v === "medium" || v === "low") return v;
  return undefined;
}

/** 从 Phase3 / 定性稿 Markdown 提取置信度（YAML 列表或执行摘要表「分析置信度」行） */
function parseConfidenceFromReportMd(md: string): ConfidenceState {
  const yaml = normalizeConfidenceToken(md.match(/^\s*-\s*confidence:\s*(\S+)/im)?.[1]);
  if (yaml) return yaml;

  const tableCell = md.match(/\|\s*分析置信度\s*\|\s*([^|\n]+?)\s*\|/imu)?.[1];
  const fromTable = normalizeConfidenceToken(tableCell);
  if (fromTable) return fromTable;

  return "unknown";
}

function buildEntryId(date: string, codeDigits: string, topic: ReportTopicType, runShort: string): string {
  const slug = TOPIC_ENTRY_SLUG[topic];
  return `${date}-${codeDigits}-${slug}-${runShort}`;
}

function joinSections(sections: string[]): string {
  return sections
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
}

async function writeEntry(params: {
  siteDir: string;
  meta: EntryMeta;
  contentMarkdown: string;
}): Promise<void> {
  const violations = findPublishedMarkdownQualityViolations(params.contentMarkdown);
  if (violations.length > 0) {
    throw new Error(
      `[reports-site] ${params.meta.entryId} 含发布禁用内容：${violations.join(", ")}`,
    );
  }
  const dir = path.join(params.siteDir, "entries", params.meta.entryId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(params.meta, null, 2), "utf-8");
  await writeFile(path.join(dir, "content.md"), params.contentMarkdown, "utf-8");
}

export function findPublishedMarkdownQualityViolations(markdown: string): string[] {
  const checks: Array<[string, RegExp]> = [
    ["文件名包装标题", /^##\s+qualitative_(?:report|d1_d6)\.md\s*$/imu],
    ["内部状态词：草稿", /草稿/u],
    ["内部状态词：待 Claude", /待\s*Claude(?:\s*Code)?/iu],
    ["内部状态词：尚未完成", /尚未完成/u],
    ["内部状态词：成稿要求", /成稿要求/u],
    ["内部状态词：初始状态", /初始状态/u],
  ];
  return checks.filter(([, re]) => re.test(markdown)).map(([name]) => name);
}

function statusRank(s: RequiredFieldsStatus): number {
  if (s === "complete") return 3;
  if (s === "degraded") return 2;
  return 1;
}

function isBetterTimelineItem(a: TimelineItem, b: TimelineItem): boolean {
  const ar = statusRank(a.requiredFieldsStatus);
  const br = statusRank(b.requiredFieldsStatus);
  if (ar !== br) return ar > br;
  if (a.publishedAt !== b.publishedAt) return a.publishedAt > b.publishedAt;
  return a.entryId > b.entryId;
}

function stripFinalStatusLine(markdown: string): string {
  return markdown
    .replace(/^\s*\[终稿状态:\s*(?:完成|complete)\]\s*\n*/imu, "")
    .trim();
}

function splitEvidenceAppendix(markdown: string): { body: string; appendix: string } {
  const idx = markdown.search(/^##\s+附录：证据索引\s*$/imu);
  if (idx < 0) return { body: markdown.trim(), appendix: "" };
  return {
    body: markdown.slice(0, idx).trim(),
    appendix: markdown.slice(idx).trim(),
  };
}

function hasD1D6Sections(markdown: string): boolean {
  return ["D1", "D2", "D3", "D4", "D5", "D6"].every((d) =>
    new RegExp(`^##\\s+${d}\\b`, "imu").test(markdown),
  );
}

type PdfQualitySummary = {
  gateVerdict?: "OK" | "DEGRADED" | "CRITICAL" | string;
  lowConfidenceCritical?: string[];
  missingCritical?: string[];
  allowsFinalNarrativeComplete?: boolean;
  humanReviewPriority?: string[];
};

type EvidenceRetrievalSummary = {
  hasCriticalGap: boolean;
  webSearchUsed: boolean;
  webSearchLimited: boolean;
  missingItems: string[];
  limitedItems: string[];
};

function parsePdfQualitySummary(markdown: string | undefined): PdfQualitySummary {
  if (!markdown?.trim()) return {};
  const m = markdown.match(/<!--\s*PDF_EXTRACT_QUALITY:(\{[\s\S]*?\})\s*-->/u);
  if (m?.[1]) {
    try {
      return JSON.parse(m[1]) as PdfQualitySummary;
    } catch {
      /* fall through */
    }
  }
  const gate = markdown.match(/gateVerdict["`:\s=]+(OK|DEGRADED|CRITICAL)/iu)?.[1]?.toUpperCase();
  return gate ? { gateVerdict: gate } : {};
}

function isRateLimited(reason: string | undefined): boolean {
  return /rate[_ -]?limit|限流|quota|too many/i.test(reason ?? "");
}

function flattenPhase1BItems(phase1b: Phase1BQualitativeSupplement | undefined): Phase1BItem[] {
  if (!phase1b) return [];
  return [...(phase1b.section7 ?? []), ...(phase1b.section8 ?? [])];
}

function summarizeEvidenceRetrieval(phase1b: Phase1BQualitativeSupplement | undefined): EvidenceRetrievalSummary {
  const critical = /违规|处罚|诉讼|仲裁|监管|问询|关注函|警示函|立案|纪律处分|公开谴责/u;
  const items = flattenPhase1BItems(phase1b);
  const missing = items.filter((it) => it.evidences.length === 0);
  const limited = items.filter((it) => isRateLimited(it.retrievalDiagnostics?.webSearchFailureReason));
  return {
    hasCriticalGap: missing.some((it) => critical.test(it.item)),
    webSearchUsed: items.some((it) => it.retrievalDiagnostics?.webSearchUsed),
    webSearchLimited: limited.length > 0,
    missingItems: missing.map((it) => it.item),
    limitedItems: limited.map((it) => it.item),
  };
}

function deriveBusinessAnalysisConfidence(input: {
  status: RequiredFieldsStatus;
  finalNarrativeStatus: FinalNarrativeStatus;
  pdfQuality: PdfQualitySummary;
  evidence: EvidenceRetrievalSummary;
}): ConfidenceState {
  if (input.finalNarrativeStatus === "blocked" || input.status === "missing") return "unknown";
  if (input.finalNarrativeStatus !== "complete" || input.status === "degraded") return "low";
  if (input.pdfQuality.gateVerdict === "CRITICAL") return "low";
  if (input.pdfQuality.gateVerdict === "DEGRADED") return "medium";
  if (input.evidence.hasCriticalGap || input.evidence.webSearchLimited) return "medium";
  return "high";
}

function evidenceStatusLabel(evidence: EvidenceRetrievalSummary): string {
  if (evidence.webSearchLimited && evidence.missingItems.length > 0) {
    return "外部检索受限，已回退 Feed；部分关键项仍未形成可确认候选证据";
  }
  if (evidence.hasCriticalGap) return "关键合规项存在证据缺口";
  if (evidence.webSearchUsed) return "WebSearch / Feed 已形成候选证据";
  return "Feed 已形成候选证据";
}

function renderQualitySnapshot(input: {
  confidence: ConfidenceState;
  pdfQuality: PdfQualitySummary;
  evidence: EvidenceRetrievalSummary;
}): string {
  const gate = input.pdfQuality.gateVerdict ?? "UNKNOWN";
  const low = input.pdfQuality.lowConfidenceCritical?.length ? input.pdfQuality.lowConfidenceCritical.join(", ") : "无";
  return [
    "## Quality Snapshot",
    "",
    "| 项目 | 状态 |",
    "|:-----|:-----|",
    "| 商业质量 | 较强但需观察 |",
    `| 最终置信度 | ${input.confidence} |`,
    `| PDF gate | ${gate}；低置信关键块：${low} |`,
    `| 监管证据状态 | ${evidenceStatusLabel(input.evidence)} |`,
    `| 证据完整度 | ${input.evidence.missingItems.length > 0 ? `存在缺口：${input.evidence.missingItems.join("、")}` : "关键项已形成候选证据"} |`,
  ].join("\n");
}

function compactPdfLead(markdown: string, pdfQuality: PdfQualitySummary): string {
  const gate = pdfQuality.gateVerdict;
  if (gate !== "DEGRADED" && gate !== "CRITICAL") return markdown.trim();
  const low = pdfQuality.lowConfidenceCritical?.length ? pdfQuality.lowConfidenceCritical.join(", ") : "部分章节";
  const short = `> 证据质量：年报抽取为 ${gate}，${low} 需复核，详见文末。`;
  return markdown
    .replace(/^>\s*PDF 抽取质量声明：.*(?:\r?\n)?/mu, `${short}\n`)
    .trim();
}

function sanitizeTechnicalEvidenceText(markdown: string): string {
  return markdown
    .replace(/WebSearch rate limit|WebSearch\s+rate_limit|rate_limit_exceeded|Volc WebSearch API 错误 \[[^\]]+\]/giu, "外部检索受限")
    .replace(/检索过程受到\s*外部检索受限\s*影响/gu, "外部检索受限")
    .replace(/且外部搜索存在限流失败/gu, "且外部检索受限")
    .replace(/、Phase1B\s*监管\/处罚检索缺口，以及\s*P13\s*低置信导致非经常性损益判断需降级/gu, "，以及外部证据与 PDF 抽取质量边界");
}

function moveEvidenceGapsBeforeAppendix(markdown: string): string {
  const gapRe = /^##\s+证据缺口清单（Phase1B）\s*[\s\S]*?(?=^##\s+附录：证据索引\s*$|(?![\s\S]))/imu;
  const m = markdown.match(gapRe);
  if (!m?.[0]) return markdown;
  const without = markdown.replace(gapRe, "").replace(/\n{3,}/g, "\n\n").trim();
  const appendixAt = without.search(/^##\s+附录：证据索引\s*$/imu);
  if (appendixAt < 0) return [without, m[0].trim()].join("\n\n");
  return [without.slice(0, appendixAt).trim(), m[0].trim(), without.slice(appendixAt).trim()].join("\n\n");
}

function normalizeRegulatorySection(markdown: string): string {
  const re = /^##\s+监管与合规要点\s*\n([\s\S]*?)(?=^##\s+)/mu;
  const m = markdown.match(re);
  if (!m?.[1]) return markdown;
  const lines = m[1].trim().split(/\r?\n/u).filter((line) => line.trim());
  const bullets = lines.filter((line) => line.trim().startsWith("- "));
  if (bullets.length === 0 || /###\s+已确认事项/u.test(m[1])) return markdown;
  const confirmed = bullets.filter((line) => /审计意见|内控|资本配置|回购/u.test(line));
  const notFound = bullets.filter((line) => /处罚|监管措施|诉讼|仲裁/u.test(line));
  const needsReview = bullets.filter((line) => !confirmed.includes(line) && !notFound.includes(line));
  const block = [
    "## 监管与合规要点",
    "",
    "### 已确认事项",
    "",
    ...(confirmed.length ? confirmed : ["- 本次证据包未形成可直接确认的新增监管事项。"]),
    "",
    "### 未发现但证据不足",
    "",
    ...(notFound.length ? notFound : ["- 暂无需要以否定式披露的事项；若依赖外部检索，仍以证据缺口清单为准。"]),
    "",
    "### 需补充核验",
    "",
    ...(needsReview.length ? needsReview : ["- 无额外补充核验项。"]),
    "",
  ].join("\n");
  return markdown.replace(re, `${block}\n`);
}

function renderEvidenceQualitySection(input: {
  pdfQuality: PdfQualitySummary;
  evidence: EvidenceRetrievalSummary;
}): string {
  const rows = [
    "## 证据质量与限制",
    "",
    "| 项目 | 说明 |",
    "|:-----|:-----|",
  ];
  const gate = input.pdfQuality.gateVerdict ?? "UNKNOWN";
  const low = input.pdfQuality.lowConfidenceCritical?.length ? input.pdfQuality.lowConfidenceCritical.join("、") : "无";
  const missing = input.pdfQuality.missingCritical?.length ? input.pdfQuality.missingCritical.join("、") : "无";
  rows.push(`| PDF 抽取 | gate=${gate}；低置信关键块=${low}；缺失关键块=${missing} |`);
  rows.push(`| 人工复核优先级 | ${input.pdfQuality.humanReviewPriority?.length ? input.pdfQuality.humanReviewPriority.join("、") : "无"} |`);
  rows.push(`| 外部证据检索 | ${evidenceStatusLabel(input.evidence)} |`);
  rows.push(`| WebSearch | ${input.evidence.webSearchUsed ? (input.evidence.webSearchLimited ? "已尝试，但部分查询受限并回退 Feed" : "已尝试并完成") : "未启用"} |`);
  rows.push(`| 仍需补链 | ${input.evidence.missingItems.length ? input.evidence.missingItems.join("、") : "无"} |`);
  return rows.join("\n");
}

function renderBusinessAnalysisPublishedMarkdown(input: {
  qualitativeReportMarkdown: string;
  qualitativeD1D6Markdown: string;
  finalNarrativeStatus: FinalNarrativeStatus;
  confidence: ConfidenceState;
  pdfQuality: PdfQualitySummary;
  evidence: EvidenceRetrievalSummary;
}): string {
  const q = moveEvidenceGapsBeforeAppendix(
    normalizeRegulatorySection(
      sanitizeTechnicalEvidenceText(compactPdfLead(stripFinalStatusLine(input.qualitativeReportMarkdown), input.pdfQuality)),
    ),
  );
  const d = stripFinalStatusLine(input.qualitativeD1D6Markdown);
  const qSplit = splitEvidenceAppendix(q);
  const dSplit = splitEvidenceAppendix(d);
  const sections = [qSplit.body.replace(/^(# .+?\n(?:> .+?\n)?)/u, `$1\n${renderQualitySnapshot(input)}\n`)];
  if (input.finalNarrativeStatus === "complete" && dSplit.body && !hasD1D6Sections(qSplit.body)) {
    sections.push(["## D1-D6 深度章节", "", dSplit.body].join("\n"));
  }
  sections.push(renderEvidenceQualitySection(input));
  if (qSplit.appendix) {
    sections.push(qSplit.appendix);
  } else if (dSplit.appendix) {
    sections.push(dSplit.appendix);
  }
  return sections
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/外部搜索有\s*rate\s+limit\s*失败/giu, "外部检索受限")
    .replace(/rate\s+limit/giu, "外部检索受限");
}

type WorkflowManifest = {
  manifestVersion: string;
  generatedAt: string;
  outputLayout: { code: string; runId: string };
  input: Record<string, unknown>;
  outputs: {
    phase1aJsonPath?: string;
    marketPackPath?: string;
    phase1bMarkdownPath?: string;
    valuationPath?: string;
    reportMarkdownPath?: string;
    reportViewModelPath?: string;
    turtleOverviewMarkdownPath?: string;
    businessQualityMarkdownPath?: string;
    penetrationReturnMarkdownPath?: string;
    /** 与 `valuation.md` 文件对应（workflow manifest 字段名） */
    valuationMarkdownPath?: string;
  };
  orchestration?: { threadId?: string; runId?: string };
};

type BusinessAnalysisManifest = {
  manifestVersion: string;
  generatedAt: string;
  finalNarrativeStatus?: FinalNarrativeStatus;
  finalNarrativeBlockingReasons?: string[];
  outputLayout: { code: string; runId: string };
  input: Record<string, unknown>;
  outputs: {
    qualitativeReportPath?: string;
    qualitativeD1D6Path?: string;
    marketPackPath?: string;
    phase1bJsonPath?: string;
    phase1bMarkdownPath?: string;
    dataPackReportPath?: string;
  };
};

type WorkflowReportViewModel = {
  topicReports?: Array<{
    topicId?: string;
    siteTopicType?: string;
    qualityStatus?: "complete" | "degraded" | "blocked" | "draft";
    blockingReasons?: string[];
  }>;
};

async function emitFromWorkflow(runDir: string, siteDir: string, manifestPath: string): Promise<void> {
  const m = await readJson<WorkflowManifest>(manifestPath);
  const publishedAt = m.generatedAt;
  const date = dateKeyFromIso(publishedAt);
  const codeDigits = String(m.outputLayout.code ?? "").replace(/\D/g, "") || m.outputLayout.code;
  const sourceRunId = String(m.orchestration?.threadId ?? m.orchestration?.runId ?? m.outputLayout.runId ?? "");
  const runShort = shortRunId(sourceRunId || m.outputLayout.runId || "run");
  const reportMdPath = resolveArtifactPath(runDir, m.outputs.reportMarkdownPath);
  const valuationPath = resolveArtifactPath(runDir, m.outputs.valuationPath);
  const marketPath = resolveArtifactPath(runDir, m.outputs.marketPackPath);
  const polishOverviewPath = resolveArtifactPath(runDir, m.outputs.turtleOverviewMarkdownPath);
  const polishBusinessPath = resolveArtifactPath(runDir, m.outputs.businessQualityMarkdownPath);
  const polishPenetrationPath = resolveArtifactPath(runDir, m.outputs.penetrationReturnMarkdownPath);
  const polishValuationPath = resolveArtifactPath(runDir, m.outputs.valuationMarkdownPath);
  const reportViewModelPath = resolveArtifactPath(runDir, m.outputs.reportViewModelPath);
  let topicQuality = new Map<string, { qualityStatus?: "complete" | "degraded" | "blocked" | "draft"; blockingReasons?: string[] }>();
  if (reportViewModelPath && (await pathExists(reportViewModelPath))) {
    try {
      const vm = await readJson<WorkflowReportViewModel>(reportViewModelPath);
      topicQuality = new Map(
        (vm.topicReports ?? [])
          .filter((t) => t.siteTopicType)
          .map((t) => [
            String(t.siteTopicType),
            { qualityStatus: t.qualityStatus, blockingReasons: t.blockingReasons },
          ]),
      );
    } catch {
      topicQuality = new Map();
    }
  }

  const ctx = await tryReadCompanyContext(runDir, m.input as Record<string, unknown>, {
    marketPackPath: marketPath,
  });
  const listed = formatListedCode(codeDigits, ctx.market);

  let reportMarkdown = "";
  if (reportMdPath && (await pathExists(reportMdPath))) {
    reportMarkdown = await readFile(reportMdPath, "utf-8");
  }
  const confidence = parseConfidenceFromReportMd(reportMarkdown);

  const hasValuationJson = Boolean(valuationPath && (await pathExists(valuationPath)));
  const hasReportMd = reportMarkdown.length > 0;
  const hasMarketMd = Boolean(marketPath && (await pathExists(marketPath)));
  const hasPolishOverview = Boolean(polishOverviewPath && (await pathExists(polishOverviewPath)));
  const hasPolishBusiness = Boolean(polishBusinessPath && (await pathExists(polishBusinessPath)));
  const hasPolishPenetration = Boolean(polishPenetrationPath && (await pathExists(polishPenetrationPath)));
  const hasPolishValuation = Boolean(polishValuationPath && (await pathExists(polishValuationPath)));

  const manifestRel = path.relative(siteDir, manifestPath);

  const topics: Array<{
    topic: ReportTopicType;
    status: RequiredFieldsStatus;
    markdown: string;
    publishable?: boolean;
  }> = [];

  /** 龟龟整包 */
  {
    let status: RequiredFieldsStatus = "missing";
    let markdown = "";
    if (hasPolishOverview && polishOverviewPath) {
      markdown = (await readFile(polishOverviewPath, "utf-8")).trim();
      status = hasValuationJson ? "complete" : "degraded";
    } else if (hasReportMd) {
      markdown = reportMarkdown.trim();
      status = hasValuationJson ? "complete" : "degraded";
    }
    topics.push({ topic: "turtle-strategy", status, markdown });
  }

  /** 估值 */
  {
    let status: RequiredFieldsStatus = "missing";
    let markdown = "";
    if (hasPolishValuation && polishValuationPath) {
      markdown = (await readFile(polishValuationPath, "utf-8")).trim();
      status = hasValuationJson ? "complete" : "degraded";
    } else {
      const parts: string[] = [];
      if (hasValuationJson && valuationPath) {
        const vj = await readFile(valuationPath, "utf-8");
        parts.push(renderValuationComputedMarkdownFromJson(vj));
        status = hasReportMd ? "complete" : "degraded";
      } else if (hasReportMd) {
        status = "degraded";
      }
      if (hasReportMd) {
        parts.push(reportMarkdown.trim());
      }
      markdown = joinSections(parts);
    }
    topics.push({ topic: "valuation", status, markdown });
  }

  /** 穿透回报率 */
  {
    let status: RequiredFieldsStatus = "missing";
    let markdown = "";
    if (hasPolishPenetration && polishPenetrationPath) {
      markdown = (await readFile(polishPenetrationPath, "utf-8")).trim();
      status = hasMarketMd ? "complete" : "degraded";
    } else {
      const parts: string[] = [];
      if (hasReportMd) {
        parts.push(reportMarkdown.trim());
        status = hasMarketMd ? "complete" : "degraded";
      } else if (hasMarketMd) {
        status = "degraded";
      }
      if (hasMarketMd && marketPath) {
        const md = await readFile(marketPath, "utf-8");
        parts.push(`## 市场数据包（data_pack_market.md）\n\n${md.trim()}`);
      }
      markdown = joinSections(parts);
    }
    topics.push({ topic: "penetration-return", status, markdown });
  }

  /** 商业质量终稿由 business-analysis 发布；workflow 侧只保留 manifest 质量信息，不写站点条目。 */
  {
    const markdown = hasPolishBusiness && polishBusinessPath ? (await readFile(polishBusinessPath, "utf-8")).trim() : "";
    topics.push({ topic: "business-quality", status: markdown ? "degraded" : "missing", markdown, publishable: false });
  }

  const sourceMarkdownAbsForTopic = (topic: ReportTopicType): string | undefined => {
    switch (topic) {
      case "turtle-strategy":
        return polishOverviewPath ?? reportMdPath;
      case "valuation":
        return polishValuationPath ?? valuationPath;
      case "penetration-return":
        return polishPenetrationPath ?? reportMdPath;
      case "business-quality": {
        const p1bPath = resolveArtifactPath(runDir, m.outputs.phase1bMarkdownPath);
        return polishBusinessPath ?? p1bPath ?? reportMdPath;
      }
      default: {
        const _ex: never = topic;
        return _ex;
      }
    }
  };

  const manifestTopics: TopicManifestEntryV1[] = [];

  for (const t of topics) {
    if (!t.markdown.trim()) continue;
    if (t.publishable === false) {
      const q = topicQuality.get(t.topic);
      manifestTopics.push({
        v2TopicId: siteTopicTypeToV2TopicId(t.topic),
        siteTopicType: t.topic,
        entryId: buildEntryId(date, codeDigits, t.topic, runShort),
        requiredFieldsStatus: t.status,
        sourceMarkdownRelative: relFromRun(runDir, sourceMarkdownAbsForTopic(t.topic)),
        qualityStatus: q?.qualityStatus ?? "degraded",
        blockingReasons: q?.blockingReasons,
      });
      continue;
    }
    const entryId = buildEntryId(date, codeDigits, t.topic, runShort);
    const meta: EntryMeta = {
      entryId,
      code: codeDigits,
      topicType: t.topic,
      displayTitle: buildDisplayTitle({ companyName: ctx.name, listedCode: listed, topic: t.topic }),
      publishedAt,
      sourceRunId,
      requiredFieldsStatus: t.status,
      confidenceState: confidence,
      contentFile: "content.md",
      sourceManifestPath: manifestRel,
    };
    await writeEntry({ siteDir, meta, contentMarkdown: t.markdown });
    const q = topicQuality.get(t.topic);
    manifestTopics.push({
      v2TopicId: siteTopicTypeToV2TopicId(t.topic),
      siteTopicType: t.topic,
      entryId,
      requiredFieldsStatus: t.status,
      sourceMarkdownRelative: relFromRun(runDir, sourceMarkdownAbsForTopic(t.topic)),
      qualityStatus: q?.qualityStatus ?? (t.status === "complete" ? "complete" : "degraded"),
      blockingReasons: q?.blockingReasons,
    });
  }

  if (manifestTopics.length > 0) {
    const topicManifest: TopicManifestV1 = {
      manifestVersion: TOPIC_MANIFEST_VERSION,
      generatedAt: new Date().toISOString(),
      publishedAt,
      runProfile: "stock_full",
      outputLayout: { code: m.outputLayout.code, runId: m.outputLayout.runId },
      topics: manifestTopics,
    };
    await writeTopicManifest(runDir, topicManifest);
  }
}

/** 仅 `topic_manifest.json`（publish_only）：再发布已有 Markdown 专题 */
async function emitFromTopicManifestOnly(
  runDir: string,
  siteDir: string,
  manifestPath: string,
): Promise<void> {
  const m = await readJson<TopicManifestV1>(manifestPath);
  if (m.manifestVersion !== TOPIC_MANIFEST_VERSION) {
    throw new Error(`[reports-site] topic_manifest.json 不支持的 manifestVersion: ${String(m.manifestVersion)}`);
  }
  const publishedAt = m.publishedAt ?? m.generatedAt;
  const codeDigits =
    String(m.outputLayout?.code ?? "")
      .replace(/\D/g, "")
      .trim() ||
    (() => {
      const e0 = m.topics[0]?.entryId ?? "";
      const mm = e0.match(/^(\d{4}-\d{2}-\d{2})-([^-]+)-/u);
      return (mm?.[2] ?? "").replace(/\D/g, "") || e0;
    })();
  const sourceRunId = String(m.outputLayout?.runId ?? "");
  const manifestRel = path.relative(siteDir, manifestPath);
  const marketTry = path.join(runDir, "data_pack_market.md");
  const ctx = await tryReadCompanyContext(runDir, { code: codeDigits } as Record<string, unknown>, {
    marketPackPath: (await pathExists(marketTry)) ? marketTry : undefined,
  });
  const listed = formatListedCode(codeDigits, ctx.market);

  for (const row of m.topics) {
    const rel = row.sourceMarkdownRelative?.trim();
    if (!rel) continue;
    const absMd = path.resolve(runDir, rel);
    if (!(await pathExists(absMd))) continue;
    const markdown = (await readFile(absMd, "utf-8")).trim();
    if (!markdown) continue;
    const status: RequiredFieldsStatus =
      row.requiredFieldsStatus === "complete" ||
      row.requiredFieldsStatus === "degraded" ||
      row.requiredFieldsStatus === "missing"
        ? row.requiredFieldsStatus
        : "degraded";
    const confidence = parseConfidenceFromReportMd(markdown);
    const meta: EntryMeta = {
      entryId: row.entryId,
      code: codeDigits,
      topicType: row.siteTopicType,
      displayTitle: buildDisplayTitle({
        companyName: ctx.name,
        listedCode: listed,
        topic: row.siteTopicType,
      }),
      publishedAt,
      sourceRunId,
      requiredFieldsStatus: status,
      confidenceState: confidence,
      contentFile: "content.md",
      sourceManifestPath: manifestRel,
    };
    await writeEntry({ siteDir, meta, contentMarkdown: markdown });
  }
}

async function emitFromBusinessAnalysis(
  runDir: string,
  siteDir: string,
  manifestPath: string,
): Promise<void> {
  const m = await readJson<BusinessAnalysisManifest>(manifestPath);
  const publishedAt = m.generatedAt;
  const date = dateKeyFromIso(publishedAt);
  const codeDigits = String(m.outputLayout.code ?? "").replace(/\D/g, "") || m.outputLayout.code;
  const sourceRunId = String(m.input.runId ?? m.outputLayout.runId ?? "");
  const runShort = shortRunId(sourceRunId || m.outputLayout.runId || "run");
  const marketPathBa = resolveArtifactPath(runDir, m.outputs.marketPackPath);
  const ctx = await tryReadCompanyContext(runDir, m.input as Record<string, unknown>, {
    marketPackPath: marketPathBa,
  });
  const listed = formatListedCode(codeDigits, ctx.market);

  const qPath = m.outputs.qualitativeReportPath ? resolveArtifactPath(runDir, m.outputs.qualitativeReportPath) : undefined;
  const d1 = m.outputs.qualitativeD1D6Path ? resolveArtifactPath(runDir, m.outputs.qualitativeD1D6Path) : undefined;
  const hasQ = Boolean(qPath && (await pathExists(qPath)));
  const hasD1 = Boolean(d1 && (await pathExists(d1)));

  let status: RequiredFieldsStatus = "missing";
  if (hasQ && hasD1) status = "complete";
  else if (hasQ || hasD1) status = "degraded";

  let qMarkdown = "";
  let d1Markdown = "";
  if (hasQ && qPath) {
    qMarkdown = await readFile(qPath, "utf-8");
  }
  if (hasD1 && d1) {
    d1Markdown = await readFile(d1, "utf-8");
  }

  const dataPackReportPath =
    typeof m.outputs.dataPackReportPath === "string" ? resolveArtifactPath(runDir, m.outputs.dataPackReportPath) : undefined;
  const dataPackReportMarkdown = dataPackReportPath && (await pathExists(dataPackReportPath))
    ? await readFile(dataPackReportPath, "utf-8")
    : undefined;
  const phase1bJsonPath =
    typeof m.outputs.phase1bJsonPath === "string" ? resolveArtifactPath(runDir, m.outputs.phase1bJsonPath) : undefined;
  const phase1b =
    phase1bJsonPath && (await pathExists(phase1bJsonPath))
      ? await readJson<Phase1BQualitativeSupplement>(phase1bJsonPath)
      : undefined;
  const pdfQuality = parsePdfQualitySummary(dataPackReportMarkdown);
  const evidence = summarizeEvidenceRetrieval(phase1b);
  const finalNarrative = validateFinalNarrativeMarkdown({
    qualitativeReportMarkdown: qMarkdown,
    qualitativeD1D6Markdown: d1Markdown,
    dataPackReportMarkdown,
  });
  if (finalNarrative.status !== "complete") {
    status = status === "missing" ? "missing" : "degraded";
  } else {
    status = "complete";
  }

  const topic: ReportTopicType = "business-quality";
  const entryId = buildEntryId(date, codeDigits, topic, runShort);

  if (finalNarrative.status !== "complete") {
    const topicManifest: TopicManifestV1 = {
      manifestVersion: TOPIC_MANIFEST_VERSION,
      generatedAt: new Date().toISOString(),
      publishedAt,
      runProfile: "stock_full",
      outputLayout: { code: m.outputLayout.code, runId: m.outputLayout.runId },
      topics: [
        {
          v2TopicId: siteTopicTypeToV2TopicId(topic),
          siteTopicType: topic,
          entryId,
          requiredFieldsStatus: status,
          sourceMarkdownRelative:
            relFromRun(runDir, qPath) ??
            relFromRun(runDir, d1) ??
            (typeof m.outputs.qualitativeReportPath === "string" ? m.outputs.qualitativeReportPath : undefined),
          qualityStatus: finalNarrative.status,
          blockingReasons: finalNarrative.blockingReasons,
        },
      ],
    };
    await writeTopicManifest(runDir, topicManifest);
    return;
  }

  const confidenceBa = deriveBusinessAnalysisConfidence({
    status,
    finalNarrativeStatus: finalNarrative.status,
    pdfQuality,
    evidence,
  });

  const markdown = renderBusinessAnalysisPublishedMarkdown({
    qualitativeReportMarkdown: qMarkdown,
    qualitativeD1D6Markdown: d1Markdown,
    finalNarrativeStatus: finalNarrative.status,
    confidence: confidenceBa,
    pdfQuality,
    evidence,
  });
  if (!markdown.trim()) return;

  const manifestRel = path.relative(siteDir, manifestPath);
  const meta: EntryMeta = {
    entryId,
    code: codeDigits,
    topicType: topic,
    displayTitle: buildDisplayTitle({ companyName: ctx.name, listedCode: listed, topic }),
    publishedAt,
    sourceRunId,
    requiredFieldsStatus: status,
    confidenceState: confidenceBa,
    contentFile: "content.md",
    sourceManifestPath: manifestRel,
  };
  await writeEntry({ siteDir, meta, contentMarkdown: markdown });

  const topicManifest: TopicManifestV1 = {
    manifestVersion: TOPIC_MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    publishedAt,
    runProfile: "stock_full",
    outputLayout: { code: m.outputLayout.code, runId: m.outputLayout.runId },
    topics: [
      {
        v2TopicId: siteTopicTypeToV2TopicId(topic),
        siteTopicType: topic,
        entryId,
        requiredFieldsStatus: status,
        sourceMarkdownRelative:
          relFromRun(runDir, qPath) ??
          relFromRun(runDir, d1) ??
          (typeof m.outputs.qualitativeReportPath === "string" ? m.outputs.qualitativeReportPath : undefined),
        qualityStatus: finalNarrative.status,
        blockingReasons: finalNarrative.blockingReasons,
      },
    ],
  };
  await writeTopicManifest(runDir, topicManifest);
}

/** 扫描 entries 下各子目录的 meta.json，去重后重写 views 与 index.json */
export async function rebuildSiteReportsIndex(siteDir: string): Promise<void> {
  const entriesRoot = path.join(siteDir, "entries");
  let dirs: string[] = [];
  try {
    dirs = await readdir(entriesRoot, { withFileTypes: true }).then((xs) =>
      xs.filter((d) => d.isDirectory()).map((d) => d.name),
    );
  } catch {
    dirs = [];
  }

  const items: TimelineItem[] = [];
  for (const id of dirs) {
    const metaPath = path.join(entriesRoot, id, "meta.json");
    if (!(await pathExists(metaPath))) continue;
    try {
      const meta = await readJson<EntryMeta>(metaPath);
      items.push({
        entryId: meta.entryId,
        displayTitle: meta.displayTitle,
        topicType: meta.topicType,
        code: meta.code,
        publishedAt: meta.publishedAt,
        href: "/reports/" + meta.entryId + "/",
        requiredFieldsStatus: meta.requiredFieldsStatus,
        confidenceState: meta.confidenceState,
      });
    } catch {
      /* skip broken */
    }
  }

  /** 去重：同一自然日 + code + topic 仅保留质量最高；同质量保留最新 */
  const dedup = new Map<string, TimelineItem>();
  for (const it of items) {
    const dk = `${dateKeyFromIso(it.publishedAt)}|${it.code}|${it.topicType}`;
    const prev = dedup.get(dk);
    if (!prev || isBetterTimelineItem(it, prev)) dedup.set(dk, it);
  }
  const winnerIds = new Set([...dedup.values()].map((it) => it.entryId));
  for (const it of items) {
    if (winnerIds.has(it.entryId)) continue;
    const dir = path.join(entriesRoot, it.entryId);
    await rm(dir, { recursive: true, force: true });
  }
  const timeline = [...dedup.values()].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  await mkdir(path.join(siteDir, "views", "by-topic"), { recursive: true });
  await mkdir(path.join(siteDir, "views", "by-code"), { recursive: true });

  const byTopic = new Map<string, TimelineItem[]>();
  const byCode = new Map<string, TimelineItem[]>();
  for (const it of timeline) {
    byTopic.set(it.topicType, [...(byTopic.get(it.topicType) ?? []), it]);
    byCode.set(it.code, [...(byCode.get(it.code) ?? []), it]);
  }

  for (const [topic, arr] of byTopic) {
    await writeFile(path.join(siteDir, "views", "by-topic", `${topic}.json`), JSON.stringify(arr, null, 2), "utf-8");
  }
  for (const [code, arr] of byCode) {
    await writeFile(path.join(siteDir, "views", "by-code", `${code}.json`), JSON.stringify(arr, null, 2), "utf-8");
  }

  await writeFile(path.join(siteDir, "views", "timeline.json"), JSON.stringify(timeline, null, 2), "utf-8");

  const index: SiteReportsIndex = {
    version: "2.0",
    generatedAt: formatLocalDateTime(new Date()),
    entryCount: timeline.length,
    timelineHref: "/reports/",
  };
  await writeFile(path.join(siteDir, "index.json"), JSON.stringify(index, null, 2), "utf-8");
}

/**
 * 将单次 run 映射为 entries 子目录并重建聚合索引。
 * 会先删除本 run 可能生成的同目录下「同日同码同专题」旧 entry 再写入（按 entryId 目录覆盖）。
 */
export async function emitSiteReportsFromRun(opts: EmitSiteReportsOptions): Promise<{ siteDir: string }> {
  const runDir = path.resolve(opts.runDir);
  const siteDir = resolveOutputPath((opts.siteDir ?? "output/site/reports").trim() || "output/site/reports");
  await mkdir(siteDir, { recursive: true });
  await mkdir(path.join(siteDir, "entries"), { recursive: true });

  const wf = path.join(runDir, "workflow_manifest.json");
  const ba = path.join(runDir, "business_analysis_manifest.json");
  const tm = path.join(runDir, "topic_manifest.json");

  if (await pathExists(wf)) {
    await emitFromWorkflow(runDir, siteDir, wf);
  } else if (await pathExists(ba)) {
    await emitFromBusinessAnalysis(runDir, siteDir, ba);
  } else if (await pathExists(tm)) {
    await emitFromTopicManifestOnly(runDir, siteDir, tm);
  } else {
    throw new Error(
      `[reports-site] 未找到 workflow_manifest.json / business_analysis_manifest.json / topic_manifest.json：${runDir}`,
    );
  }

  await rebuildSiteReportsIndex(siteDir);
  return { siteDir };
}

/** 将 `site/reports` 同步到目标目录（通常为 app 的 `public/reports`，用于 Next 静态导出） */
export async function syncSiteReportsToPublicDir(input: {
  siteDir: string;
  targetPublicReportsDir: string;
}): Promise<void> {
  const src = path.resolve(input.siteDir);
  const dest = path.resolve(input.targetPublicReportsDir);
  await mkdir(path.dirname(dest), { recursive: true });
  await rm(dest, { recursive: true, force: true });
  await cp(src, dest, { recursive: true });
}

/** @deprecated 使用 {@link syncSiteReportsToPublicDir} */
export async function syncSiteReportsToDocsPublic(input: {
  siteDir: string;
  docsPublicReportsDir: string;
}): Promise<void> {
  return syncSiteReportsToPublicDir({
    siteDir: input.siteDir,
    targetPublicReportsDir: input.docsPublicReportsDir,
  });
}
