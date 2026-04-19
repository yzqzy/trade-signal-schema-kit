import { initCliEnv } from "../../lib/init-cli-env.js";
import { collectPhase1BQualitative } from "./collector.js";
import { renderPhase1BMarkdown } from "./renderer.js";

type DemoArgs = {
  stockCode: string;
  companyName: string;
  year?: string;
  channel: "http" | "mcp";
};

function parseArgs(argv: string[]): DemoArgs {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for argument: ${key}`);
    }
    values[name] = value;
    i += 1;
  }

  const stockCode = values["stock-code"] ?? process.env.PHASE1B_STOCK_CODE ?? "";
  const companyName = values["company-name"] ?? process.env.PHASE1B_COMPANY_NAME ?? "";
  const year = values["year"] ?? process.env.PHASE1B_YEAR;
  const channel = (values["channel"] ?? "http") as "http" | "mcp";
  if (!stockCode) throw new Error("Missing --stock-code or PHASE1B_STOCK_CODE");
  if (!companyName) throw new Error("Missing --company-name or PHASE1B_COMPANY_NAME");
  if (!["http", "mcp"].includes(channel)) throw new Error("Invalid --channel, expected http|mcp");
  return { stockCode, companyName, year, channel };
}

async function main(): Promise<void> {
  initCliEnv();
  const args = parseArgs(process.argv.slice(2));
  const mcpCallTool =
    args.channel === "mcp"
      ? async (_toolName: string, _params: Record<string, unknown>) => ({
          data: [
            {
              title: "MCP mock result",
              url: "https://example.com/mcp-source",
              source: "mock-mcp",
              snippet: "MCP 示例检索结果",
            },
          ],
        })
      : undefined;

  const supplement = await collectPhase1BQualitative({
    stockCode: args.stockCode,
    companyName: args.companyName,
    year: args.year,
    channel: args.channel,
  }, {
    mcpCallTool,
  });

  console.log("===PHASE1B_JSON===");
  console.log(JSON.stringify(supplement, null, 2));
  console.log("===PHASE1B_MARKDOWN===");
  console.log(renderPhase1BMarkdown(supplement));
}

void main();
