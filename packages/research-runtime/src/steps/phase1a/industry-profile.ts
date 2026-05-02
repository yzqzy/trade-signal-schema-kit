import type {
  CompanyOperationSignal,
  CompanyOperationsSnapshot,
  DataPackMarket,
  IndustryKpiSignal,
  IndustryProfileConfidence,
  IndustryProfileId,
  IndustryProfileMatchedBy,
  IndustryProfileSnapshot,
  SwIndustryClassification,
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

type SwProfileRule = {
  level1: string;
  profileId: IndustryProfileId;
  level2Hint?: RegExp;
};

const SW_L1_PROFILE_RULES: SwProfileRule[] = [
  { level1: "银行", profileId: "bank" },
  { level1: "通信", profileId: "telecom" },
  { level1: "食品饮料", profileId: "consumer_food" },
  { level1: "公用事业", profileId: "energy_utility" },
  { level1: "煤炭", profileId: "energy_utility" },
  { level1: "石油石化", profileId: "energy_utility" },
  { level1: "医药生物", profileId: "pharma_healthcare" },
  { level1: "房地产", profileId: "real_estate" },
  { level1: "机械设备", profileId: "manufacturing" },
  { level1: "电子", profileId: "manufacturing" },
  { level1: "汽车", profileId: "manufacturing" },
  { level1: "基础化工", profileId: "manufacturing" },
  { level1: "有色金属", profileId: "manufacturing" },
  { level1: "钢铁", profileId: "manufacturing" },
  { level1: "国防军工", profileId: "manufacturing" },
  { level1: "建筑材料", profileId: "manufacturing" },
  { level1: "建筑装饰", profileId: "manufacturing" },
  { level1: "轻工制造", profileId: "manufacturing" },
  { level1: "家用电器", profileId: "manufacturing" },
  { level1: "纺织服饰", profileId: "manufacturing" },
  { level1: "非银金融", profileId: "insurance", level2Hint: /保险/u },
  { level1: "商贸零售", profileId: "consumer_food", level2Hint: /食品|超市|电商|零售/u },
  { level1: "农林牧渔", profileId: "consumer_food", level2Hint: /食品加工|农产品加工|乳品|肉制品|预制菜/u },
  { level1: "电力设备", profileId: "energy_utility", level2Hint: /电池|电网|能源|风电|光伏/u },
  { level1: "电力设备", profileId: "manufacturing" },
  { level1: "交通运输", profileId: "transportation_logistics" },
  { level1: "计算机", profileId: "software_it" },
  { level1: "传媒", profileId: "media_entertainment" },
  { level1: "环保", profileId: "environmental_services" },
  { level1: "美容护理", profileId: "beauty_personalcare" },
  { level1: "社会服务", profileId: "consumer_services" },
];

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
  consumer_food: {
    id: "consumer_food",
    label: "消费食品与食品饮料",
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
  transportation_logistics: {
    id: "transportation_logistics",
    label: "交通运输与物流",
    industryKeywords: /交通运输|物流|快递|港口|航空|机场|铁路|公路|航运|客运|货运/u,
    kpis: [
      { key: "freight_passenger_volume", label: "货运/客运量", keywords: /货运量|客运量|旅客吞吐量|货邮吞吐量|运输量/u },
      { key: "freight_rate", label: "运价", keywords: /运价|票价|单价|费率|航线收入/u },
      { key: "turnover_volume", label: "周转量", keywords: /周转量|货物周转|旅客周转/u },
      { key: "unit_cost", label: "单位成本", keywords: /单位成本|单公里成本|单位运输成本/u },
      { key: "fuel_cost", label: "燃油成本", keywords: /燃油|油价|航油|燃料成本/u },
      { key: "capex", label: "资本开支", keywords: /资本开支|固定资产投资|运力投放|机队|船队/u },
      { key: "throughput", label: "吞吐量", keywords: /吞吐量|集装箱|TEU|货邮/u },
    ],
  },
  software_it: {
    id: "software_it",
    label: "软件与信息技术",
    industryKeywords: /计算机|软件|信息技术|云服务|SaaS|系统集成|信创|数据服务/u,
    kpis: [
      { key: "software_service_revenue", label: "软件/服务收入", keywords: /软件收入|服务收入|云服务|技术服务|系统集成/u },
      { key: "project_delivery", label: "项目交付", keywords: /项目交付|验收|实施|交付周期/u },
      { key: "arr_subscription", label: "ARR/订阅", keywords: /ARR|订阅|续费|SaaS|经常性收入/u },
      { key: "rd_investment", label: "研发投入", keywords: /研发投入|研发费用|研发人员/u },
      { key: "revenue_per_employee", label: "人均产出", keywords: /人均产出|人均收入|员工人数/u },
      { key: "receivables_contract_liabilities", label: "应收与合同负债", keywords: /应收账款|合同负债|回款|账期/u },
      { key: "customer_concentration", label: "政府/大客户依赖", keywords: /政府客户|大客户|客户集中|前五大客户/u },
    ],
  },
  media_entertainment: {
    id: "media_entertainment",
    label: "传媒与内容娱乐",
    industryKeywords: /传媒|广告|游戏|影视|出版|院线|内容|版权|IP/u,
    kpis: [
      { key: "advertising_revenue", label: "广告收入", keywords: /广告收入|营销服务|广告业务/u },
      { key: "content_cost", label: "内容/版权成本", keywords: /内容成本|版权|采购成本|制作成本/u },
      { key: "traffic_users", label: "用户/流量", keywords: /用户数|活跃用户|MAU|DAU|流量/u },
      { key: "game_gross_billing", label: "游戏流水", keywords: /游戏流水|充值流水|流水/u },
      { key: "box_office", label: "院线/票房", keywords: /票房|观影人次|影院|银幕/u },
      { key: "ip_pipeline", label: "IP 储备", keywords: /IP|版权储备|内容储备|片单/u },
      { key: "regulatory_approval", label: "监管版号", keywords: /版号|审批|监管|许可证/u },
    ],
  },
  environmental_services: {
    id: "environmental_services",
    label: "环保运营与服务",
    industryKeywords: /环保|污水|固废|危废|垃圾焚烧|环卫|水处理|生态修复/u,
    kpis: [
      { key: "treatment_volume", label: "处理量", keywords: /处理量|处置量|焚烧量|污水处理/u },
      { key: "operating_scale", label: "项目运营规模", keywords: /运营项目|运营规模|在运|投运/u },
      { key: "tariff_subsidy", label: "补贴/电价/处置费", keywords: /补贴|上网电价|处置费|服务费|垃圾处理费/u },
      { key: "receivable_collection", label: "应收回款", keywords: /应收账款|回款|账龄|坏账/u },
      { key: "bot_ppp", label: "BOT/PPP 项目", keywords: /BOT|PPP|特许经营| concession/u },
      { key: "capex", label: "资本开支", keywords: /资本开支|在建工程|项目投资/u },
      { key: "environmental_penalty", label: "环保处罚", keywords: /环保处罚|行政处罚|排污|超标/u },
    ],
  },
  beauty_personalcare: {
    id: "beauty_personalcare",
    label: "美容护理与个护消费",
    industryKeywords: /美容护理|化妆品|个护|护肤|医美|品牌消费/u,
    kpis: [
      { key: "brand_matrix", label: "品牌矩阵", keywords: /品牌矩阵|核心品牌|品牌收入/u },
      { key: "channel_mix", label: "渠道结构", keywords: /渠道|经销|直营|线上|线下|电商/u },
      { key: "online_ratio", label: "线上占比", keywords: /线上占比|电商收入|线上渠道/u },
      { key: "repurchase_membership", label: "复购/会员", keywords: /复购|会员|私域|用户留存/u },
      { key: "gross_margin", label: "毛利率", keywords: /毛利率|高毛利|产品结构/u },
      { key: "marketing_ratio", label: "营销费用率", keywords: /销售费用率|营销费用|推广费|投放/u },
      { key: "product_quality", label: "监管/产品质量", keywords: /产品质量|抽检|处罚|备案|注册/u },
    ],
  },
  consumer_services: {
    id: "consumer_services",
    label: "社会服务与线下消费",
    industryKeywords: /社会服务|酒店|餐饮|旅游|景区|教育|免税|人力资源|会展/u,
    kpis: [
      { key: "store_hotel_scenic_count", label: "门店/酒店/景区", keywords: /门店|酒店|景区|网点|校区/u },
      { key: "traffic", label: "客流", keywords: /客流|游客|接待人次|到店/u },
      { key: "customer_spend", label: "客单价", keywords: /客单价|人均消费|平均消费/u },
      { key: "revpar_occupancy", label: "RevPAR/入住率", keywords: /RevPAR|入住率|平均房价|ADR/u },
      { key: "franchise_direct", label: "加盟直营", keywords: /加盟|直营|特许经营/u },
      { key: "rent_labor_cost", label: "租金人工成本", keywords: /租金|人工成本|员工薪酬|门店成本/u },
      { key: "membership_repurchase", label: "会员/复购", keywords: /会员|复购|留存|活跃用户/u },
    ],
  },
};

export interface ResolveIndustryProfileInput {
  explicitProfileId?: IndustryProfileId;
  swIndustryClassification?: SwIndustryClassification;
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

function profileFromSwLevel1(sw?: SwIndustryClassification): IndustryProfileId {
  const l1 = sw?.level1Name?.trim();
  const l2 = sw?.level2Name?.trim() ?? "";
  if (!l1) return "generic";
  for (const rule of SW_L1_PROFILE_RULES) {
    if (rule.level1 !== l1) continue;
    if (rule.level2Hint && !rule.level2Hint.test(l2)) continue;
    return rule.profileId;
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
  if (input.swIndustryClassification) {
    const swProfile = profileFromSwLevel1(input.swIndustryClassification);
    return {
      profileId: swProfile,
      matchedBy: "sw_l1",
      industryName: input.swIndustryClassification?.level1Name,
    };
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
  if (input.swIndustryClassification?.level1Name) sourceRefs.add("swIndustryClassification.level1");
  if (input.swIndustryClassification?.level2Name) sourceRefs.add("swIndustryClassification.level2");
  if (input.swIndustryClassification?.level3Name) sourceRefs.add("swIndustryClassification.level3");
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
    classificationProvider: input.swIndustryClassification ? "sw" : undefined,
    swLevel1Name: input.swIndustryClassification?.level1Name,
    swLevel2Name: input.swIndustryClassification?.level2Name,
    swLevel3Name: input.swIndustryClassification?.level3Name,
    kpiSignals: signals,
    missingKpis: missing,
    sourceRefs: [...sourceRefs],
  };
}

export function resolveIndustryProfileForDataPack(
  dataPack: Pick<
    DataPackMarket,
    | "instrument"
    | "swIndustryClassification"
    | "peerComparablePool"
    | "industryCycleSnapshot"
    | "companyOperationsSnapshot"
  >,
  explicitProfileId?: IndustryProfileId,
): IndustryProfileSnapshot {
  return resolveIndustryProfileSnapshot({
    explicitProfileId,
    swIndustryClassification: dataPack.swIndustryClassification,
    instrumentIndustry: dataPack.instrument.industry,
    peerIndustryName: dataPack.peerComparablePool?.industryName,
    industryCycleName: dataPack.industryCycleSnapshot?.industryName,
    companyOperationsSnapshot: dataPack.companyOperationsSnapshot,
  });
}
