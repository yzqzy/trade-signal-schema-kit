import type { DataPackMarket } from "@trade-signal/schema-core";
import type { Phase1BQualitativeSupplement } from "../../steps/phase1b/types.js";
import { buildQualitativeMarketStructuredSnapshot } from "../../crosscut/structured-inputs/qualitative-market-structured-snapshot.js";

function flattenPhase1BEvidenceLines(p: Phase1BQualitativeSupplement): string[] {
  const out: string[] = [];
  for (const s of [...p.section7, ...p.section8]) {
    for (const e of s.evidences) {
      out.push(`${e.title} — ${e.url}${e.snippet ? `（${e.snippet.slice(0, 120)}…）` : ""}`);
    }
  }
  for (const m of p.section10) {
    for (const e of m.evidences) {
      out.push(`${m.heading} / ${e.title} — ${e.url}`);
    }
  }
  return out;
}

function phase1bRoughSummary(p: Phase1BQualitativeSupplement): string {
  const first =
    p.section7[0]?.content?.trim() ||
    p.section8[0]?.content?.trim() ||
    p.section10[0]?.points?.join("；") ||
    "";
  return first;
}

/**
 * PDF-first / 单 Agent 六维（D1~D6）契约：输出固定骨架，便于与 Turtle qualitative_assessment_v2 语义对齐。
 * 工程层写入可版本化 Markdown；正文在 Claude Code 工作区会话中按门槛补全。
 */
export function renderQualitativeD1D6Scaffold(input: {
  phase1b: Phase1BQualitativeSupplement;
  marketMarkdown?: string;
  phase1aDataPack?: DataPackMarket;
  pdfPath?: string;
  reportUrl?: string;
  /** 已生成 `data_pack_report.md`（Phase2B）时为 true */
  hasDataPackReport?: boolean;
  /** 已生成报告包时，可嵌入摘录供 D4/D5 交叉引用（过长由调用方截断） */
  dataPackReportExcerpt?: string;
}): string {
  const {
    phase1b,
    marketMarkdown,
    phase1aDataPack,
    pdfPath,
    reportUrl,
    hasDataPackReport,
    dataPackReportExcerpt,
  } = input;
  const reportPackReady = Boolean(hasDataPackReport);
  const evidenceLines = flattenPhase1BEvidenceLines(phase1b);
  const evidenceCount = evidenceLines.length;
  const rough = phase1bRoughSummary(phase1b);
  const evidenceHint =
    pdfPath || reportUrl
      ? `- 原始披露：${pdfPath ? `PDF \`${pdfPath}\`` : ""}${pdfPath && reportUrl ? "；" : ""}${reportUrl ? `URL \`${reportUrl}\`` : ""}`
      : "- 原始披露：未提供 PDF/URL（严格模式应补齐）";
  const structuredMarketSnapshot = marketMarkdown
    ? buildQualitativeMarketStructuredSnapshot({ phase1b, marketMarkdown, phase1aDataPack })
    : undefined;
  const structuredDefaults: Record<string, string> = {};
  if (structuredMarketSnapshot) {
    structuredDefaults.industry_name = structuredMarketSnapshot.cycle.industryName;
    structuredDefaults.industry_cyclicality = structuredMarketSnapshot.cycle.cyclicality;
    structuredDefaults.industry_cycle_position = structuredMarketSnapshot.cycle.position;
    structuredDefaults.industry_cycle_confidence = structuredMarketSnapshot.cycle.confidence;
    structuredDefaults.peer_pool_source = structuredMarketSnapshot.peers.source;
    structuredDefaults.peer_core_codes = structuredMarketSnapshot.peers.peerCodes.join(", ") || "—";
    structuredDefaults.peer_pool_size = String(structuredMarketSnapshot.peers.peerCodes.length);
    structuredDefaults.governance_event_count = String(structuredMarketSnapshot.governance.events.length);
    structuredDefaults.governance_high_severity_count = String(
      structuredMarketSnapshot.governance.highSeverityCount,
    );
  }

  return [
    "# 商业分析六维（D1~D6）契约稿",
    "",
    "> 本文件为 **Turtle PDF-first 单 Agent** 对齐用的结构化占位 + Phase1B 事实摘录。",
    "> 各 `D*` 下「待补全正文」须在 Claude Code 同目录会话中按证据门槛撰写。",
    "",
    "## 输出质量门槛（可执行契约）",
    "",
    "- 每一 `D*` 正文须含 **≥1 条可追溯证据**（PDF 页码 / 检索 URL / `data_pack_report` 段落引用）。",
    "- **D3 / D5**：若 Phase1B 结构化证据 < 2 条，须在章节首行声明 **「证据不足，待补充检索」**，禁止编造细节。",
    "- 禁止无来源的绝对化表述（如「必然」「毫无疑问」）；数值须标注口径（TTM / 年报 / 中报）。",
    "- 与 `data_pack_market.md` §13 Warnings 冲突时，须在对应 `D*` 明示「以 Warning 为优先」并解释影响。",
    "",
    "## 元数据",
    "",
    `- 股票代码：${phase1b.stockCode}`,
    `- 公司：${phase1b.companyName}`,
    `- 年份：${phase1b.year ?? "（未指定）"}`,
    `- 生成时间：${phase1b.generatedAt}`,
    evidenceHint,
    `- Phase1B 结构化证据条数：**${evidenceCount}**`,
    "",
    "---",
    "",
    "## P2/P3/P4 数据契约快照（Feed-first）",
    "",
    ...(structuredMarketSnapshot
      ? [
          `- 数据来源模式：${structuredMarketSnapshot.provenance}（feed/hybrid/fallback_text）`,
          "",
          "### P2 行业周期序列（最小契约）",
          "",
          `- 行业：${structuredMarketSnapshot.cycle.industryName}`,
          `- 周期属性：${structuredMarketSnapshot.cycle.cyclicality}`,
          `- 周期位置：${structuredMarketSnapshot.cycle.position}`,
          `- 置信度：${structuredMarketSnapshot.cycle.confidence}`,
          "",
          "| 指标 | 摘要 | 发布时间 | 证据 |",
          "|:---|:---|:---|:---|",
          ...(structuredMarketSnapshot.cycle.signals.length > 0
            ? structuredMarketSnapshot.cycle.signals.map(
                (s) =>
                  `| ${s.indicator} | ${s.summary.replaceAll("|", "\\|")} | ${s.publishedAt ?? "—"} | ${s.evidenceUrl ?? "—"} |`,
              )
            : ["| （缺口） | 未解析到行业周期信号 | — | — |"]),
          "",
          "### P3 同业可比池（自动 TopN）",
          "",
          `- 来源：${structuredMarketSnapshot.peers.source}`,
          `- 同业池：${structuredMarketSnapshot.peers.peerCodes.length > 0 ? structuredMarketSnapshot.peers.peerCodes.join("、") : "（缺口）未解析到同业代码"}`,
          `- 备注：${structuredMarketSnapshot.peers.note ?? "—"}`,
          "",
          "### P4 治理负面事件归一",
          "",
          `- 事件总数：${structuredMarketSnapshot.governance.events.length}`,
          `- 高严重级：${structuredMarketSnapshot.governance.highSeverityCount}`,
          "",
          "| 严重级 | 摘要 | 时间 | 证据 |",
          "|:---|:---|:---|:---|",
          ...(structuredMarketSnapshot.governance.events.length > 0
            ? structuredMarketSnapshot.governance.events.map(
                (e) =>
                  `| ${e.severity} | ${e.summary.replaceAll("|", "\\|")} | ${e.happenedAt ?? "—"} | ${e.evidenceUrl ?? "—"} |`,
              )
            : ["| （缺口） | 未命中治理负面事件 | — | — |"]),
          "",
        ]
      : ["- （未提供 market markdown，跳过结构化快照）", ""]),
    "## D1 商业模式（价值创造逻辑）",
    "",
    "### 证据约束",
    "- 至少 1 条来源指向：收入结构、分部、或财报「主营业务」描述。",
    "",
    "### 事实摘录（Phase1B）",
    rough ? `> ${rough.replace(/\n/g, " ").slice(0, 800)}` : "> （Phase1B 无可用摘要字段）",
    "",
    "### 待补全正文（PDF-first）",
    "- 客户需求 / 价值主张 / 收入模型的可验证描述",
    "- 与财报「收入确认」口径的一致性检查要点",
    "",
    "## D2 护城河与竞争地位（Greenwald 视角）",
    "",
    "### 证据约束",
    "- 竞争格局须引用 Phase1B §7/§8 或 PDF 中可核对段落，不得纯常识堆砌。",
    "",
    "### 待补全正文",
    "- 供给侧规模经济、需求侧规模经济、高转换成本、网络效应等证据链",
    "- 与行业格局、价格带的对应关系",
    "",
    "## D3 外部环境（行业与政策）",
    "",
    "### 证据约束",
    "- 政策/监管论点须对应可追溯来源；无来源则列入「待核验清单」。",
    "",
    "### 事实摘录（Phase1B 证据）",
    ...(evidenceLines.length > 0
      ? evidenceLines.slice(0, 12).map((e) => `- ${e}`)
      : ["- （无结构化证据条目）"]),
    "",
    "### 待补全正文",
    "- 行业周期、监管与政策风险的可验证要点",
    "",
    "## D4 管理层与治理",
    "",
    "### 证据约束",
    "- 须与 `data_pack_report` 治理/关联交易相关摘录交叉引用（若报告包缺失则声明缺口）。",
    "",
    ...(dataPackReportExcerpt?.trim()
      ? [
          "### data_pack_report 摘录（工程注入）",
          "",
          "```markdown",
          dataPackReportExcerpt.trim(),
          "```",
          "",
        ]
      : []),
    "### 待补全正文",
    "- 资本配置记录、激励相容、关联交易与治理结构（与 data_pack_report 交叉验证）",
    "",
    "## D5 MD&A 与经营讨论",
    "",
    ...(!reportPackReady
      ? [
          "> **「证据不足，待补充 PDF 解析」**（规则 B）：本 run 未生成 `data_pack_report.md`；D5 仅允许**预研级**草稿，禁止**交付级**经营细节展开。交付级须走 Phase0 + Phase2A/2B（或 `business-analysis --strict` / `workflow --mode turtle-strict` 强制 PDF 链）。",
          "",
        ]
      : []),
    "### 证据约束",
    "- 必须以 `data_pack_report` 的 **MDA** 块为主证据；缺失时停止展开经营细节。",
    "",
    "### 待补全正文",
    "- 与 `data_pack_report` 中 **MDA** 章节对齐：经营变化、风险因素、前瞻性陈述可信度",
    "",
    "## D6 控股结构与资本架构",
    "",
    "### 证据约束",
    "- 控股与资本工具描述须引用 SUB/权益变动或资产负债表附注；与 `data_pack_market` 有息负债、少数股东损益对照。",
    "",
    "### 待补全正文",
    "- 控股链条、表内外杠杆、少数股东权益与利润分配（与 SUB / 资产负债表交叉验证）",
    "",
    "## 编排层自检（写入时生成）",
    "",
    evidenceCount < 2
      ? "> ⚠️ **提示**：Phase1B 证据 < 2 条，严格 PDF-first 下应在运行前补充检索或放宽为非 strict。"
      : "> ✅ Phase1B 证据条数达到最低参考阈值（仍以人工/LLM 复核为准）。",
    "",
    ...renderPublishLevelStructuredParamsSkeleton(structuredDefaults),
  ].join("\n");
}

/**
 * 与参考工程 `output_schema` **键名**对齐的发布级骨架表（值须由会话/证据填充，禁止空造数）。
 * 若参考 schema 增删字段，请同步本列表与 `docs/guides/turtle-framework-alignment-gap-matrix.md`。
 */
function renderPublishLevelStructuredParamsSkeleton(defaultValues?: Record<string, string>): string[] {
  const keys: Array<{ key: string; hint: string }> = [
    { key: "moat_rating", hint: "1~5 或 qualitative" },
    { key: "industry_name", hint: "P2 行业名称（统一口径）" },
    { key: "industry_cyclicality", hint: "strong / weak / non_cyclical / unknown" },
    { key: "industry_cycle_position", hint: "bottom / middle / top / unknown" },
    { key: "industry_cycle_confidence", hint: "high / medium / low" },
    { key: "peer_pool_source", hint: "feed_auto_industry / manual / hybrid" },
    { key: "peer_core_codes", hint: "3~5 家核心竞品代码" },
    { key: "peer_pool_size", hint: "可比池样本数" },
    { key: "governance_event_count", hint: "治理负面事件总数" },
    { key: "governance_high_severity_count", hint: "高严重级事件数" },
    { key: "management_rating", hint: "治理与资本配置" },
    { key: "roe_5y_avg", hint: "%；须与 §17/年报一致" },
    { key: "revenue_cagr_5y", hint: "%；多年表须非单期复制" },
    { key: "gross_margin_trend", hint: "stable / up / down + 证据" },
    { key: "net_margin_level", hint: "与 §3 同源" },
    { key: "debt_to_equity", hint: "与 §4 同源" },
    { key: "interest_coverage", hint: "若缺有息负债则标缺口" },
    { key: "fcf_yield", hint: "与 §17 FCF / 市值" },
    { key: "dividend_streak_years", hint: "来自 DPS 序列" },
    { key: "payout_ratio_avg", hint: "DPS/EPS 多年均值" },
    { key: "insider_ownership_pct", hint: "feed 或年报披露" },
    { key: "catalysts_12m", hint: "可验证事件列表" },
    { key: "bear_case", hint: "结构化一句" },
    { key: "base_case", hint: "结构化一句" },
    { key: "bull_case", hint: "结构化一句" },
    { key: "fair_value_mid", hint: "与 valuation 交叉引用" },
    { key: "margin_of_safety_pct", hint: "相对现价" },
    { key: "position_size_suggestion", hint: "须声明置信度" },
    { key: "esg_or_regulatory_overhang", hint: "可选" },
  ];
  return [
    "## 发布级结构化参数（output_schema 兼容骨架）",
    "",
    "> 键名与 Turtle 参考 `output_schema` **对齐**；`value` 列默认 `—`，须在 **Claude Code 同目录会话** 中按 `[E*]/[M:§x]` 证据规则填写。",
    "",
    "| schema_key | value | notes |",
    "|:---|:---|:---|",
    ...keys.map((r) => `| ${r.key} | ${defaultValues?.[r.key] ?? "—"} | ${r.hint} |`),
    "",
  ];
}
