/** 方法论页 `?from=` 取值（白名单，避免开放重定向） */
export type MethodologyFromSource = "rankings" | "reports";

const METHODOLOGY_PATH = "/reports/methodology";

/** 与 `/reports/methodology` 页 `h1` 一致，供各入口复用 */
export const METHODOLOGY_PAGE_TITLE = "穿透收益率与前置筛选说明" as const;

/** 研报中心 / 策略榜单等正文内统一入口文案 */
export const METHODOLOGY_GUIDE_LINK_LABEL = `查看：${METHODOLOGY_PAGE_TITLE}` as const;

/** 报告详情元信息条等窄位：短标签，`title` 用完整 `METHODOLOGY_GUIDE_LINK_LABEL` */
export const METHODOLOGY_PILL_SHORT_LABEL = "方法说明" as const;

/**
 * 生成带来源标记的方法论页链接，供 `/reports/methodology` 顶栏「返回」按来源分流。
 */
export function methodologyHrefWithSource(base: string, source: MethodologyFromSource): string {
  const u = new URL(base, "http://local.invalid");
  u.searchParams.set("from", source);
  return `${u.pathname}${u.search}`;
}

/** 研报列表等入口：固定路径 + from=reports */
export function methodologyHrefFromReports(): string {
  return `${METHODOLOGY_PATH}?from=reports`;
}
