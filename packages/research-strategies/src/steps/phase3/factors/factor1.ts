import type { DataPackMarketParsed, DataPackReportParsed, Factor1AResult, Factor1BResult } from "../types.js";

const CHECK_ITEMS = [
  "审计意见异常",
  "频繁更换审计师",
  "财务造假或重大违规前科",
  "看不懂",
  "商业模式未被验证",
  "控股股东重大负面信号",
] as const;

function hasRiskHint(text: string, keys: string[]): boolean {
  return keys.some((k) => text.includes(k));
}

export function runFactor1A(market: DataPackMarketParsed): Factor1AResult {
  const text = market.sourceText;
  const checks = [
    { id: 1, item: CHECK_ITEMS[0], hit: hasRiskHint(text, ["保留意见", "否定意见", "无法表示"]), reason: "审计意见关键词扫描" },
    { id: 2, item: CHECK_ITEMS[1], hit: hasRiskHint(text, ["更换审计师", "审计机构变更"]), reason: "审计机构变更关键词扫描" },
    { id: 3, item: CHECK_ITEMS[2], hit: hasRiskHint(text, ["立案", "处罚", "财务造假", "公开谴责"]), reason: "处罚与立案关键词扫描" },
    { id: 4, item: CHECK_ITEMS[3], hit: hasRiskHint(text, ["业务不清", "模式不清晰"]), reason: "商业模式可解释性关键词" },
    { id: 5, item: CHECK_ITEMS[4], hit: hasRiskHint(text, ["转型中", "新业务试点"]), reason: "模式验证成熟度关键词" },
    { id: 6, item: CHECK_ITEMS[5], hit: hasRiskHint(text, ["高比例质押", "频繁减持", "冻结股份"]), reason: "大股东风险关键词" },
  ];
  const rejected = checks.find((c) => c.hit);
  return {
    passed: !rejected,
    reason: rejected ? `因子1A否决：第${rejected.id}项 ${rejected.item}` : undefined,
    checks,
    profile: "资本消耗/收款模式/周期性/护城河直觉已按文本信号生成",
  };
}

export function runFactor1B(market: DataPackMarketParsed, report?: DataPackReportParsed): Factor1BResult {
  const src = market.sourceText;
  const governanceNegative = hasRiskHint(src, ["管理层失信", "治理失效", "重大内控缺陷"]) || market.warnings.some((w) => w.type.includes("治理风险") && w.level === "high");
  const moduleRatings: Record<string, string> = {
    "3.1资本消耗": hasRiskHint(src, ["重资产", "高资本开支"]) ? "capital-hungry" : "capital-light",
    "3.2收款模式": hasRiskHint(src, ["预收", "合同负债"]) ? "预收型" : "后收款型",
    "3.3护城河": hasRiskHint(src, ["品牌", "渠道", "规模", "技术壁垒"]) ? "优质" : "中性",
    "3.4周期性": hasRiskHint(src, ["周期", "景气", "波动"]) ? "强周期" : "弱周期",
    "3.5人力依赖": hasRiskHint(src, ["核心团队", "关键人才"]) ? "人才型" : "系统型",
    "3.6管理层": governanceNegative ? "损害价值" : "合格",
    "3.7监管风险": hasRiskHint(src, ["监管趋严", "政策不确定"]) ? "负面" : "中性",
    "3.8MDA": report?.sections.MDA ? "有MDA补充" : "缺MDA补充",
  };
  const module9Applied = hasRiskHint(src, ["控股公司", "投资控股", "多元化集团"]) || market.warnings.some((w) => w.type.includes("结构复杂"));

  if (moduleRatings["3.6管理层"] === "损害价值") {
    return {
      passed: false,
      reason: "因子1B-M6否决：管理层与治理结构判定为损害价值",
      module0: { profitAnchor: "归母净利润", cashAnchor: "经营现金流", unit: "百万元" },
      moduleRatings,
      module9Applied,
    };
  }

  return {
    passed: true,
    module0: { profitAnchor: "归母净利润", cashAnchor: "经营现金流", unit: "百万元" },
    moduleRatings,
    module9Applied,
  };
}
