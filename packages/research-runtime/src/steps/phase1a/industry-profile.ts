import type {
  CompanyOperationSignal,
  CompanyOperationsSnapshot,
  DataPackMarket,
  IndustryKpiSignal,
  IndustryProfileConfidence,
  IndustryProfileId,
  IndustryProfileMatchedBy,
  IndustryProfileSnapshot,
} from "@trade-signal/schema-core";

type ProfileKpiDefinition = {
  key: string;
  label: string;
  keywords: RegExp;
};

type ProfileDefinition = {
  id: IndustryProfileId;
  label: string;
  industryKeywords: RegExp;
  kpis: ProfileKpiDefinition[];
};

export const INDUSTRY_PROFILE_DEFINITIONS: Record<IndustryProfileId, ProfileDefinition> = {
  generic: {
    id: "generic",
    label: "通用",
    industryKeywords: /.+/u,
    kpis: [],
  },
  telecom: {
    id: "telecom",
    label: "电信运营",
    industryKeywords: /电信|通信服务|通信运营|运营商|移动通信|宽带|IDC|云计算|算力|DICT/u,
    kpis: [
      { key: "mobile_customers", label: "移动客户", keywords: /移动客户|移动用户|手机客户/u },
      { key: "five_g_customers", label: "5G 客户", keywords: /5G|第五代移动通信/u },
      { key: "broadband_customers", label: "宽带客户", keywords: /宽带客户|宽带用户|有线宽带|覆盖住户/u },
      { key: "arpu", label: "ARPU", keywords: /ARPU|每用户平均收入/u },
      { key: "dict_enterprise", label: "政企/DICT", keywords: /DICT|政企|产业数字化|信息化收入|行业数智服务/u },
      { key: "cloud_compute", label: "算力/云收入", keywords: /算力|云收入|移动云|云业务|IDC/u },
      { key: "capex", label: "资本开支", keywords: /资本开支|CAPEX|投资规模|网络投资|投资共计|算力网络投资/u },
    ],
  },
  dairy_food: {
    id: "dairy_food",
    label: "乳品与食品饮料",
    industryKeywords: /乳品|乳制品|奶|食品|饮料|白酒|调味品|预制菜|农副食品|消费品/u,
    kpis: [
      { key: "product_mix", label: "产品分部", keywords: /产品结构|分部收入|主营构成|液态奶|奶粉|冷饮|食品|饮料/u },
      { key: "channel_region", label: "渠道/区域", keywords: /渠道|经销|直营|电商|区域|华东|华南|华北/u },
      { key: "dealer", label: "经销商", keywords: /经销商|渠道商|终端网点/u },
      { key: "inventory", label: "库存", keywords: /库存|存货|周转/u },
      { key: "raw_material", label: "原料/包材", keywords: /原奶|奶源|包材|原材料|采购成本/u },
      { key: "food_safety", label: "食品安全", keywords: /食品安全|抽检|质量安全|召回|处罚/u },
    ],
  },
  bank: {
    id: "bank",
    label: "银行",
    industryKeywords: /银行|商业银行|农商行|城商行|股份行/u,
    kpis: [
      { key: "nim", label: "净息差", keywords: /净息差|NIM/u },
      { key: "npl", label: "不良率", keywords: /不良贷款率|不良率/u },
      { key: "provision_coverage", label: "拨备覆盖率", keywords: /拨备覆盖率/u },
      { key: "loan_deposit_mix", label: "贷款/存款结构", keywords: /贷款|存款|存贷/u },
      { key: "capital_adequacy", label: "资本充足率", keywords: /资本充足率|核心一级资本/u },
    ],
  },
  insurance: {
    id: "insurance",
    label: "保险",
    industryKeywords: /保险|寿险|财险|再保险/u,
    kpis: [
      { key: "nbv", label: "新业务价值", keywords: /新业务价值|NBV/u },
      { key: "premium_mix", label: "保费结构", keywords: /保费|首年期交|续期/u },
      { key: "combined_ratio", label: "综合成本率", keywords: /综合成本率|赔付率/u },
      { key: "solvency", label: "偿付能力", keywords: /偿付能力|综合偿付能力充足率/u },
      { key: "investment_yield", label: "投资收益率", keywords: /投资收益率|总投资收益/u },
    ],
  },
  manufacturing: {
    id: "manufacturing",
    label: "制造业",
    industryKeywords: /制造|设备|机械|电子|汽车|化工|材料|工业/u,
    kpis: [
      { key: "capacity", label: "产能", keywords: /产能|产线|产量/u },
      { key: "sales_volume", label: "销量", keywords: /销量|产销量|出货/u },
      { key: "orders", label: "订单", keywords: /订单|在手订单|合同负债/u },
      { key: "price", label: "单价", keywords: /单价|均价|ASP/u },
      { key: "inventory", label: "库存", keywords: /存货|库存/u },
      { key: "capex", label: "资本开支", keywords: /资本开支|固定资产投资|在建工程/u },
    ],
  },
  real_estate: {
    id: "real_estate",
    label: "房地产",
    industryKeywords: /房地产|地产|物业开发|住宅开发/u,
    kpis: [
      { key: "contract_sales", label: "销售额", keywords: /销售额|合同销售|签约销售/u },
      { key: "land_bank", label: "土储", keywords: /土地储备|土储/u },
      { key: "delivery", label: "竣工交付", keywords: /竣工|交付/u },
      { key: "financing_cost", label: "融资成本", keywords: /融资成本|借款利率/u },
      { key: "advance_receipts", label: "预收款", keywords: /预收款|合同负债/u },
      { key: "guarantee", label: "担保", keywords: /担保/u },
    ],
  },
  pharma_healthcare: {
    id: "pharma_healthcare",
    label: "医药健康",
    industryKeywords: /医药|医疗|生物|制药|医院|器械|CXO/u,
    kpis: [
      { key: "pipeline", label: "研发管线", keywords: /研发管线|临床|管线/u },
      { key: "approval", label: "注册批件", keywords: /注册批件|获批|批准文号/u },
      { key: "vbp", label: "集采", keywords: /集采|集中采购/u },
      { key: "medical_insurance", label: "医保", keywords: /医保|医保目录/u },
      { key: "device_registration", label: "器械注册", keywords: /医疗器械注册|备案/u },
    ],
  },
  energy_utility: {
    id: "energy_utility",
    label: "能源公用",
    industryKeywords: /电力|能源|公用事业|燃气|水务|煤炭|石油|天然气|新能源/u,
    kpis: [
      { key: "installed_capacity", label: "装机", keywords: /装机|权益装机/u },
      { key: "power_generation", label: "发电量", keywords: /发电量|售电量/u },
      { key: "utilization_hours", label: "利用小时", keywords: /利用小时/u },
      { key: "tariff", label: "上网电价", keywords: /上网电价|电价/u },
      { key: "fuel_price", label: "煤价/气价", keywords: /煤价|气价|燃料成本/u },
      { key: "capex", label: "资本开支", keywords: /资本开支|投资/u },
    ],
  },
};

export interface ResolveIndustryProfileInput {
  explicitProfileId?: IndustryProfileId;
  instrumentIndustry?: string;
  peerIndustryName?: string;
  industryCycleName?: string;
  companyOperationsSnapshot?: CompanyOperationsSnapshot;
  annualReportHints?: string[];
}

function sanitizeSnippet(text: string, max = 120, pattern?: RegExp): string {
  const clean = text.replace(/\s+/gu, " ").replace(/\|/gu, "/").trim();
  if (!pattern) return clean.slice(0, max);
  const matched = clean.match(pattern);
  if (matched?.index == null) return clean.slice(0, max);
  const start = Math.max(0, matched.index - Math.floor(max * 0.35));
  return clean.slice(start, start + max);
}

function gatherOperationSignals(snapshot?: CompanyOperationsSnapshot): CompanyOperationSignal[] {
  const groups = snapshot?.signalGroups;
  const grouped = [
    ...(groups?.businessStructure ?? []),
    ...(groups?.operatingMetrics ?? []),
    ...(groups?.shareholderReturns ?? []),
    ...(groups?.themes ?? []),
    ...(groups?.industry ?? []),
  ];
  const rawSignals: CompanyOperationSignal[] = [
    ...(snapshot?.businessHighlights ?? []),
    ...(snapshot?.themeSignals ?? []),
  ]
    .map((item): CompanyOperationSignal | undefined => {
      const record = item as Record<string, unknown>;
      const summary = String(
        record.mainPointContent ?? record.selectedReason ?? record.summary ?? record.content ?? "",
      ).trim();
      if (!summary) return undefined;
      const label = String(record.keyword ?? record.boardName ?? record.label ?? "经营线索");
      return {
        label,
        category: /分红|股利|派息|利润分配/u.test(`${label}\n${summary}`)
          ? "shareholder_return"
          : /概念|算力|数据中心|5G|6G|云|DICT/u.test(`${label}\n${summary}`)
            ? "theme"
            : /行业|定位/u.test(label)
              ? "industry"
              : "operating_metric",
        summary,
        source: snapshot?.source ?? "company_operations",
        confidence: "medium",
      };
    })
    .filter((signal): signal is CompanyOperationSignal => Boolean(signal));
  const all = [...(snapshot?.signals ?? []), ...grouped, ...rawSignals];
  const seen = new Set<string>();
  return all.filter((signal) => {
    const key = `${signal.category}:${signal.label}:${signal.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function textCorpus(input: ResolveIndustryProfileInput): string {
  const opSignals = gatherOperationSignals(input.companyOperationsSnapshot)
    .map((s) => `${s.label} ${s.summary}`)
    .join("\n");
  const rawItems = [
    ...(input.companyOperationsSnapshot?.businessHighlights ?? []),
    ...(input.companyOperationsSnapshot?.themeSignals ?? []),
  ]
    .map((item) => Object.values(item).join(" "))
    .join("\n");
  return [
    input.instrumentIndustry,
    input.peerIndustryName,
    input.industryCycleName,
    opSignals,
    rawItems,
    ...(input.annualReportHints ?? []),
  ]
    .filter(Boolean)
    .join("\n");
}

function matchProfileFromText(text: string): IndustryProfileId {
  for (const def of Object.values(INDUSTRY_PROFILE_DEFINITIONS)) {
    if (def.id === "generic") continue;
    if (def.industryKeywords.test(text)) return def.id;
  }
  return "generic";
}

function resolveProfileId(input: ResolveIndustryProfileInput): {
  profileId: IndustryProfileId;
  matchedBy: IndustryProfileMatchedBy;
  industryName?: string;
} {
  if (input.explicitProfileId) {
    return { profileId: input.explicitProfileId, matchedBy: "explicit", industryName: input.instrumentIndustry };
  }
  const sources: Array<{ text?: string; matchedBy: IndustryProfileMatchedBy }> = [
    { text: input.instrumentIndustry, matchedBy: "instrument" },
    { text: input.peerIndustryName, matchedBy: "peer_pool" },
    { text: input.industryCycleName, matchedBy: "industry_cycle" },
  ];
  for (const source of sources) {
    if (!source.text) continue;
    const profileId = matchProfileFromText(source.text);
    if (profileId !== "generic") return { profileId, matchedBy: source.matchedBy, industryName: source.text };
  }
  const operationsProfile = matchProfileFromText(textCorpus(input));
  if (operationsProfile !== "generic") {
    return {
      profileId: operationsProfile,
      matchedBy: input.companyOperationsSnapshot ? "company_operations" : "annual_report",
      industryName: input.instrumentIndustry ?? input.peerIndustryName ?? input.industryCycleName,
    };
  }
  return {
    profileId: "generic",
    matchedBy: "fallback",
    industryName: input.instrumentIndustry ?? input.peerIndustryName ?? input.industryCycleName,
  };
}

function operationSourceRefs(snapshot?: CompanyOperationsSnapshot): string[] {
  const refs = new Set<string>();
  if (snapshot?.source) refs.add(snapshot.source);
  for (const signal of gatherOperationSignals(snapshot)) {
    if (typeof signal.source === "string" && signal.source.trim()) refs.add(signal.source);
  }
  return [...refs].slice(0, 8);
}

function signalSource(signal: CompanyOperationSignal, snapshot?: CompanyOperationsSnapshot): string {
  if (typeof signal.source === "string" && signal.source.trim()) return signal.source;
  if (snapshot?.source) return snapshot.source;
  return "company_operations";
}

function scoreSignalForKpi(signal: CompanyOperationSignal, kpi: ProfileKpiDefinition): number {
  const haystack = `${signal.label}\n${signal.summary}`;
  if (!kpi.keywords.test(haystack)) return -1;
  let score = 0;
  if (kpi.keywords.test(signal.label)) score += 6;
  if (signal.category === "operating_metric") score += 4;
  if (signal.category === "theme") score += 3;
  if (signal.category === "business_structure") score += 1;
  if (/\d/u.test(signal.summary)) score += 3;
  if (signal.summary.length <= 180) score += 1;
  return score;
}

function bestSignalForKpi(ops: CompanyOperationSignal[], kpi: ProfileKpiDefinition): CompanyOperationSignal | undefined {
  return ops
    .map((signal) => ({ signal, score: scoreSignalForKpi(signal, kpi) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.signal;
}

function buildKpiSignals(
  profileId: IndustryProfileId,
  snapshot?: CompanyOperationsSnapshot,
): { signals: IndustryKpiSignal[]; missing: string[] } {
  const def = INDUSTRY_PROFILE_DEFINITIONS[profileId];
  if (!def || profileId === "generic") return { signals: [], missing: [] };
  const ops = gatherOperationSignals(snapshot);
  const signals: IndustryKpiSignal[] = [];
  const missing: string[] = [];
  for (const kpi of def.kpis) {
    const matched = bestSignalForKpi(ops, kpi);
    if (matched) {
      signals.push({
        key: kpi.key,
        label: kpi.label,
        summary: sanitizeSnippet(matched.summary, 120, kpi.keywords),
        source: signalSource(matched, snapshot),
        confidence: matched.confidence,
      });
    } else {
      missing.push(kpi.key);
    }
  }
  return { signals, missing };
}

function resolveConfidence(input: {
  profileId: IndustryProfileId;
  matchedBy: IndustryProfileMatchedBy;
  totalKpis: number;
  signalsCount: number;
}): IndustryProfileConfidence {
  if (input.profileId === "generic") return "low";
  if (input.matchedBy === "explicit" && input.signalsCount > 0) return "high";
  if (input.totalKpis > 0 && input.signalsCount / input.totalKpis >= 0.45) return "high";
  if (input.signalsCount > 0) return "medium";
  return input.matchedBy === "fallback" ? "low" : "medium";
}

export function resolveIndustryProfileSnapshot(input: ResolveIndustryProfileInput): IndustryProfileSnapshot {
  const resolved = resolveProfileId(input);
  const { signals, missing } = buildKpiSignals(resolved.profileId, input.companyOperationsSnapshot);
  const totalKpis = INDUSTRY_PROFILE_DEFINITIONS[resolved.profileId]?.kpis.length ?? 0;
  const sourceRefs = new Set<string>(operationSourceRefs(input.companyOperationsSnapshot));
  if (input.instrumentIndustry) sourceRefs.add("instrument.industry");
  if (input.peerIndustryName) sourceRefs.add("peerComparablePool.industryName");
  if (input.industryCycleName) sourceRefs.add("industryCycleSnapshot.industryName");
  if (input.annualReportHints?.length) sourceRefs.add("annual_report_hints");
  return {
    profileId: resolved.profileId,
    industryName: resolved.industryName,
    confidence: resolveConfidence({
      profileId: resolved.profileId,
      matchedBy: resolved.matchedBy,
      totalKpis,
      signalsCount: signals.length,
    }),
    matchedBy: resolved.matchedBy,
    kpiSignals: signals,
    missingKpis: missing,
    sourceRefs: [...sourceRefs],
  };
}

export function resolveIndustryProfileForDataPack(
  dataPack: Pick<
    DataPackMarket,
    "instrument" | "peerComparablePool" | "industryCycleSnapshot" | "companyOperationsSnapshot"
  >,
  explicitProfileId?: IndustryProfileId,
): IndustryProfileSnapshot {
  return resolveIndustryProfileSnapshot({
    explicitProfileId,
    instrumentIndustry: dataPack.instrument.industry,
    peerIndustryName: dataPack.peerComparablePool?.industryName,
    industryCycleName: dataPack.industryCycleSnapshot?.industryName,
    companyOperationsSnapshot: dataPack.companyOperationsSnapshot,
  });
}
