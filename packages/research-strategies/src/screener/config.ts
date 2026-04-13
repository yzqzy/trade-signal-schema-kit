import type { ScreenerConfig, ScreenerMarket } from "./types.js";

const CN_A_CONFIG: ScreenerConfig = {
  minListingYears: 3,
  minMarketCap: 5_000,
  minTurnover: 0.2,
  maxPb: 10,
  maxPe: 50,
  obsChannelLimit: 30,
  tier2MainLimit: 100,
  minRoe: 8,
  minGrossMargin: 15,
  maxDebtRatio: 70,
  hardVetoDebtRatio: 85,
  weightRoe: 0.2,
  weightFcfYield: 0.2,
  weightPenetrationR: 0.25,
  weightEvEbitda: 0.15,
  weightFloorPremium: 0.2,
  weightScreenerScore: 0.7,
  weightReportScore: 0.3,
};

const HK_CONFIG: ScreenerConfig = {
  ...CN_A_CONFIG,
  minMarketCap: 5_000,
  minTurnover: 5,
  maxPb: 8,
  maxPe: 30,
};

export function getDefaultScreenerConfig(market: ScreenerMarket): ScreenerConfig {
  return market === "HK" ? HK_CONFIG : CN_A_CONFIG;
}

export function resolveScreenerConfig(
  market: ScreenerMarket,
  overrides: Partial<ScreenerConfig> = {},
): ScreenerConfig {
  const base = getDefaultScreenerConfig(market);
  return { ...base, ...overrides };
}
