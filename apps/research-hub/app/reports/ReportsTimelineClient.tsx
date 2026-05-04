"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

import { MethodologyGuideLink } from "@/components/MethodologyGuideLink";
import { TOPIC_LABEL_ZH, TOPIC_TYPES, type ReportTopicType } from "@/lib/reports/topic-labels";

dayjs.extend(utc);
dayjs.extend(timezone);

const REPORTS_TIMEZONE = process.env.NEXT_PUBLIC_REPORTS_TIMEZONE?.trim() || "local";

export type TimelineItem = {
  entryId: string;
  displayTitle: string;
  topicType: ReportTopicType;
  code: string;
  publishedAt: string;
  href: string;
  requiredFieldsStatus: "complete" | "degraded" | "missing";
  confidenceState: "high" | "medium" | "low" | "unknown";
};

function statusBadge(s: TimelineItem["requiredFieldsStatus"]): string {
  if (s === "complete") return "完整";
  if (s === "degraded") return "降级";
  return "缺失";
}

function statusClass(s: TimelineItem["requiredFieldsStatus"]): string {
  if (s === "complete") return "rh-status rh-status--complete";
  if (s === "degraded") return "rh-status rh-status--degraded";
  return "rh-status rh-status--missing";
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

export function ReportsTimelineClient({
  items,
  indexMeta,
}: {
  items: TimelineItem[];
  indexMeta: { version: string; generatedAt: string; entryCount: number } | null;
}) {
  const sp = useSearchParams();
  const topicFilter = sp.get("topic") as ReportTopicType | null;
  const codeFilter = sp.get("code")?.trim() ?? "";

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (topicFilter && TOPIC_TYPES.includes(topicFilter) && it.topicType !== topicFilter) return false;
      if (codeFilter && it.code !== codeFilter) return false;
      return true;
    });
  }, [items, topicFilter, codeFilter]);

  const codes = useMemo(() => [...new Set(items.map((i) => i.code))].sort(), [items]);

  return (
    <div className="rh-container reports-root">
      <header className="rh-page-header">
        <h1 className="rh-page-title">报告中心</h1>
        <p className="rh-page-desc">按发布时间浏览报告，并可用专题、股票代码筛选。</p>
        <p className="rh-page-desc">
          <MethodologyGuideLink from="reports" />
        </p>
        {indexMeta ? (
          <p className="rh-page-meta">
            索引 {indexMeta.version} · 生成 {formatIsoUtcText(indexMeta.generatedAt)} · 条目 {indexMeta.entryCount}
          </p>
        ) : null}
      </header>

      <section className="rh-filter-row" aria-label="按专题筛选">
        <span className="rh-filter-label">专题</span>
        <Link className={`rh-chip${!topicFilter ? " rh-chip--active" : ""}`} href="/reports">
          全部
        </Link>
        {TOPIC_TYPES.map((t) => (
          <Link
            key={t}
            className={`rh-chip${topicFilter === t ? " rh-chip--active" : ""}`}
            href={`/reports?topic=${encodeURIComponent(t)}`}
          >
            {TOPIC_LABEL_ZH[t]}
          </Link>
        ))}
      </section>

      <section className="rh-filter-row" aria-label="按代码筛选">
        <span className="rh-filter-label">代码</span>
        <Link
          className={`rh-chip${!codeFilter ? " rh-chip--active" : ""}`}
          href={topicFilter ? `/reports?topic=${encodeURIComponent(topicFilter)}` : "/reports"}
        >
          全部
        </Link>
        {codes.map((c) => (
          <Link
            key={c}
            className={`rh-chip${codeFilter === c ? " rh-chip--active" : ""}`}
            href={`/reports?code=${encodeURIComponent(c)}${topicFilter ? `&topic=${encodeURIComponent(topicFilter)}` : ""}`}
          >
            {c}
          </Link>
        ))}
      </section>

      {filtered.length === 0 ? (
        <div className="rh-empty" role="status">
          {items.length === 0 ? (
            <>暂无报告。</>
          ) : (
            <>没有符合当前筛选条件的条目。可点击「全部」或调整筛选。</>
          )}
        </div>
      ) : (
        <ul className="rh-card-list">
          {filtered.map((it) => (
            <li key={it.entryId} className="rh-card">
              <Link className="rh-card-title" href={it.href.replace(/\/$/, "")}>
                {it.displayTitle}
              </Link>
              <div className="rh-card-meta">
                <span title={it.publishedAt}>{formatIsoUtcText(it.publishedAt)}</span>
                <span className="rh-pill">{TOPIC_LABEL_ZH[it.topicType]}</span>
                <span>置信度 {it.confidenceState}</span>
                <span className={statusClass(it.requiredFieldsStatus)}>字段 {statusBadge(it.requiredFieldsStatus)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
