import type { DataPackMarket, FinancialSnapshot } from "@trade-signal/schema-core";

import { normalizeCodeForFeed } from "../../crosscut/normalization/normalize-stock-code.js";

function safeNum(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function yearFromPeriod(period?: string): string {
  const matched = period?.match(/20\d{2}/)?.[0];
  return matched ?? String(new Date().getFullYear() - 1);
}

/** 生成最近 5 个财报年度列（仅作无历史时的回退） */
function recentFiveYears(anchorYear: string): string[] {
  const y = Number(anchorYear);
  if (!Number.isFinite(y)) return [anchorYear];
  return [0, 1, 2, 3, 4].map((d) => String(y - d));
}

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits);
}

function snapshotYearLabel(s: FinancialSnapshot): string {
  return yearFromPeriod(s.period);
}

/**
 * 将 `financialHistory` 转为按年度降序、最多 5 年的列定义；不足时与 `financialSnapshot` 合并。
 */
function resolveYearColumns(
  fin: FinancialSnapshot | undefined,
  history: FinancialSnapshot[] | undefined,
): { years: string[]; byYear: Map<string, FinancialSnapshot>; replicatedFallback: boolean } {
  const merged = normalizeFinancialHistoryLocal(
    [...(history ?? []), ...(fin ? [fin] : [])].filter(Boolean),
  );
  const byYear = new Map<string, FinancialSnapshot>();
  for (const s of merged) {
    const y = snapshotYearLabel(s);
    if (!/^20\d{2}$/.test(y)) continue;
    if (!byYear.has(y)) byYear.set(y, s);
  }
  const distinctYears = [...byYear.keys()].sort((a, b) => b.localeCompare(a));
  if (distinctYears.length >= 2) {
    const years = distinctYears.slice(0, 5);
    return { years, byYear, replicatedFallback: false };
  }
  const anchor = yearFromPeriod(fin?.period);
  const years = recentFiveYears(anchor);
  const single = fin ?? merged[0];
  const fill = new Map<string, FinancialSnapshot>();
  if (single) for (const y of years) fill.set(y, single);
  return { years, byYear: fill, replicatedFallback: true };
}

function normalizeFinancialHistoryLocal(rows: FinancialSnapshot[]): FinancialSnapshot[] {
  const byYear = new Map<string, FinancialSnapshot>();
  for (const row of rows) {
    const y = snapshotYearLabel(row);
    if (!/^20\d{2}$/.test(y)) continue;
    const existing = byYear.get(y);
    if (!existing) {
      byYear.set(y, row);
      continue;
    }
    const score = (s: FinancialSnapshot) =>
      [s.revenue, s.netProfit, s.totalAssets].filter((v) => v != null && Number.isFinite(v)).length;
    if (score(row) > score(existing)) byYear.set(y, row);
  }
  return [...byYear.values()].sort((a, b) => snapshotYearLabel(b).localeCompare(snapshotYearLabel(a)));
}

function buildSection17Derived(
  years: string[],
  byYear: Map<string, FinancialSnapshot>,
): string[] {
  const rows: string[] = [
    "## §17 衍生指标（预计算，供因子/Phase3 引用）",
    "",
    "> 本节由编排层根据 §3~§5 同源数值 **确定性计算**；若某年为单期回退复制，与 §13 警告一致。",
    "> **数据血缘**：Capex / 有息负债 / 货币资金若上游缺失，与本节及 §4、§5 表内同行使用 **相同兜底公式**；详见 §13 中带 `规则=` 的条目。",
    "> **FCF** = 经营活动现金流 OCF − |资本开支 Capex|（百万元）。",
    "",
    "| 年度 | FCF | 净利率(%) | DPS/EPS(%) | 资产负债率(%) | 有息负债/总资产(%) |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const y of years) {
    const s = byYear.get(y);
    if (!s) continue;
    const rev = safeNum(s.revenue, 0);
    const net = safeNum(s.netProfit, 0);
    const ocf = safeNum(s.operatingCashFlow, net);
    const capex =
      s.capitalExpenditure !== undefined && s.capitalExpenditure !== null
        ? safeNum(s.capitalExpenditure, 0)
        : Math.max(0, Math.round(Math.abs(ocf) * 0.2));
    const fcf = ocf - Math.abs(capex);
    const npm = rev > 0 ? (net / rev) * 100 : 0;
    const eps = safeNum(s.earningsPerShare, 0);
    const dps = safeNum(s.dividendsPerShare, 0);
    const payout = eps > 0 ? (dps / eps) * 100 : 0;
    const ta = safeNum(s.totalAssets, 0);
    const tl = safeNum(s.totalLiabilities, 0);
    const debt = safeNum(s.interestBearingDebt, ta > 0 && tl >= 0 ? tl * 0.4 : 0);
    const lev = ta > 0 ? (tl / ta) * 100 : 0;
    const debtToA = ta > 0 ? (debt / ta) * 100 : 0;
    rows.push(
      `| ${y} | ${fmt(fcf)} | ${fmt(npm)} | ${fmt(payout)} | ${fmt(lev)} | ${fmt(debtToA)} |`,
    );
  }
  rows.push("");
  return rows;
}

/**
 * 由 Phase1A 数据包生成 A股 `data_pack_market.md`（§1~§17 + 多年财务表 + §3P/§4P + §17 + §13 Warnings）
 */
export function buildMarketPackMarkdown(code: string, dataPack: DataPackMarket): string {
  const instrument = dataPack.instrument;
  const quote = dataPack.quote;
  const fin = dataPack.financialSnapshot;
  const reportYear = yearFromPeriod(fin?.period);
  const { years, byYear, replicatedFallback } = resolveYearColumns(fin, dataPack.financialHistory);
  const norm = normalizeCodeForFeed(code);

  const latest = fin ?? [...byYear.values()].sort((a, b) => snapshotYearLabel(b).localeCompare(snapshotYearLabel(a)))[0];
  if (!latest) {
    throw new Error("buildMarketPackMarkdown: 缺少 financialSnapshot / financialHistory，无法生成市场包");
  }

  const parentMetric = (
    y: string,
    key: "parentRevenue" | "parentNetProfit" | "parentOperatingCashFlow" | "parentTotalAssets" | "parentTotalLiabilities",
  ): number => {
    const row = byYear.get(y) ?? latest;
    const v = row[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const fb = latest[key];
    return typeof fb === "number" && Number.isFinite(fb) ? fb : 0;
  };

  const pick = (y: string, field: keyof FinancialSnapshot): number => {
    const s = byYear.get(y) ?? latest;
    const v = s[field];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };

  const revenue = (y: string) => pick(y, "revenue");
  const netProfit = (y: string) => pick(y, "netProfit");
  const ocf = (y: string) => {
    const s = byYear.get(y) ?? latest;
    const v = s.operatingCashFlow;
    if (v !== undefined && v !== null && Number.isFinite(v)) return v;
    return safeNum(s.netProfit, 0);
  };
  const capexFor = (y: string) => {
    const s = byYear.get(y) ?? latest;
    if (s.capitalExpenditure !== undefined && s.capitalExpenditure !== null) {
      return safeNum(s.capitalExpenditure, 0);
    }
    return Math.max(0, Math.round(Math.abs(ocf(y)) * 0.2));
  };

  const totalAssets = (y: string) => pick(y, "totalAssets");
  const totalLiabilities = (y: string) => pick(y, "totalLiabilities");
  const interestBearingDebtFor = (y: string) => {
    const s = byYear.get(y) ?? latest;
    if (s.interestBearingDebt !== undefined && s.interestBearingDebt !== null) {
      return safeNum(s.interestBearingDebt, 0);
    }
    const ta = safeNum(s.totalAssets, 0);
    const tl = safeNum(s.totalLiabilities, 0);
    return ta > 0 && tl >= 0 ? tl * 0.4 : 0;
  };
  const cashFor = (y: string) => {
    const s = byYear.get(y) ?? latest;
    if (s.cashAndEquivalents !== undefined && s.cashAndEquivalents !== null) {
      return safeNum(s.cashAndEquivalents, 0);
    }
    const ta = safeNum(s.totalAssets, 0);
    const tl = safeNum(s.totalLiabilities, 0);
    return ta > 0 && tl >= 0 ? ta * 0.1 : 0;
  };
  const minorityPnL = (y: string) => pick(y, "minorityInterestPnL");

  const marketCapBaiWan =
    fin?.marketCapBaiWan !== undefined && fin.marketCapBaiWan !== null
      ? safeNum(fin.marketCapBaiWan, 0)
      : 0;

  const totalSharesMm =
    fin?.totalSharesOutstandingMm !== undefined && fin.totalSharesOutstandingMm !== null
      ? safeNum(fin.totalSharesOutstandingMm, 0)
      : quote.price > 0 && marketCapBaiWan > 0
        ? marketCapBaiWan / quote.price
        : 0;

  const marketCapResolved =
    marketCapBaiWan > 0
      ? marketCapBaiWan
      : quote.price > 0 && totalSharesMm > 0
        ? quote.price * totalSharesMm
        : 0;

  const basicEpsFor = (y: string) => {
    const s = byYear.get(y) ?? latest;
    if (s.earningsPerShare !== undefined && s.earningsPerShare !== null) {
      return safeNum(s.earningsPerShare, 0);
    }
    const np = safeNum(s.netProfit, 0);
    return totalSharesMm > 0 ? np / totalSharesMm : 0;
  };

  const div0 = dataPack.corporateActions?.find((a) => a.cashDividendPerShare != null);
  const dpsFor = (y: string) => {
    const s = byYear.get(y) ?? latest;
    if (s.dividendsPerShare !== undefined && s.dividendsPerShare !== null) {
      return safeNum(s.dividendsPerShare, 0);
    }
    return safeNum(div0?.cashDividendPerShare, 0);
  };

  const rfEnv = process.env.PHASE1A_RF_RATE?.trim() || process.env.MARKET_PACK_RF_RATE?.trim();
  const rfParsed = rfEnv ? Number(rfEnv) : Number.NaN;
  const rf = Number.isFinite(rfParsed) ? rfParsed : 2.5;

  const riskLines: string[] = [];
  const warnLines: string[] = [];

  if (!fin?.totalAssets || fin.totalAssets <= 0) {
    riskLines.push(
      `- [数据完整性|中] Phase1A 财务快照缺少有效总资产，资产负债表相关科目可能为编排层占位推算。`,
    );
    warnLines.push(`- [数据完整性|中] 总资产缺失或无效，市值/杠杆相关推算可信度低。`);
  }
  if (!dataPack.corporateActions?.length && dpsFor(years[0] ?? reportYear) === 0) {
    riskLines.push(`- [数据完整性|低] 未返回企业行动记录，每股分红 DPS 可能为 0。`);
  }
  if (fin?.capitalExpenditure === undefined || fin.capitalExpenditure === null) {
    riskLines.push(
      `- [数据完整性|中] Phase1A 未提供 Capex，按 OCF×20% 估算（${fmt(capexFor(years[0] ?? reportYear))}，最近年）；规则=capex_ocf_20pct。`,
    );
    warnLines.push(`- [估算|中|规则=capex_ocf_20pct] Capex 由 OCF×20% 估算，非现金流量表直接值。`);
  }
  if (fin?.interestBearingDebt === undefined || fin.interestBearingDebt === null) {
    if (safeNum(fin?.totalAssets, 0) > 0) {
      warnLines.push(
        `- [估算|中|规则=interest_bearing_debt_tl_0_4] 有息负债按 总负债×0.4 估算，非附注直接值。`,
      );
    }
  }
  if (fin?.cashAndEquivalents === undefined || fin.cashAndEquivalents === null) {
    if (safeNum(fin?.totalAssets, 0) > 0) {
      warnLines.push(`- [估算|中|规则=cash_and_equiv_ta_0_1] 货币资金按 总资产×0.1 估算，非资产负债表直接值。`);
    }
  }
  if (replicatedFallback) {
    warnLines.push(
      `- [数据完整性|中] 多年财务列为单期快照外推复制（${years[years.length - 1]}~${years[0]}），仅用于因子多年序列回退；已尝试 financialHistory 仍不足 2 个独立财年。`,
    );
  } else if ((dataPack.financialHistory?.length ?? 0) >= 2) {
    warnLines.push(
      `- [数据完整性|低] 多年列优先使用 Phase1A financialHistory（${years.length} 个财年）；仍请核对 feed 报告期与合并口径。`,
    );
  }
  if (marketCapResolved <= 0 || totalSharesMm <= 0) {
    warnLines.push(`- [数据完整性|中] 市值或总股本无法可靠推导，请检查行情或财务接口是否返回市值/股本字段。`);
  }

  const yearHeader = `| 指标 | ${years.join(" | ")} |`;
  const yearSep = `| --- | ${years.map(() => "---:").join(" | ")} |`;

  const profitValues = years.map((y) => revenue(y));
  const netValues = years.map((y) => netProfit(y));
  const epsValues = years.map((y) => basicEpsFor(y));
  const dpsValues = years.map((y) => dpsFor(y));

  const balAssets = years.map((y) => totalAssets(y));
  const balLiab = years.map((y) => totalLiabilities(y));
  const balDebt = years.map((y) => interestBearingDebtFor(y));
  const balCash = years.map((y) => cashFor(y));

  const cfOcf = years.map((y) => ocf(y));
  const cfCapex = years.map((y) => capexFor(y));
  const cfMinor = years.map((y) => minorityPnL(y));

  const klines = dataPack.klines ?? [];
  const lastBar = klines.length > 0 ? klines[klines.length - 1] : undefined;
  const tradingDays = dataPack.tradingCalendar?.filter((d) => d.isTradingDay).length ?? 0;

  const industryLabel = instrument.industry?.trim() || "未知（待 feed 行业字段或 Phase1B 补充）";

  const pRev = latest.parentRevenue;
  const pNp = latest.parentNetProfit;
  const pOcf = latest.parentOperatingCashFlow;
  const hasParentPnl = [pRev, pNp, pOcf].some((v) => v != null && Number.isFinite(v) && v !== 0);

  const pTa = latest.parentTotalAssets;
  const pTl = latest.parentTotalLiabilities;
  const hasParentBal = [pTa, pTl].some((v) => v != null && Number.isFinite(v) && v !== 0);

  const section3p = hasParentPnl
    ? [
        "## §3P 母公司利润表（百万元）",
        "",
        yearHeader,
        yearSep,
        `| 母公司营业收入 | ${years.map((y) => fmt(parentMetric(y, "parentRevenue"))).join(" | ")} |`,
        `| 母公司净利润 | ${years.map((y) => fmt(parentMetric(y, "parentNetProfit"))).join(" | ")} |`,
        `| 母公司经营活动现金流 | ${years.map((y) => fmt(parentMetric(y, "parentOperatingCashFlow"))).join(" | ")} |`,
        "",
      ]
    : [
        "## §3P 母公司利润表（百万元）",
        "",
        "> 上游 feed 未返回母公司分解科目（`parentRevenue` / `parentNetProfit` / `parentOperatingCashFlow`）；待接口对齐 `assembly.py` 母公司口径后自动填充。",
        "",
      ];

  if (!hasParentPnl) {
    warnLines.push(`- [数据完整性|中] §3P 母公司利润表缺失：feed 未提供母公司损益/现金流字段。`);
  }

  const section4p = hasParentBal
    ? [
        "## §4P 母公司资产负债表（百万元）",
        "",
        yearHeader,
        yearSep,
        `| 母公司总资产 | ${years.map((y) => fmt(parentMetric(y, "parentTotalAssets"))).join(" | ")} |`,
        `| 母公司总负债 | ${years.map((y) => fmt(parentMetric(y, "parentTotalLiabilities"))).join(" | ")} |`,
        "",
      ]
    : [
        "## §4P 母公司资产负债表（百万元）",
        "",
        "> 上游 feed 未返回母公司资产负债表科目；待接口对齐后填充。",
        "",
      ];

  if (!hasParentBal) {
    warnLines.push(`- [数据完整性|中] §4P 母公司资产负债表缺失：feed 未提供母公司资产负债字段。`);
  }

  const section17 = buildSection17Derived(years, byYear);

  return [
    `# ${instrument.name}（${norm}）`,
    "",
    "## §1 基础信息",
    `- 股票代码：${norm}`,
    `- 市场：${instrument.market}`,
    `- 币种：${instrument.currency ?? "CNY"}`,
    `- 行业：${industryLabel}`,
    `- 最新股价：${safeNum(quote.price, 0).toFixed(4)}`,
    `- 最新市值：${fmt(marketCapResolved)} 百万元`,
    `- 总股本：${fmt(totalSharesMm)} 百万股`,
    `- 无风险利率：${rf.toFixed(2)}%${rfEnv ? "（来自环境变量）" : "（默认占位）"}`,
    "",
    "## §2 风险提示",
    ...riskLines,
    "",
    "## §3 利润表（百万元）",
    yearHeader,
    yearSep,
    `| 营业收入 | ${profitValues.map((v) => fmt(v)).join(" | ")} |`,
    `| 归母净利润 | ${netValues.map((v) => fmt(v)).join(" | ")} |`,
    `| 每股收益EPS | ${epsValues.map((v) => fmt(v, 4)).join(" | ")} |`,
    `| 每股分红DPS | ${dpsValues.map((v) => fmt(v, 4)).join(" | ")} |`,
    "",
    ...section3p,
    "## §4 资产负债表（百万元）",
    yearHeader,
    yearSep,
    `| 总资产 | ${balAssets.map((v) => fmt(v)).join(" | ")} |`,
    `| 总负债 | ${balLiab.map((v) => fmt(v)).join(" | ")} |`,
    `| 有息负债 | ${balDebt.map((v) => fmt(v)).join(" | ")} |`,
    `| 货币资金 | ${balCash.map((v) => fmt(v)).join(" | ")} |`,
    "",
    ...section4p,
    "## §5 现金流量表（百万元）",
    yearHeader,
    yearSep,
    `| 经营活动现金流OCF | ${cfOcf.map((v) => fmt(v)).join(" | ")} |`,
    `| 资本开支Capex | ${cfCapex.map((v) => fmt(v)).join(" | ")} |`,
    `| 少数股东损益 | ${cfMinor.map((v) => fmt(v)).join(" | ")} |`,
    "",
    "## §6 估值与交易摘要",
    `- 区间 K 线根数：${klines.length}`,
    lastBar
      ? `- 最近一根 K 线：${lastBar.ts} 开${lastBar.open} 高${lastBar.high} 低${lastBar.low} 收${lastBar.close}`
      : `- 最近一根 K 线：无`,
    "",
    "## §7 股东与股本",
    `- 采样窗口内企业行动条数：${dataPack.corporateActions?.length ?? 0}（分红/送转等；前十大股东明细待 feed 股东接口接入）`,
    "",
    "## §8 重大事件与公告（占位）",
    "> 可由后续 Phase1B / 新闻接口填充。",
    "",
    "## §9 行业与竞争",
    `- 行业标签：${industryLabel}`,
    "> 竞争格局摘要建议由 Phase1B §8 或研报检索补齐。",
    "",
    "## §10 分红融资与资本运作",
    `- 采样期内企业行动条数：${dataPack.corporateActions?.length ?? 0}`,
    "",
    "## §11 交易日历摘要",
    `- 采样窗口内交易日计数（来自日历接口）：${tradingDays}`,
    "",
    "## §12 数据质量与来源",
    `- Phase1A JSON：instrument / quote / klines / financialSnapshot / **financialHistory（可选）**（+ 可选 corporateActions、tradingCalendar）`,
    "",
    "## §13 Warnings",
    ...warnLines,
    ...(warnLines.length === 0 ? ["- [数据完整性|低] 未产生额外警告条目。"] : []),
    "",
    "## §14 管理层与治理（占位）",
    "",
    "## §15 风险提示汇总（占位）",
    "",
    "## §16 附录：原始行情窗口",
    lastBar
      ? `- OHLC：${fmt(safeNum(lastBar.open, 0))} / ${fmt(safeNum(lastBar.high, 0))} / ${fmt(safeNum(lastBar.low, 0))} / ${fmt(safeNum(lastBar.close, 0))}（${lastBar.ts}）`
      : "- （无）",
    "",
    ...section17,
  ].join("\n");
}
