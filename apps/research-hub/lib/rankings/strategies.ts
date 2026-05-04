import type { RankingItem, RankingMetricMap, RankingMetricValue } from "./types";

export type RankingStrategyMeta = {
  id: string;
  label: string;
  shortDescription: string;
  methodologyHref?: string;
  columns: Array<{
    key: string;
    label: string;
    render: (item: RankingItem) => string;
  }>;
  decisionLabel: (decision: string) => string;
};

function formatMetricNumber(value: RankingMetricValue, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function metric(metrics: RankingMetricMap, key: string): RankingMetricValue {
  return Object.prototype.hasOwnProperty.call(metrics, key) ? metrics[key] : null;
}

function titleCaseDecision(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) return "未定义";
  return value.replace(/_/g, " ");
}

export const RANKING_STRATEGIES: RankingStrategyMeta[] = [
  {
    id: "turtle",
    label: "龟龟策略",
    shortDescription: "以 ROE、FCF 收益率、穿透回报率与估值因子做综合排序。",
    methodologyHref: "/reports/methodology",
    decisionLabel(decision) {
      if (decision === "buy") return "候选";
      if (decision === "watch") return "观察";
      if (decision === "avoid") return "回避";
      return titleCaseDecision(decision);
    },
    columns: [
      { key: "rank", label: "排名", render: (item) => String(item.rank) },
      { key: "security", label: "代码 / 名称", render: (item) => `${item.code} ${item.name}` },
      { key: "industry", label: "行业", render: (item) => item.industry?.trim() || "—" },
      { key: "decision", label: "策略结论", render: (item) => (item.decision ? item.decision : "—") },
      { key: "score", label: "综合分", render: (item) => item.score.toFixed(4) },
      { key: "roe", label: "ROE", render: (item) => formatMetricNumber(metric(item.metrics, "roe")) },
      { key: "fcfYield", label: "FCF Yield", render: (item) => formatMetricNumber(metric(item.metrics, "fcfYield")) },
      {
        key: "penetrationR",
        label: "穿透 R",
        render: (item) => formatMetricNumber(metric(item.metrics, "penetrationR")),
      },
    ],
  },
  {
    id: "high_dividend",
    label: "高股息策略",
    shortDescription: "后续可接入股息率、分红稳定性与覆盖率等指标；当前仅预留策略入口。",
    decisionLabel: titleCaseDecision,
    columns: [],
  },
  {
    id: "breakout",
    label: "突破策略",
    shortDescription: "后续可接入突破位、放量与回撤控制等指标；当前仅预留策略入口。",
    decisionLabel: titleCaseDecision,
    columns: [],
  },
];

const STRATEGY_META_MAP = new Map(RANKING_STRATEGIES.map((item) => [item.id, item]));

export function getRankingStrategyMeta(strategyId: string): RankingStrategyMeta {
  return (
    STRATEGY_META_MAP.get(strategyId) ?? {
      id: strategyId,
      label: strategyId,
      shortDescription: "该策略尚未配置专属展示器，当前按通用榜单方式展示。",
      decisionLabel: titleCaseDecision,
      columns: [
        { key: "rank", label: "排名", render: (item) => String(item.rank) },
        { key: "security", label: "代码 / 名称", render: (item) => `${item.code} ${item.name}` },
        { key: "industry", label: "行业", render: (item) => item.industry?.trim() || "—" },
        { key: "decision", label: "策略结论", render: (item) => titleCaseDecision(item.decision) },
        { key: "score", label: "综合分", render: (item) => item.score.toFixed(4) },
      ],
    }
  );
}
