/**
 * Feed-first 缺口契约：从 `data_pack_market.md` 等工程产物推断缺口，
 * 生成固定 Markdown 小节 `## 数据缺口与补齐建议`（不静默补数、不外网拉取）。
 */
import type { FeedDataGap } from "@trade-signal/schema-core";

import { parseDataPackMarket } from "../../steps/phase3/market-pack-parser.js";

export type { FeedDataGap } from "@trade-signal/schema-core";

const SEVERITY_ORDER: Record<FeedDataGap["severity"], number> = {
  blocking: 0,
  degraded: 1,
  hint: 2,
};

function pushUnique(gaps: FeedDataGap[], gap: FeedDataGap): void {
  if (gaps.some((g) => g.id === gap.id)) return;
  gaps.push(gap);
}

/** 统计 market 包内「估算」血缘标签出现次数（与 Phase3 preflight 一致口径） */
function countEstimateTags(marketMd: string): number {
  const m = marketMd.match(/\[估算\|/g);
  return m?.length ?? 0;
}

/**
 * 评估 Feed / 工程占位导致的缺口（含同业、周期定位所需的 **数据前提** 缺口）。
 */
export function evaluateFeedDataGaps(input: {
  marketMarkdown: string;
  hasDataPackReport?: boolean;
  companyName?: string;
}): FeedDataGap[] {
  const md = input.marketMarkdown;
  const name = (input.companyName ?? "").trim() || "该公司";
  const parsed = parseDataPackMarket(md);
  const gaps: FeedDataGap[] = [];

  if (!input.hasDataPackReport) {
    pushUnique(gaps, {
      id: "missing_data_pack_report",
      severity: "blocking",
      target: "data_pack_report.md（Phase2A/2B）",
      impact: "无法做 MD&A / 附注级交叉验证，发布级定性深度受限。",
      remediation:
        "运行 `pnpm run business-analysis:run` / `workflow:run` 并确保 Phase0+PDF 链生成 `data_pack_report.md`；或续跑时 `--output-dir` 指向已有 run。",
      suggestedCommand: `pnpm run business-analysis:run -- --code <CODE> --strict`,
    });
  }

  if (md.includes("§8 重大事件与公告（占位）")) {
    pushUnique(gaps, {
      id: "section8_events_placeholder",
      severity: "degraded",
      target: "§8 重大事件与公告",
      impact: "事件驱动与治理突发风险难以量化进 Phase3/定性叙事。",
      remediation: "在 feed 增加公告/大事接口并由编排写入 §8；或依赖 Phase1B 检索在会话中手工补齐并引用 URL。",
      suggestedCommand: `pnpm run workflow:run -- --code <CODE> --mode turtle-strict`,
    });
  }

  if (md.includes("§14 管理层与治理（占位）")) {
    pushUnique(gaps, {
      id: "section14_governance_placeholder",
      severity: "hint",
      target: "§14 管理层与治理",
      impact: "D4 治理维度缺少结构化行情侧输入。",
      remediation: "会话侧结合年报「公司治理」章与 Phase1B 证据撰写；feed 侧可扩展治理字段。",
    });
  }

  if (md.includes("§15 风险提示汇总（占位）")) {
    pushUnique(gaps, {
      id: "section15_risk_placeholder",
      severity: "hint",
      target: "§15 风险提示汇总",
      impact: "风险汇总依赖人工整合 §2/§13 与 MD&A。",
      remediation: "在终稿中汇总；或扩展 feed 风险标签写入 §15。",
    });
  }

  if (md.includes("§4P 母公司资产负债表缺失") || /母公司资产负债表缺失/.test(md)) {
    pushUnique(gaps, {
      id: "parent_balance_sheet_missing",
      severity: "degraded",
      target: "§4P 母公司资产负债表",
      impact: "表内表外杠杆与母公司偿债路径分析不完整。",
      remediation:
        "在 instrument/financialHistory 中补齐 `parentTotalAssets` / `parentTotalLiabilities` 等字段后刷新 `data_pack_market.md`。",
    });
  }

  if (md.includes("行业标签：未知") || !parsed.industry || parsed.industry.includes("未知")) {
    pushUnique(gaps, {
      id: "industry_unknown_peer_cycle",
      severity: "blocking",
      target: "§1/§9 行业标签",
      impact: "同业对标可比池与行业周期定位 **无法自动绑定**（Feed-first 下禁止猜测行业）。",
      remediation: `在 feed instrument 提供可靠 \`industry\` / 申万（或等价）分类后再刷新市场包；Phase1B 可检索「${name} 行业分类」辅助会话定性（不得当作结构化 feed）。`,
    });
  }

  if (/前十大股东明细待 feed/.test(md)) {
    pushUnique(gaps, {
      id: "top10_shareholders_feed",
      severity: "hint",
      target: "§7 前十大股东明细",
      impact: "股权集中度与筹码结构分析缺少结构化序列。",
      remediation: "扩展 feed 股东持股接口并接入 `build-market-pack` §7。",
    });
  }

  if (/（默认占位）/.test(md)) {
    pushUnique(gaps, {
      id: "risk_free_rate_placeholder",
      severity: "hint",
      target: "无风险利率 rf",
      impact: "DCF/要求回报率敏感性分析基准可能偏离市场。",
      remediation: "设置环境变量（见 `build-market-pack` 注释）或在上游数据包提供无风险利率。",
    });
  }

  const estimates = countEstimateTags(md);
  if (estimates >= 3) {
    pushUnique(gaps, {
      id: "many_estimated_financial_cells",
      severity: "degraded",
      target: "§3~§5 财务表（[估算|…] 标签）",
      impact: `多处科目为编排层估算（${estimates} 处），穿透回报与资产质量结论置信度下降。`,
      remediation: `用年报 PDF 复核并用 Phase2 抽取覆盖；检索「${name} 年报 现金流量表 有息负债」。`,
    });
  }

  if (/单期回退复制|replicatedFallback/.test(md)) {
    pushUnique(gaps, {
      id: "financial_history_replicated_fallback",
      severity: "degraded",
      target: "financialHistory 多年序列",
      impact: "多年表可能由单期复制，趋势与 CAGR 类指标不可靠。",
      remediation: "在 Phase1A 数据包提供真实 `financialHistory` 多年快照后重新生成市场包。",
    });
  }

  // --- 深度层：同业 / 周期（仅缺口，不提供静默数据） ---
  if (md.includes("竞争格局摘要建议由 Phase1B") || md.includes("竞争格局摘要建议由 Phase1B §8")) {
    pushUnique(gaps, {
      id: "peer_narrative_not_in_feed",
      severity: "hint",
      target: "同业竞争格局（结构化可比池）",
      impact: "发布级「同业对标」段落缺少统一可比公司与指标映射。",
      remediation:
        "在 feed 增加「同业可比池 + 指标宽表」契约前，仅在会话中定性描述并保留本缺口提示；禁止编造对标数值。",
    });
  }

  if (/区间 K 线根数：\s*0\b/.test(md) || /最近一根 K 线：无/.test(md)) {
    pushUnique(gaps, {
      id: "kline_window_empty_or_zero",
      severity: "degraded",
      target: "§6 K 线 / 交易窗口",
      impact: "周期定位（价格/换手）与技术面上下文不足。",
      remediation: "检查 Phase1A `klines` 采样窗口与 feed 权限；刷新市场包。",
    });
  }

  gaps.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return gaps;
}

function severityLabel(s: FeedDataGap["severity"]): string {
  if (s === "blocking") return "阻断级";
  if (s === "degraded") return "降级级";
  return "提示级";
}

/** 固定标题，供 business-analysis / workflow / report 拼接 */
export function renderFeedGapMarkdownSection(gaps: FeedDataGap[]): string {
  const lines: string[] = [
    "## 数据缺口与补齐建议",
    "",
    "> **Feed-first**：下列项表示当前数据包或工程占位无法满足发布级/深度分析之处；**禁止**用虚构数值静默填平。",
    "",
  ];
  if (gaps.length === 0) {
    lines.push("> 未命中工程侧缺口规则（仍以 Phase1B 与人工复核为准）。", "");
    return lines.join("\n");
  }
  lines.push("| 级别 | 缺口目标 | 影响 | 补齐建议 |", "|:---|:---|:---|:---|");
  for (const g of gaps) {
    const cmd = g.suggestedCommand ? ` \`${g.suggestedCommand}\`` : "";
    lines.push(
      `| ${severityLabel(g.severity)} | ${g.target} | ${g.impact} | ${g.remediation}${cmd} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function appendFeedGapSection(markdown: string, gaps: FeedDataGap[]): string {
  const section = renderFeedGapMarkdownSection(gaps);
  if (markdown.includes("## 数据缺口与补齐建议")) {
    return markdown;
  }
  return `${markdown.trimEnd()}\n\n${section}`;
}
