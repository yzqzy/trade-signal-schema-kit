---
name: workflow-strict
description: "`workflow:run --mode turtle-strict`：TS 跑严格证据链与 Phase3；深度定性终稿默认在 Claude 会话对照本 skill 收口。"
---

# workflow-strict 执行规范

> 由入口 `/workflow-analysis` 默认调用；该 skill 只定义严格执行与终稿补强规范，不替代入口参数说明。

## 目标

- 与仓库根 **`/workflow-analysis`**（等价 `pnpm run workflow:run -- --mode turtle-strict ...`）一致：**PDF 链 + 报告包 + Pre-flight + Phase3**。
- **策略可切换**：Stage E 由 `--strategy turtle|value_v1` 决定；入口名不含策略名。
- **叙事分层**：编排层 **不**调用 Anthropic/OpenAI 做自动叙事；**final-narrative**（六维定性终稿）默认由 **Claude** 在证据产物齐备后执行（与 [entrypoint-narrative-contract.md](../../docs/guides/entrypoint-narrative-contract.md) 一致）。

## 顺序与检查

1. **initPrep**：无 `--pdf`/`--report-url` 时按 Feed 自动发现（`turtle-strict` 下失败即抛错）。
2. 在 **`turtle-strict`** 下：
   - Phase1A 后跑 **Pre-flight**（`[strict:preflight]`）。
   - 缺 `data_pack_report.md` 时 **fail-fast**（`[strict:workflow:strict]`）。
3. **（默认）Claude 收口**：在 `data_pack_market.md`、（若有）`data_pack_report.md`、Phase1B 与 Phase3 报告就绪后，于会话内完成与策略一致的定性终稿补强；证据不足时 **明确阻断**，不宣称已完成终稿。

## 关键差异（`standard` vs `turtle-strict`）

| 项 | standard | turtle-strict |
|----|----------|---------------|
| 自动发现年报 | 否（除非显式 URL / 其他入口） | 是（无 PDF/URL 时） |
| Phase1A Pre-flight 默认 | off | strict |
| 缺 `data_pack_report` 进 Phase3 | 可能继续 | 禁止 |

## 入口映射

- **Claude Code**：`/workflow-analysis`（语义为 `workflow:run --mode turtle-strict`）
- **CLI**：`pnpm run workflow:run -- --mode turtle-strict ...`

## 产物速查

- `analysis_report.md` / `analysis_report.html`
- `valuation_computed.json`
- `workflow_manifest.json`

## Phase1B · WebSearch（火山，可选）

- **用途**：在配置了 `WEB_SEARCH_API_KEY` 时，Phase1B 对 **`违规/处罚记录` / `行业监管动态` / `回购计划`** 优先走联网搜索；无有效命中再回退到 Feed 公告检索（不静默补数）。
- **环境变量**：见仓库根目录 `.env.example` 与 [docs/guides/websearch-env.md](../../docs/guides/websearch-env.md)；开通步骤见 [references/byted-web-search/references/setup-guide.md](../../references/byted-web-search/references/setup-guide.md)。
- **Smoke（验证 Key 与网络）**：

```bash
pnpm run build
pnpm --filter @trade-signal/research-strategies run run:websearch-smoke -- --query "牧原股份 回购" --limit 3
```

- **业务回归**：配置 Key 后跑一次 `pnpm run business-analysis:run -- --code 002714`，检查 `phase1b_qualitative.md` 上述三条是否出现可追溯 `http(s)` 链接；`qualitative_report.md` 仍须遵守 `business-analysis-finalize`（正文无裸 URL、附录证据索引）。

## 质量门禁（可选）

- `pnpm run test:linkage`
- `pnpm run quality:all`
