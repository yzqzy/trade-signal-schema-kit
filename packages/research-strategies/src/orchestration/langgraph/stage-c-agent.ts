import { ChatOpenAI } from "@langchain/openai";
import { DynamicTool } from "@langchain/core/tools";
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";

import type { Phase1BQualitativeSupplement } from "../../phase1b/types.js";

/**
 * 可选：用 OpenAI tools agent 生成一条旁路说明（失败或未配置 key 时返回 undefined，主链不变）。
 */
export async function tryRunStageCAgentSidecar(
  phase1b: Phase1BQualitativeSupplement,
): Promise<string | undefined> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return undefined;

  const noopTool = new DynamicTool({
    name: "noop_ack",
    description: "Acknowledge receipt; input is ignored.",
    func: async () => "ok",
  });

  try {
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0,
      apiKey,
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

