import type { AnalysisReport } from "@trade-signal/schema-core";

import { parseDataPackMarket } from "./market-pack-parser.js";
import { parseDataPackReport } from "./report-pack-parser.js";
import { runPhase3ValuationEngine } from "./valuation-engine.js";
import { runFactor1A, runFactor1B } from "./factors/factor1.js";
import { runFactor2 } from "./factors/factor2.js";
import { runFactor3 } from "./factors/factor3.js";
import { runFactor4 } from "./factors/factor4.js";
import { applyInterimNormalization } from "./factors/step15-normalize.js";
import type {
  Confidence,
  Phase3Decision,
  Phase3ExecutionResult,
  Phase3Context,
} from "./types.js";

export interface RunPhase3StrictInput {
  marketMarkdown: string;
  reportMarkdown?: string;
  interimReportMarkdown?: string;
}

function appendCheckpoint(ctx: Phase3Context, text: string): void {
  ctx.checkpoints.push(text);
}

function validateCriticalData(ctx: Phase3Context): void {
  const latest = ctx.marketPack.financials[0];
  if (!latest) throw new Error("Step1 failed: 无财务年度数据");
  if (latest.netProfit === undefined || latest.ocf === undefined || latest.capex === undefined) {
    throw new Error("Step1 failed: 关键字段缺失（净利润/OCF/Capex）");
  }
}

function decisionFromFactor4(position: string, passed: boolean): Phase3Decision {
  if (!passed || position === "排除") return "avoid";
  if (position.includes("标准")) return "buy";
  return "watch";
}

function confidenceFromContext(ctx: Phase3Context, trust?: "high" | "medium" | "low"): Confidence {
  const highWarnings = ctx.marketPack.warnings.filter((w) => w.level === "high").length;
  const dataComplete = Boolean(ctx.marketPack.financials[0]?.netProfit !== undefined && ctx.marketPack.financials[0]?.ocf !== undefined);
  const a = dataComplete ? "high" : "low";
  const b = trust ?? "medium";
  const c: Confidence = highWarnings >= 2 ? "low" : highWarnings === 1 ? "medium" : "high";
  const votes = [a, b, c];
  const lows = votes.filter((v) => v === "low").length;
  const highs = votes.filter((v) => v === "high").length;
  if (lows >= 2) return "low";
  if (highs >= 2) return "high";
  return "medium";
}

function buildRejectReport(
  code: string,
  companyName: string | undefined,
  reason: string,
  checkpoints: string[],
  opts?: {
    thresholdCompare?: string;
    executedFactors?: string[];
    skippedFactors?: string[];
    humanReason?: string;
    formulaSummary?: string;
  },
): AnalysisReport {
  const label =
    companyName?.trim() && companyName.trim() !== code ? `${companyName.trim()}（${code}）` : code;
  const sections: AnalysisReport["sections"] = [
    { heading: "否决摘要（前置筛选结束）", content: reason },
  ];
  if (opts?.humanReason?.trim()) {
    sections.push({ heading: "前置筛选说明（人话）", content: opts.humanReason.trim() });
  }
  if (opts?.thresholdCompare?.trim()) {
    sections.push({ heading: "关键阈值对比", content: opts.thresholdCompare.trim() });
  }
  if (opts?.formulaSummary?.trim()) {
    sections.push({ heading: "计算口径说明（简版）", content: opts.formulaSummary.trim() });
  }
  if ((opts?.executedFactors?.length ?? 0) > 0 || (opts?.skippedFactors?.length ?? 0) > 0) {
    sections.push({
      heading: "执行范围",
      content: [
        `- 已执行：${opts?.executedFactors?.join("、") ?? "—"}`,
        `- 未执行：${opts?.skippedFactors?.join("、") ?? "—"}`,
      ].join("\n"),
    });
  }
  sections.push({ heading: "Checkpoint 轨迹", content: checkpoints.join("\n\n") || "(无)" });
  sections.push({
    heading: "证据与数据缺口 / 补救建议",
    content: [
      "- 主因定位：本次前置筛选结束触发于**因子2（穿透收益率不足）**，请优先复核 `R`、`rf`、`II` 与市值口径。",
      "- 核对 `data_pack_market.md`：财务口径（合并/母公司）、OCF/Capex/净利润等关键行是否可解析。",
      "- 若已进入 PDF 分支：查看 `data_pack_report.md` 顶部 **PDF 抽取缺陷摘要** 与 `phase3_preflight.md` 的 PDF 门禁提示。",
      "- Phase1B 外部证据：查看 `phase1b_evidence_quality.json`（§8 `topicHitRatio` / `crossItemDuplicateUrlRatio`）与 `phase1b_qualitative.json` 的 `retrievalDiagnostics`（宽召回 / AI 重排标记）。",
      "- 解决否决原因后使用同一 `--output-dir` 续跑或重新发起 workflow。",
    ].join("\n"),
  });
  return {
    meta: {
      code,
      schemaVersion: "v0.1-alpha",
      dataSource: "phase3-strict",
      generatedAt: new Date().toISOString(),
      capabilityFlags: [],
    },
    title: `龟龟投资策略 · 选股分析报告：${label}`,
    decision: "avoid",
    confidence: "medium",
    sections,
  };
}

export function runPhase3Strict(input: RunPhase3StrictInput): Phase3ExecutionResult {
  const ctx: Phase3Context = {
    marketPack: parseDataPackMarket(input.marketMarkdown),
    reportPack: parseDataPackReport(input.reportMarkdown),
    interimReportPack: parseDataPackReport(input.interimReportMarkdown),
    checkpoints: [],
  };

  // Step1: read and validate
  validateCriticalData(ctx);
  appendCheckpoint(ctx, "Step1: 已完成 data_pack 读取与关键字段校验。");

  // Step1.5
  const normNotes = applyInterimNormalization(ctx.marketPack);
  if (normNotes.length > 0) appendCheckpoint(ctx, `Step1.5: ${normNotes.join(" ")}`);

  // Factor1A
  const f1a = runFactor1A(ctx.marketPack);
  appendCheckpoint(ctx, `因子1A: ${f1a.passed ? "通过" : f1a.reason}`);
  if (!f1a.passed) {
    const report = buildRejectReport(
      ctx.marketPack.code,
      ctx.marketPack.name,
      f1a.reason ?? "因子1A否决",
      ctx.checkpoints,
    );
    return {
      valuation: {
        code: ctx.marketPack.code,
        generatedAt: new Date().toISOString(),
        methods: [],
      },
      report,
      decision: "avoid",
      confidence: "medium",
      reportMode: "reject",
      factor1A: f1a,
      methods: [],
    };
  }

  // Factor1B
  const f1b = runFactor1B(ctx.marketPack, ctx.reportPack);
  appendCheckpoint(ctx, `因子1B: ${f1b.passed ? "通过" : f1b.reason}`);
  if (!f1b.passed) {
    const report = buildRejectReport(
      ctx.marketPack.code,
      ctx.marketPack.name,
      f1b.reason ?? "因子1B否决",
      ctx.checkpoints,
    );
    return {
      valuation: {
        code: ctx.marketPack.code,
        generatedAt: new Date().toISOString(),
        methods: [],
      },
      report,
      decision: "avoid",
      confidence: "medium",
      reportMode: "reject",
      factor1A: f1a,
      factor1B: f1b,
      methods: [],
    };
  }

  // Factor2
  const f2 = runFactor2(ctx.marketPack, f1b);
  appendCheckpoint(ctx, `因子2: ${f2.passed ? "通过" : f2.reason}`);
  if (!f2.passed) {
    const factor2Reason =
      f2.rejectType === "S4"
        ? "因子2-S4（穿透收益率不足）｜研报结论：回报率显著低于门槛"
        : f2.reason ?? "因子2否决";
    const thresholdCompare =
      f2.R !== undefined && f2.II !== undefined
        ? [
            `- **粗算穿透回报率 R**：${f2.R.toFixed(2)}%`,
            `- **门槛 II**（max(3.5%, Rf+2%)）：${f2.II.toFixed(2)}%`,
            `- **Rf（无风险）**：${(ctx.marketPack.rf ?? 2.5).toFixed(2)}%（用于 R 与 Rf 比较）`,
            f2.rejectType ? `- **否决类型**：${f2.rejectType}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : undefined;
    const formulaSummary = [
      "- 穿透收益率口径：`R = I / 市值`。",
      "- 门槛口径：`II = max(3.5%, rf + 2%)`。",
      "- S4 触发条件：`R < rf` 或 `R < II*0.5`。",
    ].join("\n");
    const humanReason =
      f2.R !== undefined && f2.II !== undefined
        ? `这次不是程序异常，而是前置筛选结束。因为穿透收益率 R=${f2.R.toFixed(2)}% 明显低于门槛（II=${f2.II.toFixed(2)}%，且低于 Rf=${(ctx.marketPack.rf ?? 2.5).toFixed(2)}%），因此不再进入后续因子计算。`
        : "这次不是程序异常，而是前置筛选结束。主因是穿透收益率不足，未满足策略最低门槛。";
    const report = buildRejectReport(
      ctx.marketPack.code,
      ctx.marketPack.name,
      factor2Reason,
      ctx.checkpoints,
      {
        thresholdCompare,
        humanReason,
        formulaSummary,
        executedFactors: ["因子1A", "因子1B", "因子2"],
        skippedFactors: ["因子3", "因子4"],
      },
    );
    return {
      valuation: {
        code: ctx.marketPack.code,
        generatedAt: new Date().toISOString(),
        methods: [],
      },
      report,
      decision: "avoid",
      confidence: "medium",
      reportMode: "reject",
      factor1A: f1a,
      factor1B: f1b,
      factor2: f2,
      methods: [],
    };
  }

  // Factor3
  const f3 = runFactor3(ctx.marketPack, f1b, f2);
  appendCheckpoint(ctx, `因子3: ${f3.passed ? "通过" : f3.reason}`);
  if (!f3.passed) {
    const report = buildRejectReport(
      ctx.marketPack.code,
      ctx.marketPack.name,
      f3.reason ?? "因子3否决",
      ctx.checkpoints,
    );
    return {
      valuation: {
        code: ctx.marketPack.code,
        generatedAt: new Date().toISOString(),
        methods: [],
      },
      report,
      decision: "avoid",
      confidence: "medium",
      reportMode: "reject",
      factor1A: f1a,
      factor1B: f1b,
      factor2: f2,
      factor3: f3,
      methods: [],
    };
  }

  // Factor4
  const f4 = runFactor4(ctx.marketPack, f3);
  appendCheckpoint(ctx, `因子4: ${f4.passed ? "通过" : f4.reason}`);

  const valuation = runPhase3ValuationEngine({
    code: ctx.marketPack.code,
    name: ctx.marketPack.name,
    market: "CN_A",
    currency: "CNY",
    price: ctx.marketPack.price,
    marketCap: ctx.marketPack.marketCap,
    totalShares: ctx.marketPack.totalShares,
    riskFreeRate: ctx.marketPack.rf,
    financials: ctx.marketPack.financials.map((f) => ({
      year: f.year,
      revenue: f.revenue,
      netProfit: f.netProfit,
      operatingCashFlow: f.ocf,
      capex: f.capex,
      basicEps: f.basicEps,
      dividendPerShare: f.dps,
      minorityPnL: f.minorityPnL,
    })),
  });

  const decision = decisionFromFactor4(f4.position, f4.passed);
  const confidence = confidenceFromContext(ctx, f3.extrapolationTrust);
  const report: AnalysisReport = {
    meta: {
      code: ctx.marketPack.code,
      schemaVersion: "v0.1-alpha",
      dataSource: "phase3-strict",
      generatedAt: new Date().toISOString(),
      capabilityFlags: [],
    },
    title: `龟龟投资策略 · 选股分析报告：${ctx.marketPack.name ?? ctx.marketPack.code}（${ctx.marketPack.code}）`,
    decision,
    confidence,
    sections: [
      { heading: "Checkpoints", content: ctx.checkpoints.join("\n\n") },
    ],
  };

  return {
    valuation,
    report,
    decision,
    confidence,
    reportMode: "full",
    factor1A: f1a,
    factor1B: f1b,
    factor2: f2,
    factor3: f3,
    factor4: f4,
    methods: valuation.methods,
  };
}
