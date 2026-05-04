import Link from "next/link";

import {
  METHODOLOGY_GUIDE_LINK_LABEL,
  METHODOLOGY_PILL_SHORT_LABEL,
  type MethodologyFromSource,
  methodologyHrefWithSource,
} from "@/lib/methodology-nav";

const DEFAULT_HREF_BASE = "/reports/methodology";

export type MethodologyGuideLinkProps = {
  from: MethodologyFromSource;
  /** 默认 `/reports/methodology`；策略若将来有独立说明页可传入 `methodologyHref` */
  hrefBase?: string;
  /** `inline`：正文内高亮链；`pill`：详情页元信息条紧凑样式 */
  variant?: "inline" | "pill";
  className?: string;
};

/**
 * 指向方法论说明页的统一入口：文案、高亮样式、`?from=` 分流与顶栏「返回」一致。
 */
export function MethodologyGuideLink({
  from,
  hrefBase = DEFAULT_HREF_BASE,
  variant = "inline",
  className,
}: MethodologyGuideLinkProps) {
  const href = methodologyHrefWithSource(hrefBase, from);
  const merged = [className].filter(Boolean).join(" ");

  if (variant === "pill") {
    return (
      <Link
        className={["rh-pill rh-methodology-pill", merged].filter(Boolean).join(" ")}
        href={href}
        title={METHODOLOGY_GUIDE_LINK_LABEL}
      >
        {METHODOLOGY_PILL_SHORT_LABEL}
      </Link>
    );
  }

  return (
    <Link className={["rh-inline-link", merged].filter(Boolean).join(" ")} href={href}>
      {METHODOLOGY_GUIDE_LINK_LABEL}
    </Link>
  );
}
