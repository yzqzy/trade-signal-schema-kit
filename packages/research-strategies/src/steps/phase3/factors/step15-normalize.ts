import type { DataPackMarketParsed } from "../types.js";

const HIGH_SEASONAL_INDUSTRIES = ["白酒", "食品饮料", "零售", "电商", "旅游", "酒店", "航空", "农业", "养殖", "空调", "家电", "教育", "培训"];

export function applyInterimNormalization(input: DataPackMarketParsed): string[] {
  const notes: string[] = [];
  if (!input.hasInterim) return notes;
  const industry = input.industry ?? "";
  const isHighSeasonal = HIGH_SEASONAL_INDUSTRIES.some((k) => industry.includes(k));
  notes.push("检测到中期口径：已按 Step1.5 启用 Q3×4/3、H1×2 年化参考（优先级 Q3>H1>Q1）。");
  if (isHighSeasonal) {
    notes.push("⚠️ 高季节性行业：年化值仅作趋势参考，因子2/3基准优先使用 FY 数据。")
  }
  return notes;
}
