# WebSearch 环境变量（Phase1B）

Phase1B 对以下条目在配置 `WEB_SEARCH_API_KEY` 时会优先调用 **火山联网搜索**，无命中再回退到 Feed 公告检索：

- `违规/处罚记录`
- `行业监管动态`
- `回购计划`

## 变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `WEB_SEARCH_API_KEY` | 启用 WebSearch 时必填 | 火山联网搜索 API Key（非 Ark） |
| `WEB_SEARCH_PROVIDER` | 否 | 默认 `volc`；设为 `none` / `off` / `disabled` 可关闭 |
| `WEB_SEARCH_BASE_URL` | 否 | 默认 `https://open.feedcoopapi.com/search_api/web_search` |
| `WEB_SEARCH_TIMEOUT_MS` | 否 | 默认 `10000` |
| `WEB_SEARCH_MAX_RESULTS` | 否 | 默认 `5`，最大 `50` |
| `WEB_SEARCH_TIME_RANGE` | 否 | 默认 `OneYear`；支持 `OneDay` / `OneWeek` / `OneMonth` / `OneYear` 或简写 `1d` / `1w` / `1m` / `1y` |

开通与错误码说明见仓库内 [references/byted-web-search/references/setup-guide.md](../../references/byted-web-search/references/setup-guide.md)。

## Smoke 验证

```bash
pnpm --filter @trade-signal/research-strategies run build
pnpm --filter @trade-signal/research-strategies run run:websearch-smoke -- --query "牧原股份 回购" --limit 3
```

或根目录：

```bash
pnpm run websearch:smoke -- --query "牧原股份 回购" --limit 3
```

## 002714 回归对比（建议）

1. **未配置** `WEB_SEARCH_API_KEY`：跑一次 `pnpm run business-analysis:run -- --code 002714`，保存 `phase1b_qualitative.md` 中三条目内容与链接形态（多为巨潮 PDF）。
2. **配置 Key 后**再跑同命令：对比三条目是否出现 **网页级** 来源（`http(s)` 非仅 `static.cninfo.com.cn`），并查看 `phase1b_evidence_quality.json`（若存在）与 qualitative JSON 中的 `retrievalDiagnostics.webSearch*` 字段。
3. 终稿仍由 `business-analysis-finalize` 约束：正文禁止裸 URL，缺口须显式列出。
