import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

import type { Phase1BQualitativeSupplement } from "../../stages/phase1b/types.js";
import { buildProxiedFetch, parseTsLlmEnv } from "./agent-llm-config.js";

function collectSampleTitles(
  supplement: Phase1BQualitativeSupplement,
  maxLines: number,
): { section7: string[]; section8: string[] } {
  const section7: string[] = [];
  for (const row of supplement.section7) {
    for (const e of row.evidences.slice(0, 2)) {
      if (section7.length >= maxLines) break;
      section7.push(`- [§7|${row.item}] ${e.title ?? ""}`);
    }
    if (section7.length >= maxLines) break;
  }
  const section8: string[] = [];
  for (const row of supplement.section8) {
    for (const e of row.evidences.slice(0, 2)) {
      if (section8.length >= maxLines) break;
      section8.push(`- [§8|${row.item}] ${e.title ?? ""}`);
    }
    if (section8.length >= maxLines) break;
  }
  return { section7, section8 };
}

/**
 * 可选：对 Phase1B 外部证据做轻量语义审计（相关性 / 潜在误命中 / 跨条目重复感）。
 * 未配置 `TS_LLM_API_KEY` 或调用失败时返回 undefined，主链不变。
 */
export async function tryRunStageCAgentSidecar(
  phase1b: Phase1BQualitativeSupplement,
): Promise<string | undefined> {
  const cfg = parseTsLlmEnv();
  if (!cfg) return undefined;

  const { section7, section8 } = collectSampleTitles(phase1b, 14);

  try {
    const proxiedFetch = buildProxiedFetch(cfg.proxyUrl);
    const llm = new ChatOpenAI({
      model: cfg.model,
      apiKey: cfg.apiKey,
      temperature: 0.1,
      timeout: Math.min(cfg.timeoutMs, 30_000),
      maxRetries: 1,
      configuration: {
        baseURL: cfg.baseURL,
        ...(proxiedFetch ? { fetch: proxiedFetch as never } : {}),
      },
    });

    const res = await llm.invoke([
      new SystemMessage(
        [
          "你是外部公告检索的旁路审计员（不做投资决策）。",
          "基于给出的 §7/§8 标题样本：指出可能的弱相关或误命中、跨条目标题高度雷同风险；若样本过少则说明证据稀疏。",
          "输出 4~8 句中文，语气克制；不要编造未出现的标题。",
        ].join(""),
      ),
      new HumanMessage(
        [
          `公司：${phase1b.companyName ?? ""}（${phase1b.stockCode}）`,
          "",
          "§7 标题样本：",
          ...(section7.length ? section7 : ["(无)"]),
          "",
          "§8 标题样本：",
          ...(section8.length ? section8 : ["(无)"]),
        ].join("\n"),
      ),
    ]);

    const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    return text?.trim() || undefined;
  } catch {
    return undefined;
  }
}
