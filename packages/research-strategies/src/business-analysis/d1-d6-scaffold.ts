import type { Phase1BQualitativeSupplement } from "../phase1b/types.js";

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
 * 工程层写入可版本化 Markdown；深度叙事由上层 LLM 在骨架上补全。
 */
export function renderQualitativeD1D6Scaffold(input: {
  phase1b: Phase1BQualitativeSupplement;
  pdfPath?: string;
  reportUrl?: string;
}): string {
  const { phase1b, pdfPath, reportUrl } = input;
  const evidenceLines = flattenPhase1BEvidenceLines(phase1b);
  const rough = phase1bRoughSummary(phase1b);
  const evidenceHint =
    pdfPath || reportUrl
      ? `- 原始披露：${pdfPath ? `PDF \`${pdfPath}\`` : ""}${pdfPath && reportUrl ? "；" : ""}${reportUrl ? `URL \`${reportUrl}\`` : ""}`
      : "- 原始披露：未提供 PDF/URL（严格模式应补齐）";

  return [
    "# 商业分析六维（D1~D6）契约稿",
    "",
    "> 本文件为 **Turtle PDF-first 单 Agent** 对齐用的结构化占位 + Phase1B 事实摘录。",
    "> 各 `D*` 下「待 LLM 补全」段落应在协调器提示词中强制覆盖。",
    "",
    "## 元数据",
    "",
    `- 股票代码：${phase1b.stockCode}`,
    `- 公司：${phase1b.companyName}`,
    `- 年份：${phase1b.year ?? "（未指定）"}`,
    `- 生成时间：${phase1b.generatedAt}`,
    evidenceHint,
    "",
    "---",
    "",
    "## D1 商业模式（价值创造逻辑）",
    "",
    "### 事实摘录（Phase1B）",
    rough ? `> ${rough.replace(/\n/g, " ").slice(0, 800)}` : "> （Phase1B 无可用摘要字段）",
    "",
    "### 待 LLM 补全（PDF-first）",
    "- 客户需求 / 价值主张 / 收入模型的可验证描述",
    "- 与财报「收入确认」口径的一致性检查要点",
    "",
    "## D2 护城河与竞争地位（Greenwald 视角）",
    "",
    "### 待 LLM 补全",
    "- 供给侧规模经济、需求侧规模经济、高转换成本、网络效应等证据链",
    "- 与行业格局、价格带的对应关系",
    "",
    "## D3 外部环境（行业与政策）",
    "",
    "### 事实摘录（Phase1B 证据）",
    ...(evidenceLines.length > 0
      ? evidenceLines.slice(0, 12).map((e) => `- ${e}`)
      : ["- （无结构化证据条目）"]),
    "",
    "### 待 LLM 补全",
    "- 行业周期、监管与政策风险的可验证要点",
    "",
    "## D4 管理层与治理",
    "",
    "### 待 LLM 补全",
    "- 资本配置记录、激励相容、关联交易与治理结构（与 data_pack_report 交叉验证）",
    "",
    "## D5 MD&A 与经营讨论",
    "",
    "### 待 LLM 补全",
    "- 与 `data_pack_report` 中 **MDA** 章节对齐：经营变化、风险因素、前瞻性陈述可信度",
    "",
    "## D6 控股结构与资本架构",
    "",
    "### 待 LLM 补全",
    "- 控股链条、表内外杠杆、少数股东权益与利润分配（与 SUB / 资产负债表交叉验证）",
    "",
  ].join("\n");
}
