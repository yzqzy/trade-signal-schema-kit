import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DataPackMarket, Market, ValuationComputed, ValuationMethodResult } from "@trade-signal/schema-core";

import { resolveOutputPath } from "../crosscut/normalization/resolve-monorepo-path.js";
import { formatListedCode } from "./listed-code.js";
import { buildDisplayTitle, TOPIC_ENTRY_SLUG } from "./topic-labels.js";
import type {
  ConfidenceState,
  EntryMeta,
  ReportTopicType,
  RequiredFieldsStatus,
  SiteReportsIndex,
  TimelineItem,
} from "./types.js";

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

/** Phase3 龟龟报告中的「因子 1B」整节（workflow 无 Phase1B 时的商业质量占位摘录） */
function extractTurtleReportFactor1bSection(reportMd: string): string | undefined {
  const m = reportMd.match(/## 三、因子1B：深度定性分析[\s\S]*?(?=\n## [四五六七八九十])/u);
  return m?.[0]?.trim();
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

function isValuationComputedShape(v: unknown): v is ValuationComputed {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.code === "string" && Array.isArray(o.methods);
}

function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 2 : abs >= 10 ? 2 : 4;
  return n.toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtPctMaybe(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${fmtNum(n)}%`;
}

function companyTypeZh(t: ValuationComputed["companyType"]): string {
  if (t === "blue_chip_value") return "蓝筹价值";
  if (t === "growth") return "成长";
  if (t === "hybrid") return "混合";
  return t ?? "—";
}

function assumptionsCell(a: ValuationMethodResult["assumptions"]): string {
  if (!a || Object.keys(a).length === 0) return "—";
  return Object.entries(a)
    .map(([k, v]) => `${k}=${typeof v === "number" ? fmtNum(v) : String(v)}`)
    .join("；");
}

function methodRow(m: ValuationMethodResult): string {
  const hasValue = m.value !== undefined && m.value !== null && Number.isFinite(m.value);
  const r = m.range;
  const rangeCell =
    r && (r.conservative !== undefined || r.central !== undefined || r.optimistic !== undefined)
      ? `${fmtNum(r.conservative)} / ${fmtNum(r.central)} / ${fmtNum(r.optimistic)}`
      : "—";
  const valCell = hasValue ? fmtNum(m.value) : "—";
  const noteCell = m.note?.trim() || "—";
  const assumptions = assumptionsCell(m.assumptions);
  return `| ${m.method} | ${valCell} | ${rangeCell} | ${noteCell} | ${assumptions} |`;
}

/** 将 `valuation_computed.json` 渲染为可读 Markdown（研报站正文，避免整段 JSON 代码块） */
function valuationComputedMarkdownBlock(rawJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return ["## 估值数据（解析失败）", "", "```text", rawJson.trim(), "```"].join("\n");
  }
  if (!isValuationComputedShape(parsed)) {
    return ["## 估值数据（结构异常）", "", "```json", JSON.stringify(parsed, null, 2), "```"].join("\n");
  }
  const v = parsed;
  const lines: string[] = [
    "## 估值结果（valuation_computed）",
    "",
    "| 字段 | 内容 |",
    "|:-----|:-----|",
    `| 标的代码 | ${v.code} |`,
    `| 生成时间 | ${v.generatedAt} |`,
    `| 公司画像 | ${companyTypeZh(v.companyType)} |`,
    `| WACC | ${v.wacc !== undefined ? fmtPctMaybe(v.wacc) : "—"} |`,
    `| Ke | ${v.ke !== undefined ? fmtPctMaybe(v.ke) : "—"} |`,
    "",
    "### 分方法估值",
    "",
    "| 方法 | 估值 | 区间（保守 / 中枢 / 乐观） | 说明 | 关键假设 |",
    "|:-----|-----:|:-----------------------------|:-----|:---------|",
    ...v.methods.map(methodRow),
    "",
  ];

  const cv = v.crossValidation;
  if (cv) {
    lines.push("### 交叉验证", "", "| 字段 | 数值 |", "|:-----|:-----|");
    lines.push(`| 加权平均 | ${fmtNum(cv.weightedAverage)} |`);
    lines.push(`| 变异系数（CV） | ${fmtNum(cv.coefficientOfVariation)} |`);
    lines.push(`| 一致性 | ${cv.consistency ?? "—"} |`);
    if (cv.activeWeights && Object.keys(cv.activeWeights).length > 0) {
      const w = Object.entries(cv.activeWeights)
        .map(([k, n]) => `${k}=${fmtNum(n)}`)
        .join("；");
      lines.push(`| 活跃权重 | ${w} |`);
    }
    const rr = cv.range;
    if (rr && (rr.conservative !== undefined || rr.central !== undefined || rr.optimistic !== undefined)) {
      lines.push(`| 合成区间 | ${fmtNum(rr.conservative)} / ${fmtNum(rr.central)} / ${fmtNum(rr.optimistic)} |`);
    }
    lines.push("");
  }

  const ie = v.impliedExpectations;
  /** 与估值引擎常见口径一致：比率类字段加 %；权重、β 等保持原数 */
  const impliedPctKey =
    /^(wacc|ke|modelWacc|modelKe|rf|erp|kdPre|taxRate|fcfYield|gTerminal|gTerminalDefault|historicalProfitCagr)$/i;

  if (ie && Object.keys(ie).length > 0) {
    lines.push("### 隐含预期与模型参数", "", "| 参数 | 数值 |", "|:-----|:-----|");
    for (const [k, val] of Object.entries(ie)) {
      const cell =
        typeof val === "number"
          ? impliedPctKey.test(k)
            ? fmtPctMaybe(val)
            : fmtNum(val)
          : val === null || val === undefined
            ? "—"
            : String(val);
      lines.push(`| ${k} | ${cell} |`);
    }
    lines.push("");
  }

  lines.push(
    "> **说明**：上表与 `valuation_computed.json` 数值一致；若需机器交换或离线核对，请直接打开本 run 目录下的 **`valuation_computed.json`**。",
    "",
  );

  return lines.join("\n");
}

async function writeEntry(params: {
  siteDir: string;
  meta: EntryMeta;
  contentMarkdown: string;
}): Promise<void> {
  const dir = path.join(params.siteDir, "entries", params.meta.entryId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(params.meta, null, 2), "utf-8");
  await writeFile(path.join(dir, "content.md"), params.contentMarkdown, "utf-8");
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
  };
  orchestration?: { threadId?: string; runId?: string };
};

type BusinessAnalysisManifest = {
  manifestVersion: string;
  generatedAt: string;
  outputLayout: { code: string; runId: string };
  input: Record<string, unknown>;
  outputs: {
    qualitativeReportPath?: string;
    qualitativeD1D6Path?: string;
    marketPackPath?: string;
    phase1bMarkdownPath?: string;
  };
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

  const manifestRel = path.relative(siteDir, manifestPath);

  const topics: Array<{
    topic: ReportTopicType;
    status: RequiredFieldsStatus;
    markdown: string;
  }> = [];

  /** 龟龟整包 */
  {
    let status: RequiredFieldsStatus = "missing";
    let markdown = "";
    if (hasReportMd) {
      markdown = reportMarkdown.trim();
      status = hasValuationJson ? "complete" : "degraded";
    }
    topics.push({ topic: "turtle-strategy", status, markdown });
  }

  /** 估值 */
  {
    let status: RequiredFieldsStatus = "missing";
    const parts: string[] = [];
    if (hasValuationJson && valuationPath) {
      const vj = await readFile(valuationPath, "utf-8");
      parts.push(valuationComputedMarkdownBlock(vj));
      status = hasReportMd ? "complete" : "degraded";
    } else if (hasReportMd) {
      status = "degraded";
    }
    if (hasReportMd) {
      parts.push(reportMarkdown.trim());
    }
    const markdown = joinSections(parts);
    topics.push({ topic: "valuation", status, markdown });
  }

  /** 穿透回报率 */
  {
    let status: RequiredFieldsStatus = "missing";
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
    const markdown = joinSections(parts);
    topics.push({ topic: "penetration-return", status, markdown });
  }

  /** 商业质量（终稿在 business-analysis；workflow 用 Phase1B 或 Phase3 因子 1B 占位） */
  {
    const p1bPath = resolveArtifactPath(runDir, m.outputs.phase1bMarkdownPath);
    const hasP1b = Boolean(p1bPath && (await pathExists(p1bPath)));
    let status: RequiredFieldsStatus = "missing";
    const parts: string[] = [];
    if (hasP1b && p1bPath) {
      const md = await readFile(p1bPath, "utf-8");
      status = "degraded";
      parts.push(
        "> **说明**：workflow 产物不包含 `qualitative_report.md` 终稿；以下为 Phase1B 外部证据补充稿（占位降级）。完整商业质量评估请运行 `business-analysis:run`。",
        "## Phase1B（phase1b 补充稿）",
        md.trim(),
      );
    } else {
      const f1b = hasReportMd ? extractTurtleReportFactor1bSection(reportMarkdown) : undefined;
      if (f1b) {
        status = "degraded";
        parts.push(
          "> **说明**：当前 run 未携带 Phase1B 外部证据稿；以下为 **Phase3 报告中的因子 1B 摘要**（占位，**不是**六维商业质量终稿）。完整评估请运行 `business-analysis:run` 并在 Claude 会话收口 `qualitative_report.md`。",
          f1b,
        );
      } else if (hasReportMd) {
        status = "degraded";
        parts.push(
          "> **说明**：未找到 Phase1B 稿件，且本报告无可摘录的「因子 1B」章节。请运行 `business-analysis:run` 生成商业质量证据与终稿。",
        );
      }
    }
    const markdown = joinSections(parts);
    topics.push({ topic: "business-quality", status, markdown });
  }

  for (const t of topics) {
    if (!t.markdown.trim()) continue;
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

  const parts: string[] = [];
  if (hasQ && qPath) {
    const md = await readFile(qPath, "utf-8");
    parts.push(`## qualitative_report.md\n\n${md.trim()}`);
  }
  if (hasD1 && d1) {
    const md = await readFile(d1, "utf-8");
    parts.push(`## qualitative_d1_d6.md\n\n${md.trim()}`);
  }

  const markdown = joinSections(parts);
  if (!markdown.trim()) return;

  const confidenceBa = parseConfidenceFromReportMd(markdown);

  const topic: ReportTopicType = "business-quality";
  const entryId = buildEntryId(date, codeDigits, topic, runShort);
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

  /** 去重：同一自然日 + code + topic 仅保留 publishedAt 最新 */
  const dedup = new Map<string, TimelineItem>();
  const sorted = [...items].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  for (const it of sorted) {
    const dk = `${dateKeyFromIso(it.publishedAt)}|${it.code}|${it.topicType}`;
    dedup.set(dk, it);
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

  if (await pathExists(wf)) {
    await emitFromWorkflow(runDir, siteDir, wf);
  } else if (await pathExists(ba)) {
    await emitFromBusinessAnalysis(runDir, siteDir, ba);
  } else {
    throw new Error(
      `[reports-site] 未找到 workflow_manifest.json / business_analysis_manifest.json：${runDir}`,
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
