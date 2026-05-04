"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

import { MethodologyGuideLink } from "@/components/MethodologyGuideLink";
import { getRankingStrategyMeta, RANKING_STRATEGIES } from "@/lib/rankings/strategies";
import type { RankingItem, RankingsIndex, RankingList } from "@/lib/rankings/types";

dayjs.extend(utc);
dayjs.extend(timezone);

const REPORTS_TIMEZONE = process.env.NEXT_PUBLIC_REPORTS_TIMEZONE?.trim() || "local";

function resolveListTopN(list: RankingList): number {
  return typeof list.topN === "number" && Number.isFinite(list.topN) && list.topN > 0
    ? Math.floor(list.topN)
    : 200;
}

function formatIsoUtcText(value: string): string {
  const parsed = dayjs(value);
  if (!parsed.isValid()) return value;
  if (REPORTS_TIMEZONE === "Asia/Shanghai") {
    return `${parsed.tz("Asia/Shanghai").format("YYYY-MM-DD HH:mm:ss")} 北京时间`;
  }
  if (REPORTS_TIMEZONE !== "local") {
    return `${parsed.tz(REPORTS_TIMEZONE).format("YYYY-MM-DD HH:mm:ss")} ${REPORTS_TIMEZONE}`;
  }
  return parsed.format("YYYY-MM-DD HH:mm:ss");
}

function capabilityLabel(list: RankingList): string {
  const status = list.capabilityStatus;
  if (status === "ok" || status === undefined) return "字段完整";
  if (status === "degraded_tier2_fields") return "字段降级";
  if (status === "blocked_missing_required_fields") return "字段缺失";
  if (status === "hk_not_ready") return "市场待接入";
  return status;
}

function capabilityClass(list: RankingList): string {
  const status = list.capabilityStatus;
  if (status === "ok" || status === undefined) return "rh-status rh-status--complete";
  if (status === "degraded_tier2_fields") return "rh-status rh-status--degraded";
  return "rh-status rh-status--missing";
}

function renderCardMetrics(item: RankingItem): string[] {
  const entries = Object.entries(item.metrics).filter(([, value]) => value !== null && value !== undefined);
  return entries.slice(0, 3).map(([key, value]) => `${key}: ${typeof value === "number" ? value.toFixed(2) : String(value)}`);
}

export function RankingsClient({ data }: { data: RankingsIndex }) {
  const sp = useSearchParams();
  const strategyFilter = sp.get("strategy")?.trim() || data.defaultStrategyId || "turtle";
  const marketFilter = sp.get("market")?.trim() || "";

  const [keyword, setKeyword] = useState("");
  const trimmedKeyword = keyword.trim().toLowerCase();
  const matchesKeyword = (item: RankingItem) =>
    !trimmedKeyword
      || item.code.toLowerCase().includes(trimmedKeyword)
      || item.name.toLowerCase().includes(trimmedKeyword);

  const visibleStrategies = useMemo(() => {
    const ids = new Set<string>([...RANKING_STRATEGIES.map((item) => item.id), ...data.lists.map((list) => list.strategyId)]);
    return [...ids];
  }, [data.lists]);

  const filteredLists = useMemo(() => {
    return data.lists.filter((list) => {
      if (strategyFilter && list.strategyId !== strategyFilter) return false;
      if (marketFilter && list.market !== marketFilter) return false;
      return true;
    });
  }, [data.lists, marketFilter, strategyFilter]);

  const selectedStrategyMeta = getRankingStrategyMeta(strategyFilter);
  const markets = useMemo(() => [...new Set(data.lists.map((list) => list.market))].sort(), [data.lists]);

  return (
    <div className="rh-container rankings-root">
      <header className="rh-page-header">
        <h1 className="rh-page-title">策略榜单</h1>
        <p className="rh-page-desc">
          当前策略：{selectedStrategyMeta.label}。{selectedStrategyMeta.shortDescription}
        </p>
        {selectedStrategyMeta.methodologyHref ? (
          <p className="rh-page-desc">
            <MethodologyGuideLink from="rankings" hrefBase={selectedStrategyMeta.methodologyHref} />
          </p>
        ) : null}
        <p className="rh-page-meta">
          协议 {data.version} · 生成 {data.generatedAt ? formatIsoUtcText(data.generatedAt) : "—"} · 榜单 {data.listCount} ·
          策略 {data.strategyCount}
        </p>
      </header>

      <section className="rh-filter-row" aria-label="按策略筛选">
        <span className="rh-filter-label">策略</span>
        {visibleStrategies.map((strategyId) => {
          const meta = getRankingStrategyMeta(strategyId);
          const isActive = strategyFilter === strategyId;
          return (
            <Link
              key={strategyId}
              className={`rh-chip${isActive ? " rh-chip--active" : ""}`}
              href={`/rankings?strategy=${encodeURIComponent(strategyId)}`}
            >
              {meta.label}
            </Link>
          );
        })}
      </section>

      <section className="rh-filter-row" aria-label="按市场筛选">
        <span className="rh-filter-label">市场</span>
        <Link
          className={`rh-chip${!marketFilter ? " rh-chip--active" : ""}`}
          href={`/rankings?strategy=${encodeURIComponent(strategyFilter)}`}
        >
          全部
        </Link>
        {markets.map((market) => (
          <Link
            key={market}
            className={`rh-chip${marketFilter === market ? " rh-chip--active" : ""}`}
            href={`/rankings?strategy=${encodeURIComponent(strategyFilter)}&market=${encodeURIComponent(market)}`}
          >
            {market}
          </Link>
        ))}
      </section>

      <section className="rh-filter-row" aria-label="按代码或名称搜索">
        <span className="rh-filter-label">搜索</span>
        <input
          type="search"
          className="rh-search-input"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="输入代码或名称（如 600519 / 贵州茅台）"
          aria-label="按代码或名称搜索榜单条目"
        />
      </section>

      {filteredLists.length === 0 ? (
        <div className="rh-empty" role="status">
          {data.listCount === 0 ? "暂无榜单数据。可先运行 screener 并执行 reports-site:emit / sync。" : "没有符合当前筛选条件的榜单。"}
        </div>
      ) : (
        filteredLists.map((list) => {
          const strategyMeta = getRankingStrategyMeta(list.strategyId);
          const columns = strategyMeta.columns.length > 0 ? strategyMeta.columns : selectedStrategyMeta.columns;
          const topN = resolveListTopN(list);
          const slicedItems = list.items.length > topN ? list.items.slice(0, topN) : list.items;
          const visibleItems = trimmedKeyword ? slicedItems.filter(matchesKeyword) : slicedItems;
          const hasKeywordMiss = trimmedKeyword.length > 0 && visibleItems.length === 0;
          return (
            <section key={list.listId} className="rh-ranking-block">
              <div className="rh-ranking-header">
                <div>
                  <h2 className="rh-ranking-title">
                    {strategyMeta.label} · {list.market} · {list.mode}
                  </h2>
                  <p className="rh-page-desc">
                    更新时间 {formatIsoUtcText(list.generatedAt)} ·
                    {trimmedKeyword
                      ? ` 命中 ${visibleItems.length} / Top ${topN}`
                      : ` 展示 ${visibleItems.length} / Top ${topN}`}
                    {typeof list.totalCandidates === "number" && list.totalCandidates > slicedItems.length
                      ? ` · 候选总数 ${list.totalCandidates}`
                      : null}
                  </p>
                </div>
                <div className="rh-card-meta">
                  <span className="rh-pill">{strategyMeta.label}</span>
                  <span className="rh-pill rh-pill--mono">{list.market}</span>
                  <span className="rh-pill rh-pill--mono">{list.mode}</span>
                  <span className={capabilityClass(list)}>{capabilityLabel(list)}</span>
                </div>
              </div>

              {hasKeywordMiss ? (
                <div className="rh-empty" role="status">
                  关键字「{keyword.trim()}」未命中本榜单 Top {topN}。
                </div>
              ) : (
                <>
                  <div className="rh-ranking-table-wrap">
                    <table className="rh-ranking-table">
                      <thead>
                        <tr>
                          {columns.map((column) => (
                            <th key={column.key}>{column.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleItems.map((item) => (
                          <tr key={`${list.listId}-${item.code}`}>
                            {columns.map((column) => {
                              let text = column.render(item);
                              if (column.key === "decision") text = strategyMeta.decisionLabel(item.decision);
                              if (column.key === "security") {
                                return (
                                  <td key={column.key}>
                                    {item.href ? (
                                      <Link className="rh-card-title" href={item.href}>
                                        {text}
                                      </Link>
                                    ) : (
                                      text
                                    )}
                                  </td>
                                );
                              }
                              return <td key={column.key}>{text}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rh-ranking-cards">
                    {visibleItems.map((item) => (
                      <article key={`${list.listId}-card-${item.code}`} className="rh-card">
                        <div className="rh-ranking-card-top">
                          <span className="rh-pill rh-pill--mono">#{item.rank}</span>
                          <span className="rh-pill">{strategyMeta.decisionLabel(item.decision)}</span>
                          <span>分数 {item.score.toFixed(4)}</span>
                        </div>
                        {item.href ? (
                          <Link className="rh-card-title" href={item.href}>
                            {item.name}（{item.code}）
                          </Link>
                        ) : (
                          <div className="rh-card-title">
                            {item.name}（{item.code}）
                          </div>
                        )}
                        <div className="rh-card-meta">
                          <span>{item.industry?.trim() || "行业未披露"}</span>
                          <span>置信度 {item.confidence}</span>
                        </div>
                        <div className="rh-card-meta">
                          {renderCardMetrics(item).map((line) => (
                            <span key={`${item.code}-${line}`}>{line}</span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
