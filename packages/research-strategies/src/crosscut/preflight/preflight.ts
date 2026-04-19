import type { DataPackMarket } from "@trade-signal/schema-core";

import { strictPreflightPhase1AFailed } from "./strict-mode-message.js";

export type PreflightLevel = "off" | "strict";

export interface PreflightPhase1AInput {
  dataPack: DataPackMarket;
  marketPackMarkdown: string;
  level: PreflightLevel;
}

/**
 * Phase1A 结束后的门禁：严格模式下关键行情/财报字段缺失时 fail-fast，避免 silent 占位进入 Phase3。
 */
export function runPreflightAfterPhase1A(input: PreflightPhase1AInput): void {
  if (input.level !== "strict") return;

  const { dataPack, marketPackMarkdown } = input;
  const failures: string[] = [];

  if (!dataPack.financialSnapshot) {
    failures.push("缺少 financialSnapshot");
  } else {
    const fin = dataPack.financialSnapshot;
    if (!fin.totalAssets || fin.totalAssets <= 0) {
      failures.push("financialSnapshot.totalAssets 无效（<=0 或缺失）");
    }
    const hasCoreMetric =
      (fin.revenue !== undefined && fin.revenue !== null && Number.isFinite(fin.revenue)) ||
      (fin.netProfit !== undefined && fin.netProfit !== null && Number.isFinite(fin.netProfit)) ||
      (fin.operatingCashFlow !== undefined &&
        fin.operatingCashFlow !== null &&
        Number.isFinite(fin.operatingCashFlow));
    if (!hasCoreMetric) {
      failures.push("financialSnapshot 缺少可解析的核心损益/现金流字段（revenue/netProfit/ocf）");
    }
  }

  const price = dataPack.quote?.price;
  if (price === undefined || price === null || !Number.isFinite(price) || price <= 0) {
    failures.push("quote.price 无效（<=0 或非有限数）");
  }

  if (!marketPackMarkdown.includes("## §13 Warnings")) {
    failures.push("data_pack_market.md 缺少「## §13 Warnings」章节（契约对齐失败）");
  }

  const estimateTags = marketPackMarkdown.match(/\[估算\|/g)?.length ?? 0;
  const maxEstRaw = process.env.PHASE1A_PREFLIGHT_MAX_ESTIMATE_TAGS?.trim();
  const maxEst = maxEstRaw ? Number(maxEstRaw) : 6;
  if (Number.isFinite(maxEst) && estimateTags > maxEst) {
    failures.push(
      `市场包中 [估算| 类警告过多（${estimateTags} > ${maxEst}）；请改进 feed 字段或调整 PHASE1A_PREFLIGHT_MAX_ESTIMATE_TAGS`,
    );
  }

  if (failures.length > 0) {
    const fin = dataPack.financialSnapshot;
    const ctx = [
      `quote.price=${JSON.stringify(price)}`,
      `quote.timestamp=${JSON.stringify(dataPack.quote?.timestamp)}`,
      fin
        ? `financial.period=${JSON.stringify(fin.period)}; totalAssets=${JSON.stringify(fin.totalAssets)}`
        : "financialSnapshot=missing",
    ].join("；");
    throw new Error(strictPreflightPhase1AFailed(`${failures.join("；")}（${ctx}）`));
  }
}
