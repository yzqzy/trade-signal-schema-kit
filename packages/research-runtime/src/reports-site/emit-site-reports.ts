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

  const metadataBlock = normalizeConfidenceToken(md.match(/^\s*confidence:\s*(\S+)/im)?.[1]);
  if (metadataBlock) return metadataBlock;

  const tableCell = md.match(/\|\s*分析置信度\s*\|\s*([^|\n]+?)\s*\|/imu)?.[1];
  const fromTable = normalizeConfidenceToken(tableCell);
  if (fromTable) return fromTable;

  return "unknown";
}

type ValuationQualitySummary = {
  activeMethodCount: number;
  activeCoreMethodCount: number;
  consistency?: string;
  coefficientOfVariation?: number;
};

function parseValuationQuality(rawJson: string | undefined): ValuationQualitySummary | undefined {
  if (!rawJson?.trim()) return undefined;
  try {
    const v = JSON.parse(rawJson) as {
      methods?: Array<{ id?: string; method?: string; name?: string; value?: number | null }>;
      crossValidation?: { consistency?: string; coefficientOfVariation?: number };
    };
    const methods = Array.isArray(v.methods) ? v.methods : [];
    const active = methods.filter((m) => typeof m.value === "number" && Number.isFinite(m.value));
    const core = /DCF|DDM|PE[_\s-]?BAND|PE\s*Band|市盈率/i;
    return {
      activeMethodCount: active.length,
      activeCoreMethodCount: active.filter((m) => core.test(String(m.method ?? m.name ?? m.id ?? ""))).length,
      consistency: v.crossValidation?.consistency,
      coefficientOfVariation: v.crossValidation?.coefficientOfVariation,
    };
  } catch {
    return undefined;
  }
}

function deriveValuationConfidence(base: ConfidenceState, q: ValuationQualitySummary | undefined): ConfidenceState {
  if (!q) return base === "unknown" ? "unknown" : "low";
  if (q.activeMethodCount < 2) return "low";
  if (q.activeCoreMethodCount < 2 && base === "high") return "medium";
  if (q.consistency === "low") return "medium";
  if (typeof q.coefficientOfVariation === "number" && q.coefficientOfVariation > 40) return "medium";
  return base === "unknown" ? "medium" : base;
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
  return PUBLISHED_MARKDOWN_FORBIDDEN.filter(([, re]) => re.test(markdown)).map(([name]) => name);
}

const PUBLISHED_MARKDOWN_FORBIDDEN: Array<[string, RegExp]> = [
  ["文件名包装标题", /^##\s+qualitative_(?:report|d1_d6)\.md\s*$/imu],
  ["内部状态词：草稿", /草稿/u],
  ["内部状态词：待 Claude", /待\s*Claude(?:\s*Code)?/iu],
  ["内部状态词：尚未完成", /尚未完成/u],
  ["内部状态词：成稿要求", /成稿要求/u],
  ["内部状态词：初始状态", /初始状态/u],
  ["内部流程词：机械锚点", /机械锚点/u],
  ["内部流程词：候选片段", /候选片段/u],
  ["内部流程词：供六维成稿引用", /供六维成稿引用/u],
  ["内部流程词：站点只展示", /站点只展示/u],
  ["内部流程词：完整发布依据", /完整发布依据/u],
  ["内部流程词：审计用", /审计用/u],
  ["内部流程词：缺口与 TODO", /缺口与\s*TODO|本 run 无显式 TODO/u],
  ["内部流程词：valuation_computed.json 为准", /valuation_computed\.json\s*为准/u],
  ["内部流程词：估值结果 valuation_computed", /估值结果（valuation_computed）/u],
  ["内部流程词：原始 JSON", /原始\s*JSON/u],
  ["内部流程词：发布链路", /发布链路/u],
  ["内部流程词：F10 主链路", /F10\s*主链路/u],
  ["内部流程词：结构化接口", /结构化接口/u],
  ["内部流程词：gateVerdict", /gateVerdict/u],
  ["内部流程词：本报告可完成终稿", /本报告可完成终稿/u],
  ["内部流程词：PDF gate", /PDF\s*gate|gate\s*=\s*(?:OK|DEGRADED|CRITICAL)/iu],
  ["内部流程词：终稿置信度", /终稿置信度/u],
  ["内部流程词：结论应表述为", /结论应表述为|而不是提前定性/u],
  ["内部流程词：本 run", /本\s*run/iu],
  ["内部流程词：Phase1B", /\bPhase1B\b/u],
];

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
  hasConfirmedCriticalEvent: boolean;
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

function isOfficialNoHit(item: Phase1BItem): boolean {
  const diagnostics = item.retrievalDiagnostics;
  if (
    diagnostics?.feedFallbackUsed &&
    diagnostics.feedEvidenceCount === 0 &&
    /(?:^|_)feed_empty$/u.test(diagnostics.evidenceRetrievalStatus ?? "")
  ) {
    return true;
  }
  return /官方源.*(?:无命中|未形成|未检索到)|交易所\/巨潮.*(?:无命中|未形成)|官方.*零命中/u.test(
    `${item.item}\n${item.content}`,
  );
}

function summarizeEvidenceRetrieval(phase1b: Phase1BQualitativeSupplement | undefined): EvidenceRetrievalSummary {
  const critical = /违规|处罚|诉讼|仲裁|监管|问询|关注函|警示函|立案|纪律处分|公开谴责/u;
  const confirmedCritical =
    /违规|处罚|诉讼|仲裁|监管|问询|关注函|警示函|立案|调查|纪律处分|公开谴责|信披|信息披露违法/u;
  const items = flattenPhase1BItems(phase1b);
  const missing = items.filter((it) => it.evidences.length === 0);
  const limited = items.filter((it) => isRateLimited(it.retrievalDiagnostics?.webSearchFailureReason));
  return {
    hasCriticalGap: missing.some((it) => critical.test(it.item) && !isOfficialNoHit(it)),
    hasConfirmedCriticalEvent: items.some(
      (it) =>
        critical.test(it.item) &&
        it.evidences.some((ev) => confirmedCritical.test(`${ev.title}\n${ev.snippet ?? ""}\n${it.content}`)),
    ),
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
  if (input.evidence.hasCriticalGap || input.evidence.hasConfirmedCriticalEvent) {
    return "medium";
  }
  return "high";
}

function evidenceStatusLabel(evidence: EvidenceRetrievalSummary): string {
  if (evidence.webSearchLimited && evidence.missingItems.length > 0) {
    return "官方信息已优先核验；部分开放信息未形成关键反证";
  }
  if (evidence.hasConfirmedCriticalEvent) return "已确认关键监管事件，需跟踪最终结论";
  if (evidence.hasCriticalGap) return "关键合规事项仍需补充核验";
  if (evidence.webSearchUsed) return "官方信息与开放信息已完成交叉核验";
  return "官方信息已完成基础核验";
}

function businessQualityLabel(input: { confidence: ConfidenceState; evidence: EvidenceRetrievalSummary }): string {
  if (input.evidence.hasConfirmedCriticalEvent) return "偏弱/观察";
  if (input.evidence.hasCriticalGap || input.confidence === "low" || input.confidence === "unknown") return "待验证";
  if (input.confidence === "medium") return "观察";
  return "较强";
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
    `| 商业质量 | ${businessQualityLabel(input)} |`,
    `| 最终置信度 | ${input.confidence} |`,
    `| 年报抽取质量 | ${gate}；低置信关键块：${low} |`,
    `| 监管证据状态 | ${evidenceStatusLabel(input.evidence)} |`,
    `| 证据完整度 | ${input.evidence.missingItems.length > 0 ? "存在需补充核验项，详见文末证据质量表" : "关键事项已完成基础核验"} |`,
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

const PUBLISH_DROP_LINE_PATTERNS: RegExp[] = [
  /本报告可完成终稿/u,
  /结论应表述为|而不是提前定性/u,
];

const PUBLISH_TEXT_REWRITES: Array<[RegExp, string]> = [
  [
    /\|\s*股东回报 F10 信号为空\s*\|\s*分红仍可从企业行动与财务数据判断，但缺少文字政策摘录\s*\|\s*后续从公告或年报分红政策段补充\s*\[M:§3\]\s*\|/gu,
    "| 分红政策文字摘录未进入经营画像信号桶 | 不影响 DPS、DDM 与股东回报判断；分红已由企业行动和年报财务数据支持 | 后续可把年报分红政策段纳入经营画像摘要 [M:§3] |",
  ],
  [/WebSearch rate limit|WebSearch\s+rate_limit|rate_limit_exceeded|Volc WebSearch API 错误 \[[^\]]+\]/giu, "外部检索受限"],
  [/、Phase1B\s*监管\/处罚检索缺口，以及\s*P13\s*低置信导致非经常性损益判断需降级/gu, "，以及外部证据与 PDF 抽取质量边界"],
  [/Phase1B\s*还捕捉到/gu, "外部证据还捕捉到"],
  [/Phase1B/gu, "外部证据"],
  [/PDF\s*gate\s*=\s*OK[，,、]?\s*关键(?:年报)?块(?:无缺失|未缺失|可用于终稿)/giu, "年报关键章节已完成定位"],
  [/PDF\s*gate\s*=\s*OK/giu, "年报抽取质量正常"],
  [/gate\s*=\s*OK/giu, "年报抽取质量正常"],
  [/gateVerdict\s*`?\s*(OK|DEGRADED|CRITICAL)\s*`?/giu, "年报抽取质量：$1"],
  [/gateVerdict\s*=\s*(OK|DEGRADED|CRITICAL)/giu, "年报抽取质量：$1"],
  [/12\/12\s*章节定位完成/giu, "主要章节已定位"],
  [/年报抽取\s*OK/giu, "年报抽取质量正常"],
  [/可用于终稿/gu, "可供分析引用"],
  [/终稿置信度/gu, "分析置信度"],
  [/本\s*run/giu, "本次证据包"],
  [/F10\s*主链路/giu, "公开资料与经营画像"],
  [/结构化接口/gu, "结构化数据"],
  [/Feed\s*Top\s*10/giu, "自动 Top10"],
  [/Feed\s*同业池/giu, "自动同业池"],
  [/由\s*Feed\s*结构化返回/giu, "由结构化数据返回"],
  [/检索过程受到\s*外部检索受限\s*影响/gu, "外部检索受限"],
  [/且外部搜索存在限流失败/gu, "且外部检索受限"],
  [/本次证据包\s+结论/gu, "证据包结论"],
  [/本次证据包\s+(未|官方|显示|可见)/gu, "本次证据包$1"],
  [/外部证据\s+(显示|可见|还捕捉到)/gu, "外部证据$1"],
];

function stripPublishInternalLines(markdown: string): string {
  return markdown
    .split(/\r?\n/u)
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed || !PUBLISH_DROP_LINE_PATTERNS.some((re) => re.test(trimmed));
    })
    .join("\n");
}

function normalizePublishedMarkdownProse(markdown: string): string {
  let next = stripPublishInternalLines(markdown);
  for (const [pattern, replacement] of PUBLISH_TEXT_REWRITES) {
    next = next.replace(pattern, replacement);
  }
  return next.replace(/\n{3,}/g, "\n\n").trim();
}

function moveEvidenceGapsBeforeAppendix(markdown: string): string {
  const gapRe = /^##\s+证据缺口清单(?:（(?:Phase1B|外部证据)）)?\s*[\s\S]*?(?=^##\s+附录：证据索引\s*$|(?![\s\S]))/imu;
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
  const missingPdf = input.pdfQuality.missingCritical?.length ? input.pdfQuality.missingCritical.join("、") : "无";
  rows.push(`| 年报抽取 | ${gate}；低置信关键块：${low}；缺失关键块：${missingPdf} |`);
  rows.push(`| 人工复核优先级 | ${input.pdfQuality.humanReviewPriority?.length ? input.pdfQuality.humanReviewPriority.join("、") : "无"} |`);
  rows.push(
    `| 公司监管事件 | ${
      input.evidence.hasConfirmedCriticalEvent
        ? "已形成需跟踪的确认事件。"
        : input.evidence.hasCriticalGap
          ? "关键事项仍需补充核验。"
          : "交易所/巨潮官方源未形成确认事件。"
    } |`,
  );
  rows.push(
    `| 开放信息 | ${
      input.evidence.webSearchUsed
        ? "仅作为背景补充；不作为监管、估值或财务核心证据。"
        : "未启用或未触发。"
    } |`,
  );
  rows.push("| 结论边界 | “未形成确认事件”不是法律尽调结论；若用于合规尽调，应另接专源核验。 |");
  return rows.join("\n");
}

function stripExistingEvidenceQualitySection(markdown: string): string {
  return markdown
    .replace(/^##\s+证据质量与限制\s*\n[\s\S]*?(?=^##\s+附录：证据索引\s*$|^##\s+证据缺口清单|^##\s+D[1-6]\b|(?![\s\S]))/imu, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasQualitySnapshot(markdown: string): boolean {
  return /^##\s+Quality Snapshot\s*$/imu.test(markdown);
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
      normalizePublishedMarkdownProse(compactPdfLead(stripFinalStatusLine(input.qualitativeReportMarkdown), input.pdfQuality)),
    ),
  );
  const d = normalizePublishedMarkdownProse(compactPdfLead(stripFinalStatusLine(input.qualitativeD1D6Markdown), input.pdfQuality));
  const qSplit = splitEvidenceAppendix(stripExistingEvidenceQualitySection(q));
  const dSplit = splitEvidenceAppendix(d);
  const qBody = hasQualitySnapshot(qSplit.body)
    ? qSplit.body
    : qSplit.body.replace(/^(# .+?\n(?:> .+?\n)?)/u, `$1\n${renderQualitySnapshot(input)}\n`);
  const sections = [qBody];
  if (input.finalNarrativeStatus === "complete" && dSplit.body && !hasD1D6Sections(qSplit.body)) {
    sections.push(["## D1-D6 深度章节", "", dSplit.body].join("\n"));
  }
  sections.push(renderEvidenceQualitySection(input));
  if (qSplit.appendix) {
    sections.push(qSplit.appendix);
  } else if (dSplit.appendix) {
    sections.push(dSplit.appendix);
  }
  const markdown = sections
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");
  return normalizePublishedMarkdownProse(markdown);
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
  const valuationRawJson =
    hasValuationJson && valuationPath ? await readFile(valuationPath, "utf-8") : undefined;
  const valuationConfidence = deriveValuationConfidence(confidence, parseValuationQuality(valuationRawJson));

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
      confidenceState: t.topic === "valuation" ? valuationConfidence : confidence,
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
