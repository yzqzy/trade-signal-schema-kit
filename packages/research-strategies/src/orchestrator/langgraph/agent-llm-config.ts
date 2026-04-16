/**
 * Stage C Agent sidecar 使用的 LLM 配置：仅读取 `TS_LLM_*` 前缀环境变量。
 * 未配置 `TS_LLM_API_KEY` 时返回 null，调用方应跳过 sidecar（不影响主链）。
 */
import { ProxyAgent } from "undici";

export type TsLlmProvider =
  | "openai"
  | "deepseek"
  | "doubao"
  | "qwen"
  | "glm"
  | "minimax"
  | "moonshot"
  | "gemini"
  | "custom";

const KNOWN_PROVIDERS = new Set<TsLlmProvider>([
  "openai",
  "deepseek",
  "doubao",
  "qwen",
  "glm",
  "minimax",
  "moonshot",
  "gemini",
  "custom",
]);

/** 未显式设置 `TS_LLM_BASE_URL` 时的 OpenAI-compatible 默认网关 */
const DEFAULT_BASE_URL: Record<Exclude<TsLlmProvider, "custom">, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  doubao: "https://ark.cn-beijing.volces.com/api/v3",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  glm: "https://open.bigmodel.cn/api/paas/v4",
  minimax: "https://api.minimaxi.com/v1",
  moonshot: "https://api.moonshot.cn/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

/** 未设置 `TS_LLM_MODEL` 时的占位默认（与 trade-signal-client 常用模型对齐） */
const DEFAULT_MODEL: Record<TsLlmProvider, string> = {
  openai: "gpt-4o-mini",
  deepseek: "deepseek-chat",
  doubao: "doubao-seed-1-6-flash-250715",
  qwen: "qwen-turbo",
  glm: "glm-3-turbo",
  minimax: "MiniMax-M2.7",
  moonshot: "moonshot-v1-8k",
  gemini: "gemini-3-flash-preview",
  custom: "gpt-4o-mini",
};

export type ResolvedTsLlmConfig = {
  provider: TsLlmProvider;
  model: string;
  apiKey: string;
  baseURL: string;
  proxyUrl?: string;
  temperature: number;
  timeoutMs: number;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseTemperature(raw: string | undefined, fallback: number): number {
  const n = Number.parseFloat(String(raw ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 为 OpenAI SDK / LangChain 注入代理：与 trade-signal-client 一致，使用 undici ProxyAgent。
 * 返回 undefined 表示不使用代理。
 */
export function buildProxiedFetch(proxyUrl: string | undefined): typeof globalThis.fetch | undefined {
  const trimmed = proxyUrl?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      console.warn("[agent-llm-config] TS_LLM_PROXY_URL 协议必须是 http 或 https，已忽略代理");
      return undefined;
    }
    const proxyAgent = new ProxyAgent(trimmed);
    return ((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        dispatcher: proxyAgent,
      } as RequestInit)) as typeof globalThis.fetch;
  } catch (e) {
    console.warn("[agent-llm-config] TS_LLM_PROXY_URL 无效，已忽略代理", e);
    return undefined;
  }
}

export function parseTsLlmEnv(): ResolvedTsLlmConfig | null {
  const apiKey = process.env.TS_LLM_API_KEY?.trim();
  if (!apiKey) return null;

  const providerRaw = (process.env.TS_LLM_PROVIDER ?? "openai").trim().toLowerCase();
  if (!KNOWN_PROVIDERS.has(providerRaw as TsLlmProvider)) {
    console.warn(
      `[agent-llm-config] 未知 TS_LLM_PROVIDER=${providerRaw}（期望 openai|deepseek|doubao|qwen|glm|minimax|moonshot|gemini|custom），已跳过 agent sidecar`,
    );
    return null;
  }
  const provider = providerRaw as TsLlmProvider;

  const explicitBase = process.env.TS_LLM_BASE_URL?.trim();
  if (provider === "custom" && !explicitBase) {
    console.warn("[agent-llm-config] TS_LLM_PROVIDER=custom 时必须设置 TS_LLM_BASE_URL，已跳过 agent sidecar");
    return null;
  }

  const baseURL =
    explicitBase ??
    (provider === "custom" ? undefined : DEFAULT_BASE_URL[provider as Exclude<TsLlmProvider, "custom">]);
  if (!baseURL) {
    console.warn("[agent-llm-config] 无法解析 baseURL，已跳过 agent sidecar");
    return null;
  }

  const model = process.env.TS_LLM_MODEL?.trim() || DEFAULT_MODEL[provider];
  const proxyUrl = process.env.TS_LLM_PROXY_URL?.trim() || undefined;
  const temperature = parseTemperature(process.env.TS_LLM_TEMPERATURE, 0);
  const timeoutMs = parsePositiveInt(process.env.TS_LLM_TIMEOUT_MS, 30_000);

  return {
    provider,
    model,
    apiKey,
    baseURL,
    proxyUrl,
    temperature,
    timeoutMs,
  };
}
