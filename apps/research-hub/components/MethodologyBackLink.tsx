"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import type { MethodologyFromSource } from "@/lib/methodology-nav";

function resolveFrom(raw: string | null): MethodologyFromSource {
  return raw === "rankings" ? "rankings" : "reports";
}

function MethodologyBackLinkInner() {
  const sp = useSearchParams();
  const from = resolveFrom(sp.get("from"));
  if (from === "rankings") {
    return (
      <Link className="rh-back-link" href="/rankings">
        ← 策略榜单
      </Link>
    );
  }
  return (
    <Link className="rh-back-link" href="/reports">
      ← 研报中心
    </Link>
  );
}

/**
 * 静态导出下方法论页需客户端读取 `?from=`，否则从榜单进入时「返回」会错误指向研报列表。
 */
export function MethodologyBackLink() {
  return (
    <Suspense
      fallback={
        <Link className="rh-back-link" href="/reports">
          ← 研报中心
        </Link>
      }
    >
      <MethodologyBackLinkInner />
    </Suspense>
  );
}
