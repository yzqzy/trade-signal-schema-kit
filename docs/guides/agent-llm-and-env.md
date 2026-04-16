# 环境与 Agent 配置（`TS_LLM_*`）

[返回文档索引](../README.md) · [流程与 CLI](./workflows.md) · [数据契约与 quality](./data-source.md)

本文说明 **Feed 最小配置**、workflow **Stage C 可选 LangChain sidecar** 所用的 **`TS_LLM_*` 变量**，以及 **LangGraph 续跑**与排障相关说明。根目录 `README.md` 仅保留摘要与链接。

## Feed（Phase1A 等）

| 变量 | 用途 |
|------|------|
| `FEED_BASE_URL` | Phase1A HTTP Provider（**必填**） |
| `FEED_API_KEY` | 可选 |

更完整的可选变量（Phase0、预检等）见仓库根目录 **`.env.full.example`**；Feed 语义与质量门禁见 [data-source.md](./data-source.md)。

## Stage C 可选 Agent（`TS_LLM_*`）

workflow 在 Stage C 可调用轻量 **LangChain tools agent**（`@langchain/openai` 的 `ChatOpenAI`）生成旁路说明，写入 manifest 的 `agentSidecarNote`。**未设置 `TS_LLM_API_KEY` 时跳过 sidecar，主链不受影响。**

**说明**：本仓库 **不再**读取 `OPENAI_API_KEY` 等其它前缀；请统一使用下表。

| 变量 | 说明 |
|------|------|
| `TS_LLM_API_KEY` | 有值才启用 sidecar（鉴权入口） |
| `TS_LLM_PROVIDER` | `openai`（默认）\|`deepseek`\|`doubao`\|`qwen`\|`glm`\|`minimax`\|`moonshot`\|`gemini`\|`custom`；均走 **OpenAI-compatible** 网关 |
| `TS_LLM_MODEL` | 模型 id；未设时使用下表「默认模型」 |
| `TS_LLM_BASE_URL` | 显式网关；未设时使用下表「默认 baseURL」；**`custom` 必须设置** |
| `TS_LLM_PROXY_URL` | 可选 HTTP(S) 代理（`undici` `ProxyAgent`，注入 SDK `fetch`） |
| `TS_LLM_TEMPERATURE` | 可选，默认 `0` |
| `TS_LLM_TIMEOUT_MS` | 可选，默认 `30000` |

实现与默认值以源码为准：[`packages/research-strategies/src/orchestrator/langgraph/agent-llm-config.ts`](../../packages/research-strategies/src/orchestrator/langgraph/agent-llm-config.ts)。

### 未设置 `TS_LLM_BASE_URL` 时的默认网关

| `TS_LLM_PROVIDER` | 默认 `baseURL` |
|-------------------|----------------|
| `openai` | `https://api.openai.com/v1` |
| `deepseek` | `https://api.deepseek.com/v1` |
| `doubao` | `https://ark.cn-beijing.volces.com/api/v3` |
| `qwen` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `glm` | `https://open.bigmodel.cn/api/paas/v4` |
| `minimax` | `https://api.minimaxi.com/v1` |
| `moonshot` | `https://api.moonshot.cn/v1` |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `custom` | （无内置默认，必须设置 `TS_LLM_BASE_URL`） |

### 未设置 `TS_LLM_MODEL` 时的占位默认

| `TS_LLM_PROVIDER` | 默认模型 |
|-------------------|----------|
| `openai` | `gpt-4o-mini` |
| `deepseek` | `deepseek-chat` |
| `doubao` | `doubao-seed-1-6-flash-250715` |
| `qwen` | `qwen-turbo` |
| `glm` | `glm-3-turbo` |
| `minimax` | `MiniMax-M2.7` |
| `moonshot` | `moonshot-v1-8k` |
| `gemini` | `gemini-3-flash-preview` |
| `custom` | `gpt-4o-mini`（建议显式设置 `TS_LLM_MODEL`） |

## LangGraph 续跑（非 `TS_LLM_*`）

续跑与 checkpoint 由 **CLI** 控制：`--output-dir` 指向已有 run 根目录、`--resume-from-stage B|D`，以及该目录下的 `workflow_graph_checkpoint.json`。详见 [workflows.md](./workflows.md) 中编排与续跑小节。

## 严格模式报错前缀

- `business-analysis --strict`：`[strict:business-analysis]`
- `workflow --mode turtle-strict`：`[strict:workflow:turtle-strict]`
- Phase1A Pre-flight（`turtle-strict` / `business-analysis --strict` / `--preflight strict`）：`[strict:preflight]`

## 常见故障

| 现象 | 处理 |
|------|------|
| 找不到模块 / CLI 不运行 | 先执行 `pnpm run build` |
| Phase1A 失败 | 检查 `FEED_BASE_URL`、网络与 `FEED_API_KEY` |
| turtle-strict 立即报错 | 若未传 `--pdf/--report-url` 会先尝试自动发现；失败时按提示改传 `--report-url` 或 `--pdf`，并确保可生成 `data_pack_report.md` |

## 配置模板

- `.env.example`：最小 Feed
- `.env.full.example`：含 Phase0、预检、`TS_LLM_*` 等可选项注释模板
