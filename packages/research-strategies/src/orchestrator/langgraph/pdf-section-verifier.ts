import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { PdfSections } from "@trade-signal/schema-core";

import { computePdfExtractQuality } from "../../stages/phase2a/extract-quality.js";
import { buildProxiedFetch, parseTsLlmEnv } from "./agent-llm-config.js";

function clipText(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").slice(0, 420);
}

/**
 * 可选：对 MDA / P4 / P13 已抽取片段做语义一致性提示（需 `TS_LLM_*`）。
 * 仅写入 `metadata.extractQuality.aiVerifierNote`，不修改正文与页码。
 */
export async function tryApplyPdfSectionVerifier(sections: PdfSections): Promise<void> {
  const cfg = parseTsLlmEnv();
  if (!cfg) return;

  const baseQ = sections.metadata.extractQuality ?? computePdfExtractQuality(sections);
  const bundle = [
    `MDA pages ${sections.MDA?.pageFrom ?? "?"}-${sections.MDA?.pageTo ?? "?"}:`,
    clipText(sections.MDA?.content),
    "",
    `P4 pages ${sections.P4?.pageFrom ?? "?"}-${sections.P4?.pageTo ?? "?"}:`,
    clipText(sections.P4?.content),
    "",
    `P13 pages ${sections.P13?.pageFrom ?? "?"}-${sections.P13?.pageTo ?? "?"}:`,
    clipText(sections.P13?.content),
  ].join("\n");

  if (!bundle.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "").trim()) return;

  try {
    const proxiedFetch = buildProxiedFetch(cfg.proxyUrl);
    const llm = new ChatOpenAI({
      model: cfg.model,
      apiKey: cfg.apiKey,
      temperature: 0,
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
          "你是 PDF 年报章节语义校验器（旁路）。",
          "任务：判断 MDA / 关联方(P4) / 非经常性损益(P13) 三段摘录是否**明显**与章节目标不符（例如把目录、释义表当成 MDA）。",
          "输出 2~5 句中文，列具体疑点；若无明显错配则说明「未发现明显错配」。",
          "禁止投资建议；不要编造数字；不要改写原文。",
        ].join(""),
      ),
      new HumanMessage(bundle),
    ]);

    const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    const note = text.trim().slice(0, 900);
    if (!note) return;

    sections.metadata.extractQuality = {
      ...baseQ,
      aiVerifierApplied: true,
      aiVerifierNote: note,
    };
  } catch {
    // 无 AI 或未联网：静默降级
  }
}
