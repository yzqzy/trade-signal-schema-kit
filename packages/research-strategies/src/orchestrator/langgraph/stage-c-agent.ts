import { ChatOpenAI } from "@langchain/openai";
import { DynamicTool } from "@langchain/core/tools";
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";

import type { Phase1BQualitativeSupplement } from "../../stages/phase1b/types.js";
import { buildProxiedFetch, parseTsLlmEnv } from "./agent-llm-config.js";

/**
 * 可选：用 OpenAI tools agent 生成一条旁路说明（失败或未配置 TS_LLM_* 时返回 undefined，主链不变）。
 * 配置仅通过 `TS_LLM_*` 环境变量（见 README 与 agent-llm-config）。
 */
export async function tryRunStageCAgentSidecar(
  phase1b: Phase1BQualitativeSupplement,
): Promise<string | undefined> {
  const cfg = parseTsLlmEnv();
  if (!cfg) return undefined;

  const noopTool = new DynamicTool({
    name: "noop_ack",
    description: "Acknowledge receipt; input is ignored.",
    func: async () => "ok",
  });

  try {
    const proxiedFetch = buildProxiedFetch(cfg.proxyUrl);
    const llm = new ChatOpenAI({
      model: cfg.model,
      apiKey: cfg.apiKey,
      temperature: cfg.temperature,
      timeout: cfg.timeoutMs,
      maxRetries: 2,
      configuration: {
        baseURL: cfg.baseURL,
        // OpenAI SDK Fetch 类型与 undici 代理 fetch 签名略有不一致，运行时兼容
        ...(proxiedFetch ? { fetch: proxiedFetch as never } : {}),
      },
    });

    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        "You are a lightweight sidecar. Call noop_ack once, then output one short Chinese sentence summarizing how many external evidence slots were filled (section7 count). No investment advice.",
      ],
      ["human", "Company: {company}. Section7 items: {n7}."],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);

    const agent = await createOpenAIToolsAgent({
      llm,
      tools: [noopTool],
      prompt,
    });

    const executor = new AgentExecutor({
      agent,
      tools: [noopTool],
      maxIterations: 3,
    });

    const out = await executor.invoke({
      company: phase1b.companyName,
      n7: String(phase1b.section7.length),
    });
    const text =
      typeof out.output === "string"
        ? out.output
        : typeof out.output === "object" && out.output && "output" in out.output
          ? String((out.output as { output?: unknown }).output)
          : undefined;
    return text?.trim() || undefined;
  } catch {
    return undefined;
  }
}
