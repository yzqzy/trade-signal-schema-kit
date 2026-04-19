import { initCliEnv } from "../../lib/init-cli-env.js";

export type CliArgs = {
  url?: string;
  stockCode?: string;
  category?: string;
  year?: string;
  saveDir?: string;
  maxRetries?: number;
  forceRefresh?: boolean;
};

export type ResolvedCliInput = {
  /** 未提供时由 Phase0 通过 Feed `/stock/report/search` 自动发现（需 FEED_BASE_URL） */
  url?: string;
  stockCode?: string;
  category?: string;
  year?: string;
  /** 未设置时由下载器默认落到 `cache/reports/<code>/`（相对当前工作目录） */
  saveDir?: string;
  maxRetries: number;
  forceRefresh: boolean;
};

/** @deprecated 使用 {@link initCliEnv}；保留别名以兼容既有调用方 */
export function initPhase0CliEnv(cwd: string = process.cwd()): void {
  initCliEnv(cwd);
}

export function parsePhase0CliArgs(argv: string[]): CliArgs {
  const values: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    if (name === "force-refresh") {
      values[name] = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for argument: ${key}`);
    values[name] = value;
    i += 1;
  }

  return {
    url: values["url"] ? String(values["url"]) : undefined,
    stockCode: values["stock-code"] ? String(values["stock-code"]) : undefined,
    category: values["category"] ? String(values["category"]) : undefined,
    year: values["year"] ? String(values["year"]) : undefined,
    saveDir: values["save-dir"] ? String(values["save-dir"]) : undefined,
    maxRetries: values["max-retries"] ? Number(values["max-retries"]) : undefined,
    forceRefresh: Boolean(values["force-refresh"]),
  };
}

const parseEnvBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
};

export function resolvePhase0CliInput(args: CliArgs, env: NodeJS.ProcessEnv = process.env): ResolvedCliInput {
  return {
    url: args.url ?? env.PHASE0_REPORT_URL,
    stockCode: args.stockCode ?? env.PHASE0_STOCK_CODE,
    category: args.category ?? env.PHASE0_CATEGORY ?? "年报",
    year: args.year ?? env.PHASE0_YEAR,
    saveDir: args.saveDir ?? env.PHASE0_SAVE_DIR,
    maxRetries: args.maxRetries ?? (env.PHASE0_MAX_RETRIES ? Number(env.PHASE0_MAX_RETRIES) : 3),
    forceRefresh: args.forceRefresh || parseEnvBoolean(env.PHASE0_FORCE_REFRESH) || false,
  };
}
