import type { Phase1BItem, Phase1BMdaSection, Phase1BQualitativeSupplement } from "./types.js";

const NOT_FOUND_TEXT = "⚠️ 未搜索到相关信息";

/** 单章节（§7 或 §8）证据结构质量指标（离线、可回归）。 */
export interface Phase1bSectionEvidenceMetrics {
  itemCount: number;
  emptyItemCount: number;
  totalEvidenceCount: number;
  uniqueTitleCount: number;
  /** uniqueTitleCount / max(totalEvidenceCount,1) */
  uniqueTitleRatio: number;
  /** 同一章节内：证据 URL 出现在 ≥2 个不同条目中的条数占比（相对总证据条数） */
  crossItemDuplicateUrlRatio: number;
  /** 至少有一条证据标题命中该条目期望主题的条目数 / max(有证据条目数,1) */
  topicHitRatio: number;
  topicHitItemCount: number;
  itemsWithEvidenceCount: number;
}

export interface Phase1bItemQualityRow {
  catalog: "7" | "8" | "10";
  item: string;
  evidenceCount: number;
  topicHit: boolean;
}

export interface Phase1bEvidenceQualityMetrics {
  stockCode: string;
  section7: Phase1bSectionEvidenceMetrics;
  section8: Phase1bSectionEvidenceMetrics;
  /** §7 与 §8 之间：Jaccard(url) = |交集| / |并集| */
  crossSectionSharedUrlRatio: number;
  /** 每条检索意图的闸门与主题命中（便于回归） */
  byItem: Phase1bItemQualityRow[];
  evaluatedAt: string;
}

function normalizeTitleKey(title: string): string {
  return (title ?? "")
    .replace(/\s+/g, "")
    .replace(/[【】\[\]()（）\-—_:：,，。·]/g, "")
    .toLowerCase();
}

/** 与 Phase1B 采集条目对齐的轻量主题命中（标题子串）。 */
export function topicPatternForPhase1bItem(item: string): RegExp | undefined {
  if (item.includes("控股股东")) return /持股|控股|股东|实际控制人|权益变动|股权|前十名|比例/;
  if (item.includes("CEO") || item.includes("董事长") || item.includes("CFO"))
    return /董事|监事|高管|总经理|董事长|财务总监|总裁|副总裁|离任|辞职|聘任|任免|任职/;
  if (item.includes("管理层重大")) return /辞职|离任|聘任|任免|变更|选举|高管|董事|监事/;
  if (item.includes("审计师") || item.includes("审计意见"))
    return /审计|会计师|内控|非标|保留意见|无法表示|否定意见|审计报告/;
  if (item.includes("违规") || item.includes("处罚"))
    return /违规|处罚|立案|警示函|监管函|问询函|关注函|责令改正|行政处罚|监管措施|纪律处分/;
  if (item.includes("质押") || item.includes("减持"))
    return /质押|减持|增持|股份变动|司法冻结|解除质押|解押|冻结|持股.*变动/;
  if (item.includes("回购")) return /回购/;
  if (item.includes("主要竞争对手")) return /竞争|市场份额|行业|主要客户|供应商|订单|中标|投标|产能/;
  if (item.includes("行业监管动态")) return /监管|政策|规范|办法|行政法规|部门规章|问询|处罚|立案|警示/;
  if (item.includes("行业周期位置")) return /周期|景气|需求|价格|库存|产能|减值|行业|市场/;
  return undefined;
}

function isEmptyItem(row: Phase1BItem): boolean {
  if (!row.evidences?.length) return true;
  if (row.content === NOT_FOUND_TEXT) return true;
  return false;
}

function itemTopicHitRow(row: Phase1BItem): boolean {
  const pattern = topicPatternForPhase1bItem(row.item);
  if (!pattern) return true;
  return (row.evidences ?? []).some((e) => pattern.test(e.title ?? ""));
}

function rowsToByItem(rows: Phase1BItem[], catalog: "7" | "8"): Phase1bItemQualityRow[] {
  return rows.map((row) => ({
    catalog,
    item: row.item,
    evidenceCount: row.evidences?.length ?? 0,
    topicHit: !isEmptyItem(row) && itemTopicHitRow(row),
  }));
}

function section10ToByItem(rows: Phase1BMdaSection[]): Phase1bItemQualityRow[] {
  return rows.map((row) => {
    const pattern = topicPatternForPhase1bItem(row.heading);
    const topicHit =
      (row.evidences?.length ?? 0) > 0 &&
      (pattern ? row.evidences.some((e) => pattern.test(e.title ?? "")) : true);
    return {
      catalog: "10" as const,
      item: row.heading,
      evidenceCount: row.evidences?.length ?? 0,
      topicHit,
    };
  });
}

function metricsForSection(rows: Phase1BItem[]): Phase1bSectionEvidenceMetrics {
  const itemCount = rows.length;
  let emptyItemCount = 0;
  let totalEvidenceCount = 0;
  const titleKeys = new Map<string, number>();
  const urlToItems = new Map<string, Set<number>>();

  let itemsWithEvidenceCount = 0;
  let topicHitItemCount = 0;

  rows.forEach((row, idx) => {
    if (isEmptyItem(row)) {
      emptyItemCount += 1;
      return;
    }
    itemsWithEvidenceCount += 1;
    const pattern = topicPatternForPhase1bItem(row.item);
    let itemTopicHit = false;
    for (const ev of row.evidences) {
      totalEvidenceCount += 1;
      const tk = normalizeTitleKey(ev.title ?? "");
      titleKeys.set(tk, (titleKeys.get(tk) ?? 0) + 1);
      const u = (ev.url ?? "").trim();
      if (u) {
        if (!urlToItems.has(u)) urlToItems.set(u, new Set());
        urlToItems.get(u)!.add(idx);
      }
      if (pattern && pattern.test(ev.title ?? "")) itemTopicHit = true;
    }
    if (pattern && itemTopicHit) topicHitItemCount += 1;
    else if (!pattern) topicHitItemCount += 1;
  });

  const uniqueTitleCount = titleKeys.size;
  const uniqueTitleRatio = totalEvidenceCount > 0 ? uniqueTitleCount / totalEvidenceCount : 1;

  let crossItemDupEvidenceSlots = 0;
  for (const row of rows) {
    for (const ev of row.evidences ?? []) {
      const u = (ev.url ?? "").trim();
      if (!u) continue;
      const set = urlToItems.get(u);
      if (set && set.size > 1) crossItemDupEvidenceSlots += 1;
    }
  }
  const crossItemDuplicateUrlRatio =
    totalEvidenceCount > 0 ? crossItemDupEvidenceSlots / totalEvidenceCount : 0;

  const topicHitRatio =
    itemsWithEvidenceCount > 0 ? topicHitItemCount / itemsWithEvidenceCount : 1;

  return {
    itemCount,
    emptyItemCount,
    totalEvidenceCount,
    uniqueTitleCount,
    uniqueTitleRatio,
    crossItemDuplicateUrlRatio,
    topicHitRatio,
    topicHitItemCount,
    itemsWithEvidenceCount,
  };
}

/**
 * 对 C2 投影后的 Phase1B 产物做离线质量汇总，便于回归对比（不要求外网）。
 */
export function computePhase1bEvidenceQualityMetrics(
  supplement: Phase1BQualitativeSupplement,
): Phase1bEvidenceQualityMetrics {
  const section7 = metricsForSection(supplement.section7);
  const section8 = metricsForSection(supplement.section8);

  const urls7 = new Set<string>();
  const urls8 = new Set<string>();
  for (const row of supplement.section7) {
    for (const ev of row.evidences ?? []) {
      const u = (ev.url ?? "").trim();
      if (u) urls7.add(u);
    }
  }
  for (const row of supplement.section8) {
    for (const ev of row.evidences ?? []) {
      const u = (ev.url ?? "").trim();
      if (u) urls8.add(u);
    }
  }
  let shared = 0;
  for (const u of urls7) {
    if (urls8.has(u)) shared += 1;
  }
  const union = urls7.size + urls8.size - shared;
  const crossSectionSharedUrlRatio = union > 0 ? shared / union : 0;

  const byItem: Phase1bItemQualityRow[] = [
    ...rowsToByItem(supplement.section7, "7"),
    ...rowsToByItem(supplement.section8, "8"),
    ...section10ToByItem(supplement.section10),
  ];

  return {
    stockCode: supplement.stockCode,
    section7,
    section8,
    crossSectionSharedUrlRatio,
    byItem,
    evaluatedAt: new Date().toISOString(),
  };
}

/** 环境变量硬门槛（默认关闭：值为空或非有限数时不生效）。 */
export function evaluatePhase1bEvidenceHardGates(metrics: Phase1bEvidenceQualityMetrics): {
  passed: boolean;
  violations: string[];
} {
  const minS8Topic = Number(process.env.PHASE1B_GATE_S8_TOPIC_HIT_MIN ?? "");
  const maxS8Dup = Number(process.env.PHASE1B_GATE_S8_DUP_MAX ?? "");
  const violations: string[] = [];

  if (Number.isFinite(minS8Topic) && metrics.section8.topicHitRatio < minS8Topic) {
    violations.push(
      `section8.topicHitRatio=${metrics.section8.topicHitRatio.toFixed(3)} < PHASE1B_GATE_S8_TOPIC_HIT_MIN=${minS8Topic}`,
    );
  }
  if (Number.isFinite(maxS8Dup) && metrics.section8.crossItemDuplicateUrlRatio > maxS8Dup) {
    violations.push(
      `section8.crossItemDuplicateUrlRatio=${metrics.section8.crossItemDuplicateUrlRatio.toFixed(3)} > PHASE1B_GATE_S8_DUP_MAX=${maxS8Dup}`,
    );
  }

  return { passed: violations.length === 0, violations };
}
