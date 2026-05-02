import type {
  DataPackMarket,
  FinancialQualityTrend,
  FinancialSnapshot,
  IndustryProfileSnapshot,
} from "@trade-signal/schema-core";

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

function fmtMaybe(n: number | undefined, digits = 2): string {
  return typeof n === "number" && Number.isFinite(n) ? fmt(n, digits) : "—";
}

function fmtDays(n: number | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? fmt(n, 1) : "—";
}

function snapshotYearLabel(s: FinancialSnapshot): string {
  return yearFromPeriod(s.period);
}

function yearFromDate(value?: string): string | undefined {
  return value?.match(/^(20\d{2})/)?.[1];
}

function latestHistoricalPe(dataPack: DataPackMarket): number | undefined {
  const direct = dataPack.historicalPeSeries?.currentPe;
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) return direct;
  const series = dataPack.historicalPeSeries?.peTtm ?? [];
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const v = series[i];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return undefined;
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

function buildSection18ExpenseRatio(trends: FinancialQualityTrend[] | undefined): string[] {
  const rows = (trends ?? []).slice(0, 5);
  if (!rows.length) {
    return [
      "## §18 费用率趋势",
      "",
      "> 费用率趋势未形成结构化结果；商业质量 D1/D5 需回退利润表和年报 MD&A。",
      "",
    ];
  }
  return [
    "## §18 费用率趋势",
    "",
    "| 年度 | 毛利率(%) | 销售费用率(%) | 管理费用率(%) | 研发费用率(%) | 财务费用率(%) |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((r) =>
      `| ${r.year} | ${fmtMaybe(r.grossMarginPct)} | ${fmtMaybe(r.salesExpenseRatioPct)} | ${fmtMaybe(r.adminExpenseRatioPct)} | ${fmtMaybe(r.rdExpenseRatioPct)} | ${fmtMaybe(r.financialExpenseRatioPct)} |`,
    ),
    "",
  ];
}

function buildSection19WorkingCapital(trends: FinancialQualityTrend[] | undefined): string[] {
  const rows = (trends ?? []).slice(0, 5);
  if (!rows.length) {
    return [
      "## §19 营运资本与现金转换周期",
      "",
      "> 营运资本趋势未形成结构化结果；应收、存货、应付和现金转换周期需从三表或年报附注补齐。",
      "",
    ];
  }
  return [
    "## §19 营运资本与现金转换周期",
    "",
    "| 年度 | 应收账款 | 存货 | 应付账款 | 应收天数 | 存货天数 | 应付天数 | CCC天数 | OCF/净利润 | FCF Margin(%) | 减值损失 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((r) =>
      `| ${r.year} | ${fmtMaybe(r.accountsReceivable)} | ${fmtMaybe(r.inventory)} | ${fmtMaybe(r.accountsPayable)} | ${fmtDays(r.accountsReceivableDays)} | ${fmtDays(r.inventoryDays)} | ${fmtDays(r.accountsPayableDays)} | ${fmtDays(r.cashConversionCycleDays)} | ${fmtMaybe(r.ocfToNetProfit)} | ${fmtMaybe(r.fcfMarginPct)} | ${fmtMaybe(r.impairmentLoss)} |`,
    ),
    "",
  ];
}

function buildSection20BusinessProfile(dataPack: DataPackMarket): string[] {
  const companyOps = dataPack.companyOperationsSnapshot;
  const opGroups = companyOps?.signalGroups;
  const lines = [
    "## §20 主营业务画像",
    "",
    companyOps
      ? `- 来源：${companyOps.source}；状态：${companyOps.status}；缺口：${companyOps.missingFields.join("、") || "无"}`
      : "> 公司经营画像未形成结构化结果；成稿应回退年报摘录与外部证据。",
    "",
    "| 模块 | 信号数 | 研报用途 |",
    "| --- | ---: | --- |",
    `| 主营结构 | ${opGroups?.businessStructure?.length ?? 0} | D1 赚钱逻辑、收入结构、业务拆分 |`,
    `| 经营指标 | ${opGroups?.operatingMetrics?.length ?? 0} | D1/D5 用户、量价、资本开支等变量 |`,
    `| 股东回报 | ${opGroups?.shareholderReturns?.length ?? 0} | D4/D5 分红、派息、回购政策验证 |`,
    `| 核心题材 | ${opGroups?.themes?.length ?? 0} | D2/D3 行业趋势与业务转型线索 |`,
    "",
  ];
  if (companyOps?.signals?.length) {
    lines.push(
      "| 类别 | 标签 | 摘要 |",
      "| --- | --- | --- |",
      ...companyOps.signals
        .slice(0, 16)
        .map((s) => `| ${s.category} | ${s.label} | ${String(s.summary ?? "—").replace(/\|/g, "/")} |`),
      "",
    );
  }
  return lines;
}

function buildSection21RiskTimeline(dataPack: DataPackMarket): string[] {
  const regEvents = dataPack.regulatoryEventCollection?.events ?? [];
  const govEvents = dataPack.governanceEventCollection?.events ?? [];
  const lines = [
    "## §21 治理与监管事件时间线",
    "",
    `- 官方监管事件：${regEvents.length} 条；治理负面事件：${govEvents.length} 条。`,
    "",
  ];
  if (!regEvents.length && !govEvents.length) {
    lines.push("> 未形成结构化监管/治理事件，不等于事实不存在；高敏事项仍需结合交易所、巨潮、证监会和司法/市监专源核验。", "");
    return lines;
  }
  lines.push("| 日期 | 类型 | 严重度 | 来源 | 标题/摘要 |", "| --- | --- | --- | --- | --- |");
  for (const e of regEvents.slice(0, 12)) {
    lines.push(
      `| ${e.eventDate ?? "—"} | ${e.rawType ?? e.eventType} | ${e.severity} | ${e.sourceOrg} | ${String(e.title).replace(/\|/g, "/")} |`,
    );
  }
  for (const e of govEvents.slice(0, Math.max(0, 12 - regEvents.length))) {
    lines.push(
      `| ${e.happenedAt ?? "—"} | ${e.category} | ${e.severity} | ${e.sourceLabel ?? "—"} | ${String(e.summary).replace(/\|/g, "/")} |`,
    );
  }
  lines.push("");
  return lines;
}

const INDUSTRY_KPI_LABELS: Record<string, string> = {
  mobile_customers: "移动客户",
  five_g_customers: "5G 客户",
  broadband_customers: "宽带客户",
  arpu: "ARPU",
  dict_enterprise: "政企/DICT",
  cloud_compute: "算力/云收入",
  capex: "资本开支",
  product_mix: "产品分部",
  channel_region: "渠道/区域",
  dealer: "经销商",
  inventory: "库存",
  raw_material: "原料/包材",
  food_safety: "食品安全",
  nim: "净息差",
  npl: "不良率",
  provision_coverage: "拨备覆盖率",
  loan_deposit_mix: "贷款/存款结构",
  capital_adequacy: "资本充足率",
  nbv: "新业务价值",
  premium_mix: "保费结构",
  combined_ratio: "综合成本率",
  solvency: "偿付能力",
  investment_yield: "投资收益率",
  capacity: "产能",
  sales_volume: "销量",
  orders: "订单",
  price: "单价",
  contract_sales: "销售额",
  land_bank: "土储",
  delivery: "竣工交付",
  financing_cost: "融资成本",
  advance_receipts: "预收款",
  guarantee: "担保",
  pipeline: "研发管线",
  approval: "注册批件",
  vbp: "集采",
  medical_insurance: "医保",
  device_registration: "器械注册",
  installed_capacity: "装机",
  power_generation: "发电量",
  utilization_hours: "利用小时",
  tariff: "上网电价",
  fuel_price: "煤价/气价",
  freight_passenger_volume: "货运/客运量",
  freight_rate: "运价",
  turnover_volume: "周转量",
  unit_cost: "单位成本",
  fuel_cost: "燃油成本",
  throughput: "吞吐量",
  software_service_revenue: "软件/服务收入",
  project_delivery: "项目交付",
  arr_subscription: "ARR/订阅",
  rd_investment: "研发投入",
  revenue_per_employee: "人均产出",
  receivables_contract_liabilities: "应收与合同负债",
  customer_concentration: "政府/大客户依赖",
  advertising_revenue: "广告收入",
  content_cost: "内容/版权成本",
  traffic_users: "用户/流量",
  game_gross_billing: "游戏流水",
  box_office: "院线/票房",
  ip_pipeline: "IP 储备",
  regulatory_approval: "监管版号",
  treatment_volume: "处理量",
  operating_scale: "项目运营规模",
  tariff_subsidy: "补贴/电价/处置费",
  receivable_collection: "应收回款",
  bot_ppp: "BOT/PPP 项目",
  environmental_penalty: "环保处罚",
  brand_matrix: "品牌矩阵",
  channel_mix: "渠道结构",
  online_ratio: "线上占比",
  repurchase_membership: "复购/会员",
  gross_margin: "毛利率",
  marketing_ratio: "营销费用率",
  product_quality: "监管/产品质量",
  store_hotel_scenic_count: "门店/酒店/景区",
  traffic: "客流",
  customer_spend: "客单价",
  revpar_occupancy: "RevPAR/入住率",
  franchise_direct: "加盟直营",
  rent_labor_cost: "租金人工成本",
  membership_repurchase: "会员/复购",
};

function buildSection22IndustryProfile(snapshot: IndustryProfileSnapshot | undefined): string[] {
  if (!snapshot) {
    return [
      "## §22 行业 Profile KPI",
      "",
      "> 行业 Profile 未形成结构化结果；报告只使用通用财务、年报与经营画像证据，不编造行业专属 KPI。",
      "",
    ];
  }
  const lines = [
    "## §22 行业 Profile KPI",
    "",
    `- Profile：${snapshot.profileId}；行业：${snapshot.industryName ?? "未识别"}；置信度：${snapshot.confidence}；命中方式：${snapshot.matchedBy}`,
    `- 来源：${snapshot.sourceRefs.join("、") || "无结构化来源"}`,
    "",
  ];
  if (snapshot.classificationProvider === "sw") {
    lines.splice(
      3,
      0,
      `- 申万行业：一级=${snapshot.swLevel1Name ?? "—"}；二级=${snapshot.swLevel2Name ?? "—"}；三级=${snapshot.swLevel3Name ?? "—"}`,
      `- Profile 映射依据：${snapshot.matchedBy}`,
    );
  }
  if (snapshot.profileId === "generic") {
    lines.push(
      "> 当前使用通用 profile；行业专属 KPI 未启用。商业质量页应只写通用经营质量，不展示无关行业指标。",
      "",
    );
    return lines;
  }
  if (snapshot.kpiSignals.length > 0) {
    lines.push(
      "| KPI | 摘要 | 来源 | 置信度 |",
      "| --- | --- | --- | --- |",
      ...snapshot.kpiSignals.map(
        (s) =>
          `| ${s.label} | ${String(s.summary ?? "—").replace(/\|/g, "/")} | ${s.source} | ${s.confidence} |`,
      ),
      "",
    );
  } else {
    lines.push("> 当前 profile 已识别，但 KPI 未形成结构化结果；报告只能写缺口，不补行业字段。", "");
  }
  if (snapshot.missingKpis.length > 0) {
    lines.push(
      "| 未形成结构化 KPI | 后续证据方向 |",
      "| --- | --- |",
      ...snapshot.missingKpis.map(
        (key) =>
          `| ${INDUSTRY_KPI_LABELS[key] ?? key} | 年报经营指标、公司公告、行业专源或 F10 经营画像 |`,
      ),
      "",
    );
  }
  return lines;
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

  const dividendsByYear = new Map<string, number>();
  for (const action of dataPack.corporateActions ?? []) {
    if (action.actionType !== "dividend") continue;
    const cash = safeNum(action.cashDividendPerShare, Number.NaN);
    if (!Number.isFinite(cash) || cash <= 0) continue;
    const y = yearFromDate(action.exDate) ?? yearFromDate(action.recordDate);
    if (!y) continue;
    dividendsByYear.set(y, safeNum(dividendsByYear.get(y), 0) + cash);
  }
  const dpsFor = (y: string) => {
    const s = byYear.get(y) ?? latest;
    if (s.dividendsPerShare !== undefined && s.dividendsPerShare !== null) {
      return safeNum(s.dividendsPerShare, 0);
    }
    return safeNum(dividendsByYear.get(y), 0);
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
  const peTtm = latestHistoricalPe(dataPack);
  const peStats = dataPack.historicalPeSeries;
  const peP50 = peStats?.p50 ?? peStats?.median;
  if (klines.length === 0) {
    warnLines.push(
      "- [数据完整性|中|规则=kline_bars_count_0] K 线返回 0 根；可能是浏览器上下文不可用或直连 fallback 失败，请检查 feed /stock/kline diagnostics。",
    );
  }

  const peerPool = dataPack.peerComparablePool;
  const industryLabel =
    instrument.industry?.trim() ||
    peerPool?.industryName?.trim() ||
    dataPack.industryCycleSnapshot?.industryName?.trim() ||
    "未知（待 feed 行业字段或 Phase1B 补充）";
  const peerRows = peerPool?.peers ?? [];
  const peerSection =
    peerRows.length > 0
      ? [
          "## §9P 同业可比池（自动 TopN）",
          "",
          `- 来源：${peerPool?.source ?? "feed_peer_pool"}；行业：${peerPool?.industryName ?? industryLabel}；排序：${peerPool?.sortColumn ?? "默认"}；样本数：${peerRows.length}`,
          "",
          "| 代码 | 名称 | 行业 | 年度 | 营收 | 归母净利润 | 3Q归母净利润 | 1Q市值 | 4Q市值 |",
          "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
          ...peerRows.map(
            (p) =>
              `| ${p.code} | ${p.name ?? "—"} | ${p.industryName ?? "—"} | ${p.year ?? "—"} | ${fmtMaybe(p.revenueAllYear)} | ${fmtMaybe(p.parentNiAllYear)} | ${fmtMaybe(p.parentNi3Q)} | ${fmtMaybe(p.marketCap1Q)} | ${fmtMaybe(p.marketCap4Q)} |`,
          ),
          "",
        ]
      : [
          "## §9P 同业可比池（自动 TopN）",
          "",
          "> 自动同业池未形成结构化结果；后续商业质量成稿只能写缺口，不得固定或伪造同行名单。",
          "",
        ];
  const companyOps = dataPack.companyOperationsSnapshot;
  const opGroups = companyOps?.signalGroups;
  const companyOpsSection = [
    "## §9O 公司经营画像",
    "",
    companyOps
      ? `- 来源：${companyOps.source}；状态：${companyOps.status}；缺口：${companyOps.missingFields.join("、") || "无"}`
      : "> 公司经营画像未形成结构化结果；成稿应回退年报摘录与外部证据。",
    "",
    "| 模块 | 候选信号数 | 用途 |",
    "| --- | ---: | --- |",
    `| 主营结构 | ${opGroups?.businessStructure?.length ?? 0} | D1 赚钱逻辑、收入结构、业务拆分 |`,
    `| 经营指标 | ${opGroups?.operatingMetrics?.length ?? 0} | D1/D5 行业经营变量、资本开支和量价信号 |`,
    `| 股东回报 | ${opGroups?.shareholderReturns?.length ?? 0} | D4/D5 分红、派息、回购政策验证 |`,
    `| 核心题材 | ${opGroups?.themes?.length ?? 0} | D2/D3 行业趋势与业务转型线索 |`,
    "",
    ...(companyOps?.signals?.length
      ? [
          "| 类别 | 标签 | 摘要 |",
          "| --- | --- | --- |",
          ...companyOps.signals
            .slice(0, 12)
            .map((s) => `| ${s.category} | ${s.label} | ${String(s.summary ?? "—").replace(/\|/g, "/")} |`),
          "",
        ]
      : []),
  ];

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

  const byYearWithDps = new Map(
    [...byYear.entries()].map(([year, snapshot]) => [
      year,
      {
        ...snapshot,
        dividendsPerShare:
          snapshot.dividendsPerShare !== undefined && snapshot.dividendsPerShare !== null
            ? snapshot.dividendsPerShare
            : dpsFor(year),
      },
    ] as const),
  );
  const section17 = buildSection17Derived(years, byYearWithDps);

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
    `- PE TTM：${peTtm !== undefined ? fmt(peTtm) : "缺失"}`,
    `- 历史 PE 分位：${peStats?.percentile !== undefined ? `${fmt(peStats.percentile)}%` : "缺失"}`,
    `- 历史 PE 分位点：P25=${peStats?.p25 !== undefined ? fmt(peStats.p25) : "缺失"}；P50=${peP50 !== undefined ? fmt(peP50) : "缺失"}；P75=${peStats?.p75 !== undefined ? fmt(peStats.p75) : "缺失"}`,
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
    ...peerSection,
    ...companyOpsSection,
    ...buildSection18ExpenseRatio(dataPack.financialQualityTrends),
    ...buildSection19WorkingCapital(dataPack.financialQualityTrends),
    ...buildSection20BusinessProfile(dataPack),
    ...buildSection21RiskTimeline(dataPack),
    ...buildSection22IndustryProfile(dataPack.industryProfileSnapshot),
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
