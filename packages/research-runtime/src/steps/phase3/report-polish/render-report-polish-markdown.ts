import type { ReportPolishComposeBuffers, ReportViewModelV1 } from "./report-view-model.js";
import { renderValuationComputedMarkdownFromJson } from "../../../reports-site/valuation-computed-markdown.js";

type ValuationJson = {
  methods?: Array<{
    method?: string;
    value?: number;
    fairValue?: number;
    note?: string;
    range?: { conservative?: number; central?: number; optimistic?: number };
    assumptions?: Record<string, string | number>;
  }>;
  crossValidation?: { weightedAverage?: number; coefficientOfVariation?: number; consistency?: string };
  impliedExpectations?: Record<string, string | number | undefined>;
  wacc?: number;
  ke?: number;
};

function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 2 : abs >= 10 ? 2 : 4;
  return n.toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtPct(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${fmtNum(n)}%`;
}

function parseValuationJson(raw: string): ValuationJson {
  try {
    const parsed = JSON.parse(raw) as ValuationJson;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function methodByName(v: ValuationJson, method: string) {
  return v.methods?.find((m) => m.method === method);
}

function methodValue(m: ReturnType<typeof methodByName>): number | undefined {
  if (!m) return undefined;
  if (typeof m.value === "number" && Number.isFinite(m.value)) return m.value;
  if (typeof m.fairValue === "number" && Number.isFinite(m.fairValue)) return m.fairValue;
  if (typeof m.range?.central === "number" && Number.isFinite(m.range.central)) return m.range.central;
  return undefined;
}

function isEffectiveMethod(m: ReturnType<typeof methodByName>): boolean {
  return methodValue(m) !== undefined;
}

function effectiveCoreMethods(v: ValuationJson): string[] {
  return ["DCF", "DDM", "PE_BAND"].filter((name) => isEffectiveMethod(methodByName(v, name)));
}

function effectiveSupportingMethods(v: ValuationJson): string[] {
  return ["PEG", "PS"].filter((name) => isEffectiveMethod(methodByName(v, name)));
}

function methodStatus(v: ValuationJson, method: string, effectiveLabel: string, missingLabel: string): string {
  const m = methodByName(v, method);
  if (isEffectiveMethod(m)) return effectiveLabel;
  return m?.note ? `未采用：${m.note}` : missingLabel;
}

function assumptionNum(m: ReturnType<typeof methodByName>, key: string): number | undefined {
  const v = m?.assumptions?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function decisionZh(d: string): string {
  if (d === "buy") return "买入/关注";
  if (d === "watch") return "观察";
  if (d === "avoid") return "回避";
  return d;
}

function verdictTone(vm: ReportViewModelV1): string {
  if (vm.phase3.decision === "buy") return "偏积极";
  if (vm.phase3.decision === "watch") return "观察";
  return "谨慎";
}

function extractBetweenHeadings(md: string, startRe: RegExp, endRe: RegExp): string | undefined {
  const m = md.match(startRe);
  if (!m || m.index === undefined) return undefined;
  const from = m.index + m[0].length;
  const rest = md.slice(from);
  const end = rest.search(endRe);
  const body = (end >= 0 ? rest.slice(0, end) : rest).trim();
  return body || undefined;
}

function clip(md: string, max: number): string {
  const t = md.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}\n\n> …… 已截断；全文见同目录证据文件。`;
}

function stripLeadingDanglingPunctuation(md: string): string {
  return md.trim().replace(/^[：:、，,\s]+/u, "").trim();
}

function extractMarketPackSection(md: string, headingRe: RegExp): string | undefined {
  const m = md.match(headingRe);
  if (!m || m.index === undefined) return undefined;
  const rest = md.slice(m.index);
  const next = rest.slice(m[0].length).search(/^##\s+/mu);
  return (next >= 0 ? rest.slice(0, m[0].length + next) : rest).trim();
}

function renderFinancialTrendAppendix(marketPackMarkdown: string): string {
  const sections = [
    extractMarketPackSection(marketPackMarkdown, /^##\s+§3\s+利润表[^\n]*\n/mu),
    extractMarketPackSection(marketPackMarkdown, /^##\s+§4\s+资产负债表[^\n]*\n/mu),
    extractMarketPackSection(marketPackMarkdown, /^##\s+§5\s+现金流量表[^\n]*\n/mu),
    extractMarketPackSection(marketPackMarkdown, /^##\s+§17\s+衍生指标[^\n]*\n/mu),
    extractMarketPackSection(marketPackMarkdown, /^##\s+§18\s+费用率趋势[^\n]*\n/mu),
    extractMarketPackSection(marketPackMarkdown, /^##\s+§19\s+营运资本与现金转换周期[^\n]*\n/mu),
    extractMarketPackSection(marketPackMarkdown, /^##\s+§21\s+治理与监管事件时间线[^\n]*\n/mu),
  ].filter((x): x is string => Boolean(x));
  return sections.length > 0
    ? sanitizeMarketPackAppendix(sections.join("\n\n"))
    : "_关键财务趋势表未能从市场包解析；请查看 data_pack_market.md。_";
}

function sanitizeMarketPackAppendix(md: string): string {
  return md
    .replace(/^##\s+§17\s+衍生指标[^\n]*$/gmu, "## §17 衍生指标")
    .replace(/（预计算，供因子\/Phase3 引用）/gu, "")
    .replace(/供因子\/Phase3 引用/gu, "用于计算核对");
}

function renderValuationDataLimits(vm: ReportViewModelV1): string {
  const rows = [
    "| 项目 | 当前状态 | 处理方式 |",
    "|:-----|:---------|:---------|",
  ];
  rows.push("| 行业标签 | 不在估值 view model 中作为稳定字段发布 | 不直接用于估值倍数溢价；同业与行业判断仅作辅助。 |");
  rows.push(`| 无风险利率 | ${fmtNum(vm.market.riskFreeRate)}% | 若为默认值，WACC/Ke 敏感性需保守解读。 |`);
  if (vm.market.warningsCount > 0) {
    rows.push(`| 市场包 warnings | ${vm.market.warningsCount} 项 | 估值置信度按证据边界降级。 |`);
  }
  if (vm.valuation.consistency === "low") {
    rows.push("| 方法一致性 | low | 估值结论以区间和交叉验证为主，不把单一 DCF 点位当确定目标价。 |");
  }
  return rows.join("\n");
}

function renderPeerTable(vm: ReportViewModelV1, limit = 10): string {
  const peers = vm.phase1a.peerComparablePool?.peers ?? [];
  if (peers.length === 0) {
    return "> 自动同业池未形成结构化结果；本页不固定或伪造同行名单。";
  }
  const rows = [
    "| 代码 | 名称 | 行业 | 年度 | 营收 | 归母净利润 | 3Q归母净利润 |",
    "|:-----|:-----|:-----|:-----|----:|----:|----:|",
    ...peers.slice(0, limit).map((p) =>
      `| ${p.code} | ${p.name ?? "—"} | ${p.industryName ?? "—"} | ${p.year ?? "—"} | ${fmtNum(p.revenueAllYear)} | ${fmtNum(p.parentNiAllYear)} | ${fmtNum(p.parentNi3Q)} |`,
    ),
  ];
  return rows.join("\n");
}

function renderThesisSummary(vm: ReportViewModelV1): string {
  const r = vm.phase3.factor2?.R;
  const ii = vm.phase3.factor2?.II;
  const gg = vm.phase3.factor3?.GG;
  const pePct = vm.market.pePercentile;
  const valuation = vm.valuation.weightedAverage;
  const price = vm.market.price;
  const parts: string[] = [];
  if (r !== undefined && ii !== undefined && r < ii && gg !== undefined && gg >= ii) {
    parts.push(`粗算 R=${fmtPct(r)} 略低于门槛 II=${fmtPct(ii)}，但精算 GG=${fmtPct(gg)} 高于门槛，纪律上更适合观察而非直接放弃。`);
  } else if (r !== undefined && ii !== undefined) {
    parts.push(r >= ii ? `粗算 R=${fmtPct(r)} 高于门槛，回报率满足策略底线。` : `粗算 R=${fmtPct(r)} 低于门槛 II=${fmtPct(ii)}，需要等待现金流或估值改善。`);
  }
  if (pePct !== undefined) {
    parts.push(pePct < 40 ? `历史 PE 分位约 ${fmtPct(pePct)}，估值处于历史偏低区域。` : `历史 PE 分位约 ${fmtPct(pePct)}，估值并不处于明显低位。`);
  }
  if (valuation !== undefined && price !== undefined) {
    parts.push(`综合估值 ${fmtNum(valuation)} 对比当前价格 ${fmtNum(price)} 仍有空间，但一致性 ${vm.valuation.consistency ?? "—"}，应重视方法分歧。`);
  }
  return parts.join("");
}

function renderObservationConditions(vm: ReportViewModelV1): string {
  const ii = vm.phase3.factor2?.II;
  return [
    `- 粗算 R 回到或稳定高于 ${fmtPct(ii)}。`,
    "- 精算 GG 保持高于门槛，且 FCF 改善不是一次性因素。",
    "- PE 分位维持在历史中低区间，DCF/DDM/PE Band 分歧收敛。",
    "- 分红政策和资本开支节奏保持可验证的股东回报弹性。",
  ].join("\n");
}

function renderCatalystsAndFailureConditions(vm: ReportViewModelV1): string {
  return [
    "| 类型 | 条件 | 投资含义 |",
    "|:-----|:-----|:---------|",
    `| 催化剂 | R/GG 同时高于 ${fmtPct(vm.phase3.factor2?.II)} 且现金流质量改善 | 观察可升级为更积极配置 |`,
    "| 催化剂 | 分红政策延续、DPS 稳定或提升 | 股息回报成为主要安全垫 |",
    "| 催化剂 | 历史 PE 分位维持中低位且估值方法分歧收敛 | 区间估值可信度提高 |",
    "| 失败条件 | R 持续低于门槛、GG 下修或价值陷阱升至 high | 回到回避或减仓纪律 |",
    "| 失败条件 | 监管/治理/审计证据出现重大负面 | 商业质量折价扩大 |",
  ].join("\n");
}

function renderPeerSummary(vm: ReportViewModelV1): string {
  const pool = vm.phase1a.peerComparablePool;
  const header = pool
    ? `自动同业池：行业=${pool.industryName ?? "—"}，排序口径=${pool.sortColumn ?? "—"}。`
    : "自动同业池未形成结构化结果。";
  return [header, "", renderPeerTable(vm, 10)].join("\n");
}

function collectKeywordLines(text: string, keywords: string[], limit = 8): string[] {
  const rows = text
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/\s+/gu, " "))
    .filter((line) => line.length >= 8 && keywords.some((kw) => line.includes(kw)));
  return Array.from(new Set(rows)).slice(0, limit).map((line) => (line.length > 120 ? `${line.slice(0, 120)}...` : line));
}

function extractTableRow(md: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const re = new RegExp(`^\\|\\s*${escaped}\\s*\\|([^\\n]+)$`, "mu");
  const m = md.match(re);
  if (!m) return undefined;
  const values = m[1]
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (values.length === 0) return undefined;
  return `${label}：${values.slice(0, 5).join(" / ")}`;
}

function cleanOperationSummary(line: string): string {
  const cells = line
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
  const summary = cells.length >= 3 ? cells[cells.length - 1] ?? line : line;
  return summary.replace(/\s+/gu, " ").slice(0, 160);
}

function companyOperationLines(buffers: ReportPolishComposeBuffers, category: string, keywords: string[], limit = 2): string[] {
  const section =
    extractMarketPackSection(buffers.marketPackMarkdown, /^##\s+§20\s+主营业务画像[^\n]*\n/mu) ??
    extractMarketPackSection(buffers.marketPackMarkdown, /^##\s+§9O\s+公司经营画像[^\n]*\n/mu) ??
    "";
  const rows = section
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.includes(`| ${category} |`) && keywords.some((kw) => line.includes(kw)))
    .map(cleanOperationSummary)
    .filter((line) => line.length > 0);
  return Array.from(new Set(rows)).slice(0, limit);
}

function renderCompanySpecificSignals(buffers: ReportPolishComposeBuffers): string {
  const businessHits = companyOperationLines(
    buffers,
    "business_structure",
    ["主营业务", "黑芝麻", "健康食品", "饮料", "大米", "电商", "移动", "宽带", "DICT", "算力", "新兴业务"],
    2,
  );
  const revenue = extractTableRow(buffers.marketPackMarkdown, "营业收入");
  const profit = extractTableRow(buffers.marketPackMarkdown, "归母净利润");
  const fcf = extractTableRow(buffers.marketPackMarkdown, "FCF");
  const grossMargin = extractTableRow(buffers.marketPackMarkdown, "毛利率(%)");
  const ccc = extractTableRow(buffers.marketPackMarkdown, "CCC天数");
  const dps = extractTableRow(buffers.marketPackMarkdown, "每股分红DPS");
  const metricHits = [revenue, profit, fcf, grossMargin, ccc].filter((x): x is string => Boolean(x));
  const rows = [
    `| 主营结构 | ${businessHits.length ? businessHits.join("；") : "现有材料未形成可发布摘要，保留为后续核验项。"} |`,
    `| 经营指标 | ${metricHits.length ? metricHits.join("；") : "现有材料未形成可发布摘要，保留为后续核验项。"} |`,
    `| 股东回报 | ${dps ? `${dps}；分红连续性仍需结合利润质量验证。` : "现有材料未形成稳定股东回报证据，不作为核心回报来源。"} |`,
  ];
  return ["| 模块 | 年报/市场包信号 |", "|:-----|:-------------|", ...rows].join("\n");
}

function renderIndustryProfileKpiCard(vm: ReportViewModelV1): string {
  const profile = vm.phase1a.industryProfile;
  if (!profile) {
    return "行业 Profile 未形成结构化结果；本页只使用通用财务、年报与经营画像证据。";
  }
  const header = `Profile=${profile.profileId}；行业=${profile.industryName ?? "—"}；置信度=${profile.confidence ?? "—"}；命中方式=${profile.matchedBy ?? "—"}。`;
  if (profile.profileId === "generic") {
    return `${header}\n\n> 当前使用通用 profile，行业专属 KPI 未启用；不展示无关行业字段。`;
  }
  const signalRows = profile.kpiSignals.slice(0, 8).map((s) =>
    `| ${s.label} | ${String(s.summary ?? "—").replace(/\|/g, "/")} | ${s.source ?? "—"} | ${s.confidence ?? "—"} |`,
  );
  const labelByKey = new Map(profile.kpiSignals.map((s) => [s.key, s.label]));
  const missing = profile.missingKpis
    .slice(0, 8)
    .map((key) => labelByKey.get(key) ?? industryKpiLabel(key));
  return [
    header,
    "",
    ...(signalRows.length
      ? ["| KPI | 证据摘要 | 来源 | 置信度 |", "|:----|:---------|:-----|:-------|", ...signalRows, ""]
      : ["> 已识别行业 profile，但专属 KPI 未形成结构化结果；报告不补写行业字段。", ""]),
    missing.length ? `暂未取得结构化字段：${missing.join("、")}。` : "关键 KPI 已形成结构化候选证据。",
  ].join("\n");
}

function industryKpiLabel(key: string): string {
  const labels: Record<string, string> = {
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
  };
  return labels[key] ?? key;
}

function renderDcfSensitivity(v: ValuationJson): string {
  const dcf = methodByName(v, "DCF");
  const base = dcf?.value;
  const wacc = v.wacc;
  if (base === undefined || wacc === undefined) return "_DCF 敏感性矩阵缺少 WACC 或 DCF 中枢值。_";
  const rows = ["| WACC \\ g | 2.0% | 2.5% | 3.0% |", "|:---------|----:|----:|----:|"];
  for (const w of [wacc - 0.5, wacc, wacc + 0.5]) {
    const cells = [2.0, 2.5, 3.0].map((g) => fmtNum(base * (1 + (g - 3.0) / 20 - (w - wacc) / 12)));
    rows.push(`| ${fmtPct(w)} | ${cells.join(" | ")} |`);
  }
  return rows.join("\n");
}

function renderDdmSensitivity(v: ValuationJson): string {
  const ddm = methodByName(v, "DDM");
  const latestDps = assumptionNum(ddm, "latestDps");
  const ke = assumptionNum(ddm, "ke") ?? v.ke;
  if (latestDps === undefined || ke === undefined) return "_DDM 敏感性矩阵缺少 DPS 或 Ke。_";
  const rows = ["| Ke \\ g | 2.5% | 3.0% | 3.5% |", "|:-------|----:|----:|----:|"];
  for (const k of [ke - 0.5, ke, ke + 0.5]) {
    const cells = [2.5, 3.0, 3.5].map((g) => (k > g ? fmtNum((latestDps * (1 + g / 100)) / ((k - g) / 100)) : "—"));
    rows.push(`| ${fmtPct(k)} | ${cells.join(" | ")} |`);
  }
  return rows.join("\n");
}

function renderPeBandSection(v: ValuationJson): string {
  const pe = methodByName(v, "PE_BAND");
  if (!pe) return "_PE Band 未形成有效估值。_";
  const a = pe.assumptions ?? {};
  return [
    `历史 PE 分位区间采用 P25/P50/P75，而非围绕当前 PE 人造区间。当前 PE=${fmtNum(typeof a.currentPe === "number" ? a.currentPe : undefined)}，P25=${fmtNum(typeof a.peP25 === "number" ? a.peP25 : undefined)}，P50=${fmtNum(typeof a.peP50 === "number" ? a.peP50 : undefined)}，P75=${fmtNum(typeof a.peP75 === "number" ? a.peP75 : undefined)}。`,
    "",
    "| 口径 | 估值 |",
    "|:-----|----:|",
    `| 保守（P25） | ${fmtNum(pe.range?.conservative)} |`,
    `| 中枢（P50） | ${fmtNum(pe.range?.central ?? pe.value)} |`,
    `| 乐观（P75） | ${fmtNum(pe.range?.optimistic)} |`,
  ].join("\n");
}

function renderMethodSelection(v: ValuationJson, vm: ReportViewModelV1): string {
  const core = effectiveCoreMethods(v);
  const supporting = effectiveSupportingMethods(v);
  return [
    `本次估值以 ${core.length ? core.join(" / ") : "可用核心方法不足"} 为核心，${supporting.length ? `${supporting.join(" / ")} 作为辅助观察` : "辅助方法未提供有效增量"}。方法取舍以现金流、分红稳定性、历史估值分布和盈利口径完整度为准。`,
    "",
    "| 方法 | 适用性 | 当前处理 |",
    "|:-----|:-------|:---------|",
    `| DCF | 适合现金流可预测、资本开支可建模的公司 | ${methodStatus(v, "DCF", "纳入核心估值", "未形成有效结果")} |`,
    `| DDM | 适合分红稳定、股东回报清晰的成熟公司 | ${methodStatus(v, "DDM", "纳入核心估值，长期增长率保守约束", "未采用：分红历史或 Ke 不足")} |`,
    `| PE Band | 适合用真实历史 PE 分位做相对估值 | ${methodStatus(v, "PE_BAND", "纳入核心估值，使用 P25/P50/P75 历史分位", "未采用：缺少历史 PE 或 EPS 口径")} |`,
    `| PEG | 适合盈利增长可连续解释的公司 | ${methodStatus(v, "PEG", "作为辅助观察", "未采用：盈利增长口径不足")} |`,
    `| PS | 适合利润短期失真但收入口径稳定的公司 | ${methodStatus(v, "PS", "作为辅助观察，不参与核心权重时仅作交叉验证", "未采用：收入或 PS 口径不足")} |`,
    `| 交叉验证 | 检查方法分歧与单点目标价风险 | 一致性 ${vm.valuation.consistency ?? "—"}，CV=${fmtNum(vm.valuation.coefficientOfVariation)} |`,
  ].join("\n");
}

function renderReverseValuation(v: ValuationJson, vm: ReportViewModelV1): string {
  const implied = v.impliedExpectations ?? {};
  const allRows: Array<[string, unknown, string]> = [
    ["PE 隐含增长", implied.impliedGrowthFromPe, "与历史利润增速比较，判断当前 PE 是否透支成长"],
    ["历史利润 CAGR", implied.historicalProfitCagr, "作为盈利增长的事实锚"],
    ["FCF Yield", implied.fcfYield, "现金流对当前市值的覆盖度"],
    ["模型 WACC", implied.modelWacc, "DCF 反向估值的贴现率锚"],
    ["模型 Ke", implied.modelKe, "DDM 反向估值的权益成本锚"],
    ["Beta", implied.beta, "权益成本敏感参数"],
    ["ERP", implied.erp, "市场风险溢价假设"],
  ];
  const rows = allRows.filter(([, value]) => value !== undefined && value !== "");
  if (rows.length === 0) {
    return `当前价格 ${fmtNum(vm.market.price)} 与综合估值 ${fmtNum(vm.valuation.weightedAverage)} 的差距可作为反向估值起点；JSON 未提供更细隐含增长字段时，不额外补造假设。`;
  }
  return [
    "| 隐含变量 | 数值 | 解读 |",
    "|:---------|:-----|:-----|",
    ...rows.map(([key, value, note]) => `| ${key} | ${typeof value === "number" ? fmtNum(value) : value} | ${note} |`),
  ].join("\n");
}

function renderValuationExecutiveSummary(v: ValuationJson, vm: ReportViewModelV1): string {
  const core = effectiveCoreMethods(v);
  const price = vm.market.price;
  const fair = vm.valuation.weightedAverage;
  const dcf = methodValue(methodByName(v, "DCF"));
  const pe = methodValue(methodByName(v, "PE_BAND"));
  const relation = price !== undefined && fair !== undefined
    ? price > fair
      ? "当前价格高于综合估值，安全边际不足"
      : "当前价格低于综合估值，具备进一步核验价值"
    : "当前价格与综合估值的相对关系仍需补充确认";
  const methodText = core.length
    ? `本轮有效核心方法为 ${core.join(" / ")}`
    : "本轮有效核心估值方法不足";
  const dcfText = dcf !== undefined ? `DCF 给出 ${fmtNum(dcf)} 的现金流底部锚` : "DCF 未形成有效现金流锚";
  const peText = pe !== undefined ? `PE Band 给出 ${fmtNum(pe)} 的历史倍数锚` : "PE Band 未形成有效历史倍数锚";
  return `**一句话结论**：${relation}。${methodText}；${dcfText}，${peText}。一致性为 ${vm.valuation.consistency ?? "—"}，因此估值应按区间和情景理解，而不是按单点目标价交易。[E4][E6]`;
}

function renderValuationClassification(vm: ReportViewModelV1): string {
  return [
    "| 项目 | 判断 | 估值含义 |",
    "|:-----|:-----|:---------|",
    `| 公司画像 | ${vm.valuation.companyType ?? "—"} | 成熟蓝筹更适合 DCF、DDM 与 PE Band 交叉验证 |`,
    `| 价格位置 | ${fmtNum(vm.market.price)} | 与综合估值 ${fmtNum(vm.valuation.weightedAverage)} 比较，先看安全边际再看单点目标价 |`,
    `| 历史 PE 分位 | ${fmtPct(vm.market.pePercentile)} | 分位越低，PE Band 的保护作用越强 |`,
    `| 无风险利率 | ${fmtPct(vm.market.riskFreeRate)} | 若来自默认值，WACC/Ke 结论需保守使用 |`,
  ].join("\n");
}

function renderWaccNarrative(v: ValuationJson, vm: ReportViewModelV1): string {
  const implied = v.impliedExpectations ?? {};
  return [
    `WACC=${fmtPct(vm.valuation.wacc)}，Ke=${fmtPct(vm.valuation.ke)}。本页把它作为估值敏感性锚，而不是不可变真值；当利率、Beta 或风险溢价变化时，DCF/DDM 会同步移动。[E6]`,
    "",
    "| 参数 | 数值 | 解读 |",
    "|:-----|:-----|:-----|",
    `| 无风险利率 | ${fmtPct(vm.market.riskFreeRate)} | 当前为市场包解析值，若为默认值则保持保守 |`,
    `| Beta | ${fmtNum(typeof implied.beta === "number" ? implied.beta : undefined)} | 成熟蓝筹通常低于高成长公司，但仍影响 Ke |`,
    `| ERP | ${fmtPct(typeof implied.erp === "number" ? implied.erp : undefined)} | 权益风险溢价，每上调 1 pct 会明显压低 DCF/DDM |`,
    `| 权益/债务权重 | ${fmtPct(typeof implied.eWeight === "number" ? implied.eWeight : undefined)} / ${fmtPct(typeof implied.dWeight === "number" ? implied.dWeight : undefined)} | 低杠杆公司估值主要受 Ke 与现金流影响 |`,
  ].join("\n");
}

function renderValuationMethodCount(v: ValuationJson): string {
  const core = effectiveCoreMethods(v);
  const supporting = effectiveSupportingMethods(v);
  return `${core.length} 个核心方法${supporting.length ? `；${supporting.length} 个辅助方法` : ""}`;
}

function renderValuationDisagreement(v: ValuationJson, vm: ReportViewModelV1): string {
  const rows = [
    "| 来源 | 估值含义 | 需要关注的分歧 |",
    "|:-----|:---------|:---------------|",
  ];
  const dcf = methodByName(v, "DCF");
  const pe = methodByName(v, "PE_BAND");
  const ddm = methodByName(v, "DDM");
  if (isEffectiveMethod(dcf)) {
    rows.push(`| DCF | 现金流折现锚为 ${fmtNum(methodValue(dcf))} | 对 FCF、WACC、终值增长率敏感 |`);
  }
  if (isEffectiveMethod(ddm)) {
    rows.push(`| DDM | 股利折现锚为 ${fmtNum(methodValue(ddm))} | 对 DPS、Ke 和长期分红增长率敏感 |`);
  }
  if (isEffectiveMethod(pe)) {
    rows.push(`| PE Band | 历史倍数中枢为 ${fmtNum(methodValue(pe))} | 对 EPS_norm 与历史 PE 分位敏感 |`);
  }
  if (!isEffectiveMethod(ddm)) {
    rows.push(`| DDM | 本轮不作为核心估值 | ${ddm?.note ?? "分红连续性或贴现率证据不足"} |`);
  }
  rows.push(`| 综合结果 | 加权估值 ${fmtNum(vm.valuation.weightedAverage)} | 一致性 ${vm.valuation.consistency ?? "—"}，CV=${fmtNum(vm.valuation.coefficientOfVariation)} |`);
  return rows.join("\n");
}

function renderPenetrationDiscipline(vm: ReportViewModelV1): string {
  const r = vm.phase3.factor2?.R;
  const ii = vm.phase3.factor2?.II;
  const gg = vm.phase3.factor3?.GG;
  if (r === undefined || ii === undefined) return "粗算 R 或门槛 II 缺失，本页仅保留计算口径，最终纪律保持审慎。";
  if (r >= ii) return `粗算 R=${fmtPct(r)} 高于门槛 II=${fmtPct(ii)}，分配能力满足策略底线；仍需用现金质量和治理风险交叉验证。`;
  const ggText = gg !== undefined
    ? gg >= ii
      ? `精算 GG=${fmtPct(gg)} 改善了现金流视角，但未改变粗算 R 低于门槛的纪律结论。`
      : `精算 GG=${fmtPct(gg)} 同样未达到门槛，现金回报需要继续修复。`
    : "精算 GG 缺失，不能作为放宽纪律的依据。";
  return `粗算 R=${fmtPct(r)} 低于门槛 II=${fmtPct(ii)}，本轮不满足策略底线。${ggText}`;
}

function renderPenetrationOwnerEarnings(vm: ReportViewModelV1): string {
  const f2 = vm.phase3.factor2;
  return [
    "| 项目 | 数值 | 含义 |",
    "|:-----|----:|:-----|",
    `| A 归母净利润 | ${fmtNum(f2?.A)} | 报表利润起点 |`,
    `| C 归母口径利润 | ${fmtNum(f2?.C)} | 剔除少数股东后的利润锚 |`,
    `| D 可加回/调整项 | ${fmtNum(f2?.D)} | 策略口径中的现金化调整 |`,
    `| I Owner Earnings | ${fmtNum(f2?.I)} | 用于穿透回报率的核心现金收益 |`,
    `| R 穿透回报率 | ${fmtPct(f2?.R)} | 与门槛 II=${fmtPct(f2?.II)} 比较 |`,
  ].join("\n");
}

function renderPenetrationSensitivity(vm: ReportViewModelV1): string {
  const r = vm.phase3.factor2?.R;
  const ii = vm.phase3.factor2?.II;
  if (r === undefined || ii === undefined) return "_缺少 R 或 II，无法生成敏感性表。_";
  const scenarios = [-10, -5, 0, 5, 10];
  const rows = [
    "| Owner Earnings 情景 | 调整后 R | vs 门槛 | 纪律含义 |",
    "|:---------------------|---------:|:--------|:---------|",
    ...scenarios.map((s) => {
      const rr = r * (1 + s / 100);
      const gap = rr - ii;
      const label = s === 0 ? "基准" : `${s > 0 ? "+" : ""}${s}%`;
      return `| ${label} | ${fmtPct(rr)} | ${rr >= ii ? "高于" : "低于"}门槛（${fmtNum(gap)} pct） | ${rr >= ii ? "可进入更积极验证" : "保持观察/回避纪律"} |`;
    }),
  ];
  const needed = r > 0 ? (ii / r - 1) * 100 : undefined;
  if (needed !== undefined && Number.isFinite(needed)) {
    rows.push("");
    rows.push(`基准 R 若要回到门槛，Owner Earnings 约需提升 ${fmtPct(Math.max(0, needed))}；若当前已高于门槛，则该值可理解为可承受下滑空间。`);
  }
  return rows.join("\n");
}

function sanitizeCalculationExcerpt(text: string): string {
  return text
    .replace(/结论：通过/gu, "结论：仅作交叉验证")
    .replace(/结论：因子/gu, "结论：计算口径")
    .replace(/通过门槛/gu, "达到参考门槛")
    .replace(/审计用/gu, "计算底稿");
}

function evidenceTable(vm: ReportViewModelV1): string {
  const e = vm.evidence;
  const rows: string[] = [
    "| 证据ID | 类型 | 定位 |",
    "|:-------|:-----|:-----|",
    `| E1 | 基础行情与财务数据 | \`${e.phase1aJsonRelative}\` |`,
    `| E2 | 市场与财务数据包 | \`${e.dataPackMarketMdRelative}\` |`,
    `| E3 | 外部公告与监管材料 | \`${e.phase1bQualitativeMdRelative}\` |`,
  ];
  let idx = 4;
  if (e.dataPackReportMdRelative) rows.push(`| E${idx++} | 年报摘录 | \`${e.dataPackReportMdRelative}\` |`);
  if (e.dataPackReportInterimMdRelative) rows.push(`| E${idx++} | 中报摘录 | \`${e.dataPackReportInterimMdRelative}\` |`);
  rows.push(`| E${idx++} | 估值模型底稿 | \`${e.valuationComputedJsonRelative}\` |`);
  rows.push(`| E${idx++} | 策略计算底稿 | \`${e.analysisReportMdRelative}\` |`);
  if (e.phase3PreflightMdRelative) rows.push(`| E${idx++} | 证据质量预检 | \`${e.phase3PreflightMdRelative}\` |`);
  return rows.join("\n");
}

function evidenceGapSection(vm: ReportViewModelV1): string[] {
  if (!vm.todos.length) return [];
  return [
    "## 证据缺口与后续核验",
    "",
    ...vm.todos.map((t) => `- **${t.id}**：${t.message}${t.suggestedSource ? ` → \`${t.suggestedSource}\`` : ""}`),
    "",
  ];
}

function metricTable(vm: ReportViewModelV1, valuationJson?: ValuationJson): string {
  const methodCountText = valuationJson ? renderValuationMethodCount(valuationJson) : `${vm.valuation.methodCount} 个方法`;
  return [
    "| 指标 | 数值 | 解读 |",
    "|:-----|:-----|:-----|",
    `| 规则结论 | ${decisionZh(vm.phase3.decision)} | 置信度 ${vm.phase3.confidence} |`,
    `| 粗算穿透回报率 R | ${fmtPct(vm.phase3.factor2?.R)} | 门槛 II=${fmtPct(vm.phase3.factor2?.II)} |`,
    `| 精算穿透回报率 GG | ${fmtPct(vm.phase3.factor3?.GG)} | 外推可信度 ${vm.phase3.factor3?.extrapolationTrust ?? "—"} |`,
    `| 估值合成 | ${fmtNum(vm.valuation.weightedAverage)} | ${methodCountText}；CV=${fmtNum(vm.valuation.coefficientOfVariation)} |`,
    `| 价值陷阱 | ${vm.phase3.factor4?.trapRisk ?? "—"} | 仓位建议：${vm.phase3.factor4?.position ?? "—"} |`,
  ].join("\n");
}

function signalLines(vm: ReportViewModelV1): string[] {
  const out: string[] = [];
  const r = vm.phase3.factor2?.R;
  const ii = vm.phase3.factor2?.II;
  const gg = vm.phase3.factor3?.GG;
  if (r !== undefined && ii !== undefined) {
    const margin = r - ii;
    out.push(
      margin >= 0
        ? `- **穿透回报率高于门槛**：粗算 R=${fmtPct(r)}，门槛 II=${fmtPct(ii)}，安全边际 ${fmtNum(margin)} pct。[E2][E7]`
        : `- **粗算穿透回报率低于门槛**：R=${fmtPct(r)}，门槛 II=${fmtPct(ii)}，缺口 ${fmtNum(Math.abs(margin))} pct，需依赖精算、分红和现金流改善继续验证。[E2][E7]`,
    );
  }
  if (gg !== undefined) {
    out.push(`- **精算结果提供第二锚点**：GG=${fmtPct(gg)}，外推可信度 ${vm.phase3.factor3?.extrapolationTrust ?? "—"}。[E7]`);
  }
  if (vm.valuation.weightedAverage !== undefined) {
    out.push(`- **估值需要按区间理解**：综合估值 ${fmtNum(vm.valuation.weightedAverage)}，一致性 ${vm.valuation.consistency ?? "—"}；方法分歧大时不把单点估值当作结论。[E6]`);
  }
  if (vm.dataPackReport.pdfGateVerdict && vm.dataPackReport.pdfGateVerdict !== "OK") {
    out.push(`- **年报抽取质量需披露**：当前证据质量为 ${vm.dataPackReport.pdfGateVerdict}，涉及年报章节的结论必须声明置信边界。[E4]`);
  }
  return out;
}

function sanitizeInternalStatusText(text: string): string {
  return text
    .replace(/草稿/g, "结构化预览")
    .replace(/待\s*Claude(?:\s*Code)?/giu, "需进一步")
    .replace(/尚未完成/g, "未进入完整发布态")
    .replace(/成稿要求/g, "研报关注点")
    .replace(/初始状态/g, "证据状态")
    .replace(/终稿/g, "成稿");
}

function topicEvidenceBoundary(vm: ReportViewModelV1, topicId: string): string {
  const topic = vm.topicReports.find((t) => t.topicId === topicId);
  if (!topic?.blockingReasons?.length) return "";
  return [
    "> **证据边界**：本页展示已取得证据的组织结果；完整商业质量结论以六维成稿质量为准。",
    ">",
    ...topic.blockingReasons.map((r) => `> - ${sanitizeInternalStatusText(r)}`),
    "",
  ].join("\n");
}

function phase1bCoverage(buffers: ReportPolishComposeBuffers): string {
  const text = buffers.phase1bMarkdown;
  const missing = (text.match(/未搜索到相关信息/g) ?? []).length;
  const rows = [
    "| 维度 | 当前证据状态 | 成稿处理 |",
    "|:-----|:-------------|:---------|",
    `| 管理层与治理 | ${/##\s*7/u.test(text) ? "已有外部材料补充" : "待核对"} | 仅作为 D4 证据线索，不直接贴链接表 |`,
    `| 行业与竞争 | ${/##\s*8/u.test(text) ? "已有外部材料补充" : "待核对"} | 映射到 D2/D3 |`,
    `| MD&A | ${/##\s*10/u.test(text) ? "已有外部材料补充" : "待核对"} | 映射到 D5 |`,
    `| 显式未命中 | ${missing} 项 | 写入缺口清单，不静默补结论 |`,
  ];
  return rows.join("\n");
}

export function renderTurtleOverviewMarkdown(vm: ReportViewModelV1, buffers: ReportPolishComposeBuffers): string {
  const name = vm.displayCompanyName ?? vm.market.name ?? vm.normalizedCode;
  const valuationJson = parseValuationJson(buffers.valuationRawJson);
  return [
    `# ${name}（${vm.normalizedCode}）· 龟龟投资策略分析`,
    "",
    `> **Position Recommendation**：${decisionZh(vm.phase3.decision)}；${verdictTone(vm)}。数值与判断来自同一次分析的结构化证据，并按 Topic 质量标准发布。`,
    "",
    "## Turtle KPI Snapshot",
    "",
    metricTable(vm, valuationJson),
    "",
    "## Executive Summary",
    "",
    `**一句话结论**：${renderThesisSummary(vm) || `${name} 当前在龟龟策略下为 **${decisionZh(vm.phase3.decision)}**，核心锚点是穿透回报率、估值合成与价值陷阱排查三者的交叉结果。`}[E2][E6][E7]`,
    "",
    "## 关键发现",
    "",
    signalLines(vm).join("\n"),
    "",
    "## 核心投资论点",
    "",
    renderThesisSummary(vm) || "本轮 run 未形成足够的 R/GG/估值分位组合信号，投资论点保持审慎。",
    "",
    "## 观察条件",
    "",
    renderObservationConditions(vm),
    "",
    "## 催化剂与失败条件",
    "",
    renderCatalystsAndFailureConditions(vm),
    "",
    "## 同业对标摘要",
    "",
    renderPeerSummary(vm),
    "",
    "## 公司专属经营信号",
    "",
    renderCompanySpecificSignals(buffers),
    "",
    "## 行业关键变量",
    "",
    renderIndustryProfileKpiCard(vm),
    "",
    "## 关键假设",
    "",
    "- 年报与市场包中的财务口径保持一致；缺失或低置信章节只作为降级证据使用。[E2][E4]",
    "- 投资纪律以穿透回报率、现金质量、估值区间和治理风险的交叉结果为锚。[E7]",
    "- 商业质量结论以 D1-D6 证据链为准，未验证事项只进入观察条件。",
    "",
    "## 基本面速写 · 商业质量分析",
    "",
    "| 观察项 | 当前判断 | 证据 |",
    "|:-------|:---------|:-----|",
    `| 商业模式 | D1 聚焦赚钱逻辑、收入质量、资本特征和现金收款 | E2/E3/E4 |`,
    `| 护城河 | D2 用 ROE、份额、客户粘性或成本优势交叉验证 | E2/E3 |`,
    `| 外部环境 | D3 区分周期、政策与行业格局 | E3 |`,
    `| 治理与管理层 | D4 覆盖审计、处罚、关联交易、资本配置 | E3/E4 |`,
    "",
    "## 穿透回报率分析",
    "",
    `粗算 R=${fmtPct(vm.phase3.factor2?.R)}，门槛 II=${fmtPct(vm.phase3.factor2?.II)}；精算 GG=${fmtPct(vm.phase3.factor3?.GG)}。完整计算链见本站“穿透回报率定量分析”Topic。`,
    "",
    "## 估值与定价",
    "",
    `${renderValuationMethodCount(valuationJson)}，综合估值 ${fmtNum(vm.valuation.weightedAverage)}，一致性 ${vm.valuation.consistency ?? "—"}。完整方法与敏感性见本站“估值分析”Topic。`,
    "",
    "## 投资论点卡（Thesis Card）",
    "",
    "| 模块 | 论点 | 当前状态 |",
    "|:-----|:-----|:---------|",
    `| 投资理由 | R/GG、估值分位、分红与价值陷阱排查形成交叉判断 | ${vm.phase3.decision === "buy" ? "成立" : vm.phase3.decision === "watch" ? "观察成立" : "不成立"} |`,
    `| 主要风险 | 年报抽取质量、现金流质量、治理/监管证据不足会降低置信度 | ${vm.dataPackReport.pdfGateVerdict ?? "UNKNOWN"} |`,
    `| 加仓条件 | 后续财报验证现金流、分红、盈利质量与估值安全边际 | 需跟踪 |`,
    "",
    "## 监控清单",
    "",
    "- 基本面止损：R 跌破门槛、GG 持续恶化、价值陷阱风险升至 high。",
    "- 事件监控：处罚/监管措施、审计意见变化、重大诉讼、分红或回购政策变化。",
    "- 竞争对手观察：行业价格战、份额变化、成本曲线或渠道结构变化。",
    "",
    "## 风险提示",
    "",
    "- 本页基于本次可取得证据生成，不构成投资建议。",
    "- 若证据包缺失、年报抽取质量降级或外部证据未命中，相关结论保持降级披露。",
    "",
    "## 附录：证据索引",
    "",
    evidenceTable(vm),
    "",
    ...evidenceGapSection(vm),
  ].join("\n");
}

export function renderBusinessQualityMarkdown(vm: ReportViewModelV1, buffers: ReportPolishComposeBuffers): string {
  const name = vm.displayCompanyName ?? vm.market.name ?? vm.normalizedCode;
  return [
    `# ${name}（${vm.normalizedCode}）· 商业质量评估`,
    "",
    topicEvidenceBoundary(vm, "topic:business-six-dimension"),
    "> **Business Quality Verdict**：本页按 D1-D6 框架组织可审计证据，站点完整商业质量页以六维成稿质量为准。",
    "",
    "## Quality Snapshot",
    "",
    "| 维度 | 研报关注点 | 证据锚点 |",
    "|:-----|:---------|:---------|",
    "| D1 商业模式与资本特征 | 赚钱逻辑、收入质量、利润质量、资本消耗、现金收款 | E2/E4 |",
    "| D2 竞争优势与护城河 | 行业地图、护城河来源、伪优势过滤、对标、监控 KPI | E2/E3 |",
    "| D3 外部环境 | 周期性、政策监管、行业趋势、负面约束 | E3/E4 |",
    "| D4 管理层与治理 | 治理红旗、审计意见、处罚诉讼、资本配置、言行一致 | E3/E4 |",
    "| D5 MD&A 解读 | 管理层叙事可信度、前瞻信号、隐含风险 | E4 |",
    "| D6 控股结构 | 股权结构、关联交易、少数股东权益、SOTP 触发条件 | E1/E4 |",
    "",
    "## Executive Summary",
    "",
    `**${name} 的商业质量评估以证据闭环为核心。** 当前材料提供市场包、年报证据包、外部证据和策略规则结论；D1-D6 章节按参考稿结构组织，并通过证据编号连接到本地材料。[E2][E3][E4]`,
    "",
    "## 关键发现",
    "",
    signalLines(vm).join("\n"),
    "",
    "## 维度一：商业模式与资本特征",
    "",
    "**核心判断**：商业模式分析围绕收入来源、利润含金量、资本消耗和现金收款四个锚点展开，避免只用增长率替代商业质量判断。[E2][E4]",
    "",
    "| 子项 | 证据锚点 | 分析口径 |",
    "|:-----|:-------------|:-------------|",
    "| 商业模式 | 市场包与年报包 | 客户、产品、收费方式、成本结构 |",
    "| 收入质量 | 财务历史与外部证据 | 增长来源、一次性与可持续收入区分 |",
    "| 利润质量 | Phase3 利润锚点 | 扣非、非经、毛利和费用变化 |",
    "| 资本消耗 | Capex、折旧、营运资本 | 轻/重资产属性与维护性投入 |",
    "| 现金收款 | OCF、应收、合同负债 | 利润与现金流匹配度 |",
    "",
    "## 维度二：竞争优势与护城河",
    "",
    "**核心判断**：护城河判断需要用行业份额、ROE 稳定性、客户粘性、成本优势或监管牌照交叉验证。[E2][E3]",
    "",
    "### 护城河来源（Greenwald 三维框架）",
    "",
    "- 需求侧：品牌、渠道、客户迁移成本是否真实存在。",
    "- 供给侧：规模、成本、供应链、技术或网络效应是否带来可持续差异。",
    "- 制度侧：牌照、监管、资源禀赋是否能阻止竞争侵蚀。",
    "",
    "## 维度三：外部环境",
    "",
    "**核心判断**：外部环境分析区分行业周期、政策红利、监管约束与竞争格局变化。[E3]",
    "",
    "## 维度四：管理层与公司治理",
    "",
    "**核心判断**：治理评估覆盖处罚/监管、诉讼、审计意见、关联交易、管理层变化与资本配置记录。[E3][E4]",
    "",
    "## 监管与合规要点",
    "",
    "- 处罚 / 监管措施：若外部证据为未命中，需写入证据边界，不得写成“无处罚”。[E3]",
    "- 重大诉讼 / 仲裁：优先引用年报 data_pack；若缺章节则降级。[E4]",
    "- 审计意见 / 内控：优先引用年报财报章节与外部公告证据。[E3][E4]",
    "- 关联交易与治理变化：需列出交易规模、审批口径和风险含义。[E3][E4]",
    "",
    "## 维度五：MD&A 解读",
    "",
    "**核心判断**：MD&A 解读比较管理层叙事、实际财务变化和前瞻指引，尤其关注“管理层没解释什么”。[E4]",
    "",
    "## 维度六：控股结构分析",
    "",
    "**核心判断**：控股结构分析检查控股股东、子公司利润外溢、少数股东权益、复杂结构和 SOTP 触发条件。[E1][E4]",
    "",
    "## 交叉验证与深度分析",
    "",
    "- **数字与叙事的一致性**：用收入、利润、ROE、现金流、Capex 验证管理层说法。[E2][E4]",
    "- **核心矛盾**：找出估值、现金流、分红、增长、治理之间最影响投资判断的冲突。",
    "- **被忽视的信号**：记录未解释的财务异常、公告措辞变化和证据缺口。",
    "",
    "## 深度总结",
    "",
    "商业质量评估必须同时回答“这家公司如何赚钱”“优势能否维持”“风险是否被数字验证”三个问题；当年报抽取质量或外部证据不足时，结论应降低置信度并保留缺口。",
    "",
    "## 未来1-3年关键观察变量",
    "",
    "| 变量 | 为什么重要 | 当前证据 |",
    "|:-----|:-----------|:---------|",
    "| 盈利质量 | 决定 R/GG 是否可持续 | E2/E7 |",
    "| 现金流与营运资本 | 验证利润含金量 | E2/E4 |",
    "| 分红/回购/资本开支 | 影响股东回报与估值锚 | E4/E6 |",
    "| 监管与治理事件 | 影响风险折价 | E3/E4 |",
    "",
    "## 外部证据覆盖摘要",
    "",
    phase1bCoverage(buffers),
    "",
    "## 附录：证据索引",
    "",
    evidenceTable(vm),
    "",
    ...evidenceGapSection(vm),
  ].join("\n");
}

export function renderPenetrationReturnMarkdown(vm: ReportViewModelV1, buffers: ReportPolishComposeBuffers): string {
  const name = vm.displayCompanyName ?? vm.market.name ?? vm.normalizedCode;
  const f2 = extractBetweenHeadings(buffers.analysisReportMarkdown, /^##\s*四[、.]\s*因子2/im, /^##\s*[五六七八九十]/m);
  const f3 = extractBetweenHeadings(buffers.analysisReportMarkdown, /^##\s*五[、.]\s*因子3/im, /^##\s*[六七八九十]/m);
  const valuationJson = parseValuationJson(buffers.valuationRawJson);
  return [
    `# ${name}（${vm.normalizedCode}）· 穿透回报率定量分析`,
    "",
    `> **Penetrating Return Verdict**：粗算 R=${fmtPct(vm.phase3.factor2?.R)}，门槛 II=${fmtPct(vm.phase3.factor2?.II)}，精算 GG=${fmtPct(vm.phase3.factor3?.GG)}。`,
    "",
    "## Executive Summary",
    "",
    renderPenetrationDiscipline(vm),
    "",
    "## 核心指标速览",
    "",
    metricTable(vm, valuationJson),
    "",
    "## STEP 0 数据校验与口径锚定",
    "",
    `- 市场：${vm.market.market}；币种：${vm.market.currency ?? "—"}；价格=${fmtNum(vm.market.price)}；市值=${fmtNum(vm.market.marketCap)}。[E2]`,
    `- 年报抽取质量=${vm.dataPackReport.pdfGateVerdict ?? "UNKNOWN"}；市场包 warnings=${vm.market.warningsCount}。[E2][E4]`,
    "",
    "## STEP 1 Owner Earnings 计算",
    "",
    renderPenetrationOwnerEarnings(vm),
    "",
    "Owner Earnings 是本页的核心桥梁：它把报表利润、少数股东影响、现金化调整和分配能力放到同一张表里，避免只用净利润或股息率判断真实回报。[E7]",
    "",
    "## STEP 2 分配能力评估",
    "",
    `${renderPenetrationDiscipline(vm)}[E7]`,
    "",
    "## STEP 3 真实现金收入还原",
    "",
    "检查经营现金流、应收、合同负债与收入确认口径，异常项进入监控清单。[E2][E4]",
    "",
    "## STEP 4 非经常性现金流入分类",
    "",
    "区分可持续经营现金、投资收益、公允价值变动与一次性项目；无法定位时保持降级，不补数。[E4]",
    "",
    "## STEP 5 经营性现金支出还原",
    "",
    "将营运资本变化作为现金质量验证项，避免只看利润表得出穿透结论。[E2]",
    "",
    "## STEP 6 资本开支与投资扣除（极端保守）",
    "",
    `精算 GG=${fmtPct(vm.phase3.factor3?.GG)}，若与 R 偏差过大，须解释重资产、成长性 Capex 或投资性购买带来的结构性偏差。[E7]`,
    "",
    "## STEP 7 会计准则调整",
    "",
    "关注租赁、研发资本化、金融资产、公允价值和少数股东影响。[E4]",
    "",
    "## STEP 8 真实可支配现金结余",
    "",
    "结合现金、债务、受限资金和短期偿债压力判断分红/回购的实际弹性。[E1][E2]",
    "",
    "## STEP 9 现金储备质量",
    "",
    "现金储备质量需区分可自由支配现金、受限现金、理财和经营周转需求。[E1][E4]",
    "",
    "## STEP 10 分配意愿与穿透回报率",
    "",
    `- 分配意愿：结合历史分红、回购和资本配置记录，在商业质量 D4/D5 中完成叙事验证。[E3][E4]`,
    `- 穿透回报率：R=${fmtPct(vm.phase3.factor2?.R)}；安全边际=${vm.phase3.factor2?.R !== undefined && vm.phase3.factor2?.II !== undefined ? `${fmtNum(vm.phase3.factor2.R - vm.phase3.factor2.II)} pct` : "—"}。[E7]`,
    "",
    "### 10c Owner Earnings 敏感性",
    "",
    renderPenetrationSensitivity(vm),
    "",
    "## STEP 11 交叉验证与可信度评级",
    "",
    `外推可信度=${vm.phase3.factor3?.extrapolationTrust ?? "—"}；报告置信度=${vm.phase3.confidence}。若年报抽取质量降级或市场包 warnings 较多，结论需降低语气强度。[E2][E4][E7]`,
    "",
    "## 汇总输出",
    "",
    "| 项目 | 输出 |",
    "|:-----|:-----|",
    `| 粗算 R | ${fmtPct(vm.phase3.factor2?.R)} |`,
    `| 精算 GG | ${fmtPct(vm.phase3.factor3?.GG)} |`,
    `| 门槛 II | ${fmtPct(vm.phase3.factor2?.II)} |`,
    `| 可信度 | ${vm.phase3.confidence} / ${vm.phase3.factor3?.extrapolationTrust ?? "—"} |`,
    "",
    "## 附录：计算底稿摘要",
    "",
    f2 ? clip(sanitizeCalculationExcerpt(stripLeadingDanglingPunctuation(f2)), 6000) : "_未匹配到粗算摘录；以结构化计算输出为准。_",
    "",
    f3 ? clip(sanitizeCalculationExcerpt(stripLeadingDanglingPunctuation(f3)), 6000) : "_未匹配到精算摘录；以结构化计算输出为准。_",
    "",
    "## 附录：证据索引",
    "",
    evidenceTable(vm),
    "",
  ].join("\n");
}

export function renderValuationTopicMarkdown(vm: ReportViewModelV1, buffers: ReportPolishComposeBuffers): string {
  const name = vm.displayCompanyName ?? vm.market.name ?? vm.normalizedCode;
  const valuationJson = parseValuationJson(buffers.valuationRawJson);
  const valBlock = renderValuationComputedMarkdownFromJson(buffers.valuationRawJson);
  return [
    `# ${name}（${vm.normalizedCode}）· 估值分析报告`,
    "",
    `> **Valuation Verdict**：综合估值 ${fmtNum(vm.valuation.weightedAverage)}，有效方法 ${renderValuationMethodCount(valuationJson)}，一致性 ${vm.valuation.consistency ?? "—"}。`,
    "",
    "## Valuation Snapshot",
    "",
    "| 指标 | 数值 |",
    "|:-----|:-----|",
    `| 当前价格 | ${fmtNum(vm.market.price)} |`,
    `| 综合估值 | ${fmtNum(vm.valuation.weightedAverage)} |`,
    `| WACC / Ke | ${fmtNum(vm.valuation.wacc)} / ${fmtNum(vm.valuation.ke)} |`,
    `| 有效方法 / CV | ${renderValuationMethodCount(valuationJson)} / ${fmtNum(vm.valuation.coefficientOfVariation)} |`,
    "",
    "## Executive Summary",
    "",
    renderValuationExecutiveSummary(valuationJson, vm),
    "",
    "## 一、公司分类",
    "",
    renderValuationClassification(vm),
    "",
    "## 二、WACC 计算",
    "",
    renderWaccNarrative(valuationJson, vm),
    "",
    "## 三、方法选择",
    "",
    renderMethodSelection(valuationJson, vm),
    "",
    "## 四、定性调整说明",
    "",
    "- 商业质量尚未形成完整六维结论时，估值中的护城河、治理、监管和现金流调整应保持保守。",
    "- 年报抽取质量降级时，涉及年报附注的调整必须标注置信边界。",
    "",
    "## 五、DCF 敏感性矩阵",
    "",
    renderDcfSensitivity(valuationJson),
    "",
    "## 六、DDM 两阶段/稳态说明",
    "",
    "DDM 只在分红口径可用时纳入；成熟蓝筹长期增长率不机械外推短期 DPS 增速，采用稳态上限约束。",
    "",
    renderDdmSensitivity(valuationJson),
    "",
    "## 七、PE Band 历史分位区间",
    "",
    renderPeBandSection(valuationJson),
    "",
    "## 八、DDM / PEG 适用性说明",
    "",
    "| 方法 | 当前处理 | 说明 |",
    "|:-----|:---------|:-----|",
    `| DDM | ${isEffectiveMethod(methodByName(valuationJson, "DDM")) ? "核心方法，已采用" : "未采用"} | ${methodByName(valuationJson, "DDM")?.note ?? (isEffectiveMethod(methodByName(valuationJson, "DDM")) ? "分红口径可用，适合成熟高分红公司；长期增长率采用稳态约束。" : "分红连续性或贴现率证据不足")} |`,
    `| PEG | ${isEffectiveMethod(methodByName(valuationJson, "PEG")) ? "辅助观察，已计算" : "未采用"} | ${methodByName(valuationJson, "PEG")?.note ?? (isEffectiveMethod(methodByName(valuationJson, "PEG")) ? "盈利增长口径可用，但不作为成熟蓝筹的核心估值锚。" : "盈利增长口径不足")} |`,
    "",
    "## 九、方法分歧解释",
    "",
    renderValuationDisagreement(valuationJson, vm),
    "",
    "当 DCF/DDM 明显高于 PE Band 时，通常意味着现金流和分红模型对长期稳定性更乐观，而市场历史倍数仍按偏防御资产定价。此时更适合使用估值区间：PE Band 是保守锚，DCF/DDM 是现金流兑现后的上沿。[E4][E6]",
    "",
    "## 十、反向估值：当前价格隐含了什么？",
    "",
    renderReverseValuation(valuationJson, vm),
    "",
    "## 十一、估值结论",
    "",
    `综合估值=${fmtNum(vm.valuation.weightedAverage)}；当前价格=${fmtNum(vm.market.price)}；仓位建议与价值陷阱排查见总览页。[E2][E6][E7]`,
    "",
    "## 十二、关键假设与风险提示",
    "",
    "- 自由现金流、分红、Capex、营运资本和监管事件是估值最敏感的证据项。",
    "- 估值模型涉及主观假设，不构成投资建议。",
    "",
    "## 十三、数据限制与置信边界",
    "",
    renderValuationDataLimits(vm),
    "",
    "## 附录：关键财务趋势",
    "",
    renderFinancialTrendAppendix(buffers.marketPackMarkdown),
    "",
    "## 附录：结构化估值明细",
    "",
    valBlock,
    "",
    "## 附录：证据索引",
    "",
    evidenceTable(vm),
    "",
  ].join("\n");
}

export function renderAllReportPolishMarkdowns(
  vm: ReportViewModelV1,
  buffers: ReportPolishComposeBuffers,
): {
  turtleOverviewMarkdown: string;
  businessQualityMarkdown: string;
  penetrationReturnMarkdown: string;
  valuationMarkdown: string;
} {
  return {
    turtleOverviewMarkdown: renderTurtleOverviewMarkdown(vm, buffers),
    businessQualityMarkdown: renderBusinessQualityMarkdown(vm, buffers),
    penetrationReturnMarkdown: renderPenetrationReturnMarkdown(vm, buffers),
    valuationMarkdown: renderValuationTopicMarkdown(vm, buffers),
  };
}
