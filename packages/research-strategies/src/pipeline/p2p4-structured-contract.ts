import type {
  DataPackMarket,
  GovernanceEventCollection,
  GovernanceNegativeEvent,
  IndustryCycleSnapshot,
  PeerComparableCollection,
} from "@trade-signal/schema-core";

import type { Phase1BItem, Phase1BQualitativeSupplement } from "../stages/phase1b/types.js";
import { parseDataPackMarket } from "../stages/phase3/market-pack-parser.js";

export interface P2P4StructuredSnapshot {
  cycle: IndustryCycleSnapshot;
  peers: PeerComparableCollection;
  governance: GovernanceEventCollection;
  provenance: "feed" | "hybrid" | "fallback_text";
}

const CYCLE_KEYWORDS = ["周期", "景气", "供需", "产能", "库存", "价格", "原材料"];
const GOVERNANCE_NEGATIVE_KEYWORDS = [
  "处罚",
  "问询",
  "立案",
  "违规",
  "诉讼",
  "减持",
  "质押",
  "审计",
  "失信",
  "重组失败",
];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function inferCyclePositionFromText(text: string): IndustryCycleSnapshot["position"] {
  if (/底部|出清|触底|复苏早期/.test(text)) return "bottom";
  if (/顶部|过热|回落|下行/.test(text)) return "top";
  if (/中段|平稳|震荡|修复/.test(text)) return "middle";
  return "unknown";
}

function inferCyclicalityFromText(text: string): IndustryCycleSnapshot["cyclicality"] {
  if (/强周期|高弹性/.test(text)) return "strong";
  if (/弱周期|防御/.test(text)) return "weak";
  if (/非周期|稳定需求/.test(text)) return "non_cyclical";
  return "unknown";
}

function severityFromText(text: string): GovernanceNegativeEvent["severity"] {
  if (/立案|重大|刑事|退市|暂停/.test(text)) return "high";
  if (/问询|处罚|减持|诉讼|质押/.test(text)) return "medium";
  return "low";
}

function safePublishedAt(item: Phase1BItem): string | undefined {
  const first = item.evidences.find((e) => Boolean(e.publishedAt?.trim()));
  return first?.publishedAt?.trim();
}

function collectCycleSignals(section8: Phase1BItem[]): IndustryCycleSnapshot["signals"] {
  const signals: IndustryCycleSnapshot["signals"] = [];
  for (const item of section8) {
    const sourceText = normalizeText(`${item.item} ${item.content}`);
    if (!CYCLE_KEYWORDS.some((kw) => sourceText.includes(kw))) continue;
    signals.push({
      indicator: item.item,
      summary: item.content || "（无摘要）",
      publishedAt: safePublishedAt(item),
      evidenceUrl: item.evidences[0]?.url,
    });
  }
  return signals.slice(0, 8);
}

function extractPeerCodes(section8: Phase1BItem[]): string[] {
  const codes: string[] = [];
  for (const item of section8) {
    if (!/竞品|竞争|同业|可比/.test(item.item + item.content)) continue;
    const matched = `${item.item} ${item.content}`.match(/\b\d{6}\b/g) ?? [];
    for (const code of matched) {
      if (!codes.includes(code)) codes.push(code);
    }
  }
  return codes.slice(0, 5);
}

function buildGovernanceEvents(section7: Phase1BItem[]): GovernanceNegativeEvent[] {
  const events: GovernanceNegativeEvent[] = [];
  for (const item of section7) {
    const combined = normalizeText(`${item.item} ${item.content}`);
    if (!GOVERNANCE_NEGATIVE_KEYWORDS.some((kw) => combined.includes(kw))) continue;
    events.push({
      category: "governance_negative",
      summary: item.content || item.item,
      severity: severityFromText(combined),
      happenedAt: safePublishedAt(item),
      evidenceUrl: item.evidences[0]?.url,
      sourceLabel: item.evidences[0]?.source ?? "phase1b",
    });
  }
  return events.slice(0, 12);
}

export function buildP2P4StructuredSnapshot(input: {
  phase1b: Phase1BQualitativeSupplement;
  marketMarkdown: string;
  phase1aDataPack?: DataPackMarket;
}): P2P4StructuredSnapshot {
  const parsedMarket = parseDataPackMarket(input.marketMarkdown);
  const feedCycle = input.phase1aDataPack?.industryCycleSnapshot;
  const feedPeers = input.phase1aDataPack?.peerComparablePool;
  const feedGovernance = input.phase1aDataPack?.governanceEventCollection;

  const fallbackCycleSignals = collectCycleSignals(input.phase1b.section8);
  const fallbackCycleText = normalizeText(fallbackCycleSignals.map((s) => s.summary).join(" "));
  const fallbackPeerCodes = extractPeerCodes(input.phase1b.section8);
  const fallbackGovernanceEvents = buildGovernanceEvents(input.phase1b.section7);

  const cycle: IndustryCycleSnapshot = feedCycle
    ? {
        ...feedCycle,
        industryName: feedCycle.industryName || parsedMarket.industry || "未知行业",
        classification: feedCycle.classification || "feed_industry_cycle",
        signals:
          feedCycle.signals.length > 0
            ? feedCycle.signals
            : fallbackCycleSignals,
      }
    : {
        industryName: parsedMarket.industry || "未知行业",
        classification: "phase1b_text_fallback",
        cyclicality: inferCyclicalityFromText(fallbackCycleText),
        position: inferCyclePositionFromText(fallbackCycleText),
        confidence:
          fallbackCycleSignals.length >= 3 ? "high" : fallbackCycleSignals.length >= 1 ? "medium" : "low",
        signals: fallbackCycleSignals,
      };

  const peers: PeerComparableCollection = feedPeers
    ? {
        ...feedPeers,
        industryName: feedPeers.industryName || parsedMarket.industry || "未知行业",
        source: feedPeers.source || "feed_peer_pool",
        peerCodes:
          feedPeers.peerCodes.length > 0 ? feedPeers.peerCodes : fallbackPeerCodes,
        note:
          feedPeers.note ||
          (feedPeers.peerCodes.length > 0
            ? "同业池来自 feed 聚合接口。"
            : "feed 同业池为空，降级到 Phase1B 文本解析。"),
      }
    : {
        source: "phase1b_text_fallback",
        industryName: parsedMarket.industry || "未知行业",
        peerCodes: fallbackPeerCodes,
        note:
          fallbackPeerCodes.length > 0
            ? "由 Phase1B §8 文本中的竞品代码归一得到。"
            : "未从 Phase1B §8 解析出竞品代码，需补同业池上游供给。",
      };

  const governance: GovernanceEventCollection = feedGovernance
    ? {
        ...feedGovernance,
        source: feedGovernance.source || "feed_governance",
        events:
          feedGovernance.events.length > 0
            ? feedGovernance.events
            : fallbackGovernanceEvents,
        highSeverityCount:
          feedGovernance.highSeverityCount ??
          feedGovernance.events.filter((e) => e.severity === "high").length,
      }
    : {
        source: "phase1b_section7_fallback",
        events: fallbackGovernanceEvents,
        highSeverityCount: fallbackGovernanceEvents.filter((e) => e.severity === "high").length,
      };

  const hasFeed =
    Boolean(feedCycle) || Boolean(feedPeers) || Boolean(feedGovernance);
  const hasFallbackHit =
    fallbackCycleSignals.length > 0 || fallbackPeerCodes.length > 0 || fallbackGovernanceEvents.length > 0;
  const provenance: P2P4StructuredSnapshot["provenance"] = hasFeed
    ? hasFallbackHit
      ? "hybrid"
      : "feed"
    : "fallback_text";

  return {
    cycle,
    peers,
    governance,
    provenance,
  };
}
