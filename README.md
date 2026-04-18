# trade-signal-schema-kit

面向 A 股与港股的 **TypeScript 研究编排框架**：以 `schema-core` 标准字段与 Provider 契约为轴，串联采集、（可选）年报 PDF 精提取、外部证据、策略评估、估值与报告输出，并配套 **质量门禁**。**A 股优先**；港股具备门禁基线，与 A 股同等深度能力仍在补齐。**版本**：v0.1-alpha。

日常推荐在 **Claude Code** 里用 Slash 命令驱动；CLI 用于脚本化、CI 与无 IDE 环境。Stage / Phase、续跑与 output v2 见 [docs/guides/workflows.md](docs/guides/workflows.md)；数据契约见 [docs/guides/data-source.md](docs/guides/data-source.md)。

## 推荐路径（Claude Code）

在仓库根打开 Claude Code，按需执行（规范见 `.claude/commands/*.md`、`.claude/skills/`）。

1. **`/business-analysis`** — **PDF-first** 主编排：自动发现/下载年报（非 strict 为 best-effort）→ Phase1A →（有 PDF 时）2A/2B 报告包 → Phase1B → 定性稿与 D1~D6 契约；**不跑完整 Phase3**（估值/终稿见 `/turtle-analysis` 或 manifest 建议命令）。  
   重点看：`qualitative_report.md`、`qualitative_d1_d6.md`、`data_pack_market.md`、可选 `data_pack_report.md`、`business_analysis_manifest.json`。
2. **`/turtle-analysis`** — 全流程到终稿（`workflow:run --mode turtle-strict` 语义）。  
   重点看：`analysis_report.md` / `analysis_report.html`、`valuation_computed.json`、`workflow_manifest.json`。
3. **`/valuation`** — 仅估值时可从 manifest 接参。  
   重点看：`valuation_computed.json`、`valuation_summary.md`。

需要年报 PDF 时用 **`/download-annual-report`**；已有 `analysis_report.md` 要 HTML 时用 **`/report-to-html`**。

## 入口映射（Slash → CLI）

| Slash | 根目录 CLI（同工作流，交互方式不同） |
|--------|--------------------------------------|
| `/business-analysis` | `pnpm run business-analysis:run -- ...` |
| `/turtle-analysis` | `pnpm run workflow:run -- --mode turtle-strict ...` |
| `/download-annual-report` | `pnpm run phase0:download -- ...`（可无 `--url`，由 Feed 自动发现 PDF） |
| `/valuation` | `pnpm run valuation:run -- ...` |
| `/report-to-html` | `pnpm run report-to-html:run -- ...` |

## 我该用哪个入口？

| 你的目标 | Claude Code（推荐） | CLI |
|----------|---------------------|-----|
| 一次跑完采集 →（可选）年报 → 外部补充 → 策略/估值/报告 | `/turtle-analysis` | `pnpm run workflow:run -- ...` |
| PDF-first 商业定性（可接全链路 / 估值） | `/business-analysis` | `pnpm run business-analysis:run -- ...`（支持 `--strict`、`--mode`、`--strategy`） |
| 只要估值 JSON（与摘要） | `/valuation` | `pnpm run valuation:run -- ...` |
| universe 批量筛选 | — | `pnpm run screener:run -- ...`（路径见 [workflows](docs/guides/workflows.md)） |
| 只下载/缓存年报 PDF | `/download-annual-report` | `pnpm run phase0:download -- ...` |
| Markdown → HTML | `/report-to-html` | `pnpm run report-to-html:run -- ...` |

## 当前主要能力与边界

| 类别 | 说明 |
|------|------|
| **主要能力** | 全流程 `/turtle-analysis`、商业分析 `/business-analysis`、独立估值、独立 Phase3（包内 `run:phase3`）、年报获取、选股器、MD→HTML |
| **设计原则** | 研究层只消费标准字段；HTTP/MCP 语义对齐；策略可插拔（如 Turtle）。详见 [CLAUDE.md](CLAUDE.md) |
| **非目标** | 非实时交易、非自动下单；产物默认在本机 `output/`（门禁基线 `output/phase3_golden/` 见 [data-source](docs/guides/data-source.md)） |

## 产物速查（典型输出目录）

| 入口 | 关键文件 |
|------|-----------|
| `/business-analysis`（或 `business-analysis:run`） | `qualitative_report.md`、`qualitative_d1_d6.md`、`data_pack_market.md`、可选 `data_pack_report.md`、`business_analysis_manifest.json` |
| `/turtle-analysis`（或 `workflow:run`） | `analysis_report.md/html`、`valuation_computed.json`、`workflow_manifest.json` |
| `/valuation`（或 `valuation:run`） | `valuation_computed.json`、`valuation_summary.md`（可选 `--full-report`） |

`business_analysis_manifest.json` / `workflow_manifest.json` 含 `pipeline.valuation.relativePaths` 与 `outputLayout`（`manifestVersion` 为 `2.0`）。目录规则见 [workflows.md](docs/guides/workflows.md)。

## 质量门禁

```bash
pnpm run quality:all
pnpm run test:linkage   # build + 链路烟测
```

`contract` / `regression` / `phase3-golden` 依赖仓库内 **`output/phase3_golden/`**；误删后见 [data-source.md](docs/guides/data-source.md)。

**Feed、续跑、排障**：[docs/guides/agent-llm-and-env.md](docs/guides/agent-llm-and-env.md)；模板：`.env.example`、`.env.full.example`。

## 更多文档

- [流程与 CLI 细节](docs/guides/workflows.md)
- [数据契约与 quality](docs/guides/data-source.md)
- [环境配置与实操](docs/guides/agent-llm-and-env.md)
- [路线图](docs/strategy/strategy-roadmap.md)
- [文档总索引](docs/README.md)
- [Claude Code 指引](CLAUDE.md)

## CLI 附录（工程 / CI）

任意 `@trade-signal/research-strategies` CLI 前需先有 `dist/`：

```bash
pnpm install
pnpm run typecheck
pnpm run build
```

**A 股示例（仓库根目录，需 `FEED_BASE_URL`）**

商业分析：

```bash
pnpm run business-analysis:run -- \
  --code 600887 \
  --year 2024 \
  --output-dir "./output/business-analysis/600887"
  # 可加 --strict（强制 PDF+报告包）、--mode turtle-strict、--strategy turtle|value_v1
```

产物在 `./output/business-analysis/600887/<runId>/`（无 `--pdf`/`--report-url` 时会 best-effort 自动发现年报，需 `FEED_BASE_URL`）。

严格全流程：

```bash
pnpm run workflow:run -- \
  --code 600887 \
  --year 2024 \
  --mode turtle-strict \
  --pdf "./path/to/annual.pdf" \
  --output-dir "./output/workflow/600887"
  # 可选：--run-id <固定子目录名>，与 manifest / business_analysis 建议命令对齐；续跑时勿依赖其覆盖 checkpoint
```

从 manifest 跑估值：

```bash
pnpm run valuation:run -- \
  --from-manifest "./output/business-analysis/600887/<runId>/business_analysis_manifest.json"
```

转 HTML：

```bash
pnpm run report-to-html:run -- \
  --input-md "./output/workflow/600887/<runId>/analysis_report.md" \
  --code 600887
```

**`apps/screener-web`**：已冻结；选股器用 `pnpm run screener:run`。若需 `pnpm run web:dev`，先 `pnpm run build`，见 [`apps/screener-web/README.md`](apps/screener-web/README.md)。

## 参考

[Turtle_investment_framework](https://github.com/terancejiang/Turtle_investment_framework)

## License

MIT
