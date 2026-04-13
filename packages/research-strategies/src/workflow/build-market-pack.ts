import type { DataPackMarket } from "@trade-signal/schema-core";

import { normalizeCodeForFeed } from "../pipeline/normalize-stock-code.js";

function safeNum(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function yearFromPeriod(period?: string): string {
  const matched = period?.match(/20\d{2}/)?.[0];
  return matched ?? String(new Date().getFullYear() - 1);
}

/** 生成最近 5 个财报年度列（用于与 Phase3 解析器多年表对齐；无历史时数值重复并打标） */
function recentFiveYears(anchorYear: string): string[] {
  const y = Number(anchorYear);
  if (!Number.isFinite(y)) return [anchorYear];
  return [0, 1, 2, 3, 4].map((d) => String(y - d));
}

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits);
}

/**
 * 由 Phase1A 数据包生成 A股 `data_pack_market.md`（§1~§17 骨架 + 多年财务表 + §13 Warnings）
 */
export function buildMarketPackMarkdown(code: string, dataPack: DataPackMarket): string {
  const instrument = dataPack.instrument;
  const quote = dataPack.quote;
  const fin = dataPack.financialSnapshot;
  const reportYear = yearFromPeriod(fin?.period);
  const years = recentFiveYears(reportYear);
  const norm = normalizeCodeForFeed(code);

  const revenue = safeNum(fin?.revenue, 0);
  const netProfit = safeNum(fin?.netProfit, 0);
  const ocf = safeNum(fin?.operatingCashFlow, netProfit);
  const capex =
    fin?.capitalExpenditure !== undefined && fin.capitalExpenditure !== null
      ? safeNum(fin.capitalExpenditure, 0)
      : Math.max(0, Math.round(Math.abs(ocf) * 0.2));
  const totalAssets = safeNum(fin?.totalAssets, 0);
  const totalLiabilities = safeNum(fin?.totalLiabilities, 0);
  const hasFullBalanceSheet = totalAssets > 0 && totalLiabilities >= 0;
  const interestBearingDebt =
    fin?.interestBearingDebt !== undefined && fin.interestBearingDebt !== null
      ? safeNum(fin.interestBearingDebt, 0)
      : hasFullBalanceSheet
        ? totalLiabilities * 0.4
        : 0;
  const cash =
    fin?.cashAndEquivalents !== undefined && fin.cashAndEquivalents !== null
      ? safeNum(fin.cashAndEquivalents, 0)
      : hasFullBalanceSheet
        ? totalAssets * 0.1
        : 0;
  const minorityPnL =
    fin?.minorityInterestPnL !== undefined && fin.minorityInterestPnL !== null
      ? safeNum(fin.minorityInterestPnL, 0)
      : 0;

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

  const basicEps =
    fin?.earningsPerShare !== undefined && fin.earningsPerShare !== null
      ? safeNum(fin.earningsPerShare, 0)
      : totalSharesMm > 0
        ? netProfit / totalSharesMm
        : 0;

  const div0 = dataPack.corporateActions?.find((a) => a.cashDividendPerShare != null);
  const dps =
    fin?.dividendsPerShare !== undefined && fin.dividendsPerShare !== null
      ? safeNum(fin.dividendsPerShare, 0)
      : safeNum(div0?.cashDividendPerShare, 0);

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
  if (!dataPack.corporateActions?.length && dps === 0) {
    riskLines.push(`- [数据完整性|低] 未返回企业行动记录，每股分红 DPS 可能为 0。`);
  }
  if (fin?.capitalExpenditure === undefined || fin.capitalExpenditure === null) {
    riskLines.push(`- [数据完整性|中] Phase1A 未提供 Capex，按 OCF×20% 估算（${fmt(capex)}）。`);
    warnLines.push(`- [估算|中] Capex 由 OCF 比例估算，非现金流量表直接值。`);
  }
  if (fin?.interestBearingDebt === undefined || fin.interestBearingDebt === null) {
    if (hasFullBalanceSheet) {
      warnLines.push(`- [估算|中] 有息负债按总负债比例估算，非附注直接值。`);
    }
  }
  if (fin?.cashAndEquivalents === undefined || fin.cashAndEquivalents === null) {
    if (hasFullBalanceSheet) {
      warnLines.push(`- [估算|中] 货币资金按总资产比例估算，非资产负债表直接值。`);
    }
  }
  if (years.length > 1) {
    warnLines.push(
      `- [数据完整性|中] 多年财务列为单期快照外推复制（${years[years.length - 1]}~${years[0]}），仅用于因子多年序列回退；真实多年口径需 feed 历史接口。`,
    );
  }
  if (marketCapResolved <= 0 || totalSharesMm <= 0) {
    warnLines.push(`- [数据完整性|中] 市值或总股本无法可靠推导，请检查行情或财务接口是否返回市值/股本字段。`);
  }

  const yearHeader = `| 指标 | ${years.join(" | ")} |`;
  const yearSep = `| --- | ${years.map(() => "---:").join(" | ")} |`;

  const profitValues = years.map(() => revenue);
  const netValues = years.map(() => netProfit);
  const epsValues = years.map(() => basicEps);
  const dpsValues = years.map(() => dps);

  const balAssets = years.map(() => totalAssets);
  const balLiab = years.map(() => totalLiabilities);
  const balDebt = years.map(() => interestBearingDebt);
  const balCash = years.map(() => cash);

  const cfOcf = years.map(() => ocf);
  const cfCapex = years.map(() => capex);
  const cfMinor = years.map(() => minorityPnL);

  const klines = dataPack.klines ?? [];
  const lastBar = klines.length > 0 ? klines[klines.length - 1] : undefined;
  const tradingDays = dataPack.tradingCalendar?.filter((d) => d.isTradingDay).length ?? 0;

  return [
    `# ${instrument.name}（${norm}）`,
    "",
    "## §1 基础信息",
    `- 股票代码：${norm}`,
    `- 市场：${instrument.market}`,
    `- 币种：${instrument.currency ?? "CNY"}`,
    `- 行业：未知`,
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
    "## §4 资产负债表（百万元）",
    yearHeader,
    yearSep,
    `| 总资产 | ${balAssets.map((v) => fmt(v)).join(" | ")} |`,
    `| 总负债 | ${balLiab.map((v) => fmt(v)).join(" | ")} |`,
    `| 有息负债 | ${balDebt.map((v) => fmt(v)).join(" | ")} |`,
    `| 货币资金 | ${balCash.map((v) => fmt(v)).join(" | ")} |`,
    "",
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
    "## §7 股东与股本（占位）",
    "> 上游 feed 未映射前十大股东/户数时，本节保留结构占位。",
    "",
    "## §8 重大事件与公告（占位）",
    "> 可由后续 Phase1B / 新闻接口填充。",
    "",
    "## §9 行业与竞争（占位）",
    "> 行业名称当前缺省为「未知」，待行业数据接入后替换。",
    "",
    "## §10 分红融资与资本运作",
    `- 采样期内企业行动条数：${dataPack.corporateActions?.length ?? 0}`,
    "",
    "## §11 交易日历摘要",
    `- 采样窗口内交易日计数（来自日历接口）：${tradingDays}`,
    "",
    "## §12 数据质量与来源",
    `- Phase1A JSON：instrument / quote / klines / financialSnapshot（+ 可选 corporateActions、tradingCalendar）`,
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
    "## §17 其他（占位）",
    "",
  ].join("\n");
}
