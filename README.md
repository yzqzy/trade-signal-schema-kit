# trade-signal-schema-kit

**项目本体**：面向 A 股与港股的 **TypeScript 研究编排框架**——以 `schema-core` 标准字段与 Provider 契约为轴，串联采集、（可选）年报 PDF 精提取、外部证据、策略评估、估值与报告输出，并配套 **质量门禁** 防止契约漂移。

**当前主落地场景**：**A 股优先** 的单公司研究流水线——从标准市场数据包与定性补充，到（可选）年报结构化、定量/估值与 `analysis_report` 等产物；另提供 **独立估值**、**报告转 HTML**、**选股器 CLI** 与 **年报 PDF 下载** 等入口。

**港股**：具备基础数据与质量门禁中的 `hk` 黄金样例；与 A 股同等级别的深度流程与专项验证 **暂未实现**，将在后续里程碑补齐。

**版本**：v0.1-alpha（研究验证阶段）。

## 当前主要能力与边界

| 类别 | 说明 |
|------|------|
| **主要能力** | **全流程编排**（`workflow:run`）、**商业分析**（`business-analysis:run`，默认不跑完整 Phase3）、**独立估值**（`valuation:run`）、**独立 Phase3**（包内 `run:phase3`）、**年报获取**（`phase0:download`）、**选股器**（`screener:run`）、**MD→HTML**（`report-to-html:run`） |
| **设计原则** | 研究层只消费标准字段；HTTP/MCP 适配器对齐语义；**策略可插拔**（如 Turtle），数据与报告契约保持稳定（详见 [CLAUDE.md](CLAUDE.md)） |
| **非目标** | **不是**实时行情/交易系统；**不是**自动下单或全托管资产管理；CLI 产物默认落在本机 `output/`（除已纳入版本库的 **门禁黄金基线** `output/phase3_golden/`，见 [docs/guides/data-source.md](docs/guides/data-source.md)） |

Stage 与 Phase 对照、续跑与 output v2 目录规则以 [docs/guides/workflows.md](docs/guides/workflows.md) 为准；数据契约与 `quality:*` 以 [docs/guides/data-source.md](docs/guides/data-source.md) 为准。

## 我该用哪个入口？

| 你的目标 | 推荐入口 |
|----------|----------|
| 一次跑完采集 →（可选）年报提取 → 外部补充 → 策略/估值/报告 | `pnpm run workflow:run -- ...`（严格 PDF 分支见 `--mode turtle-strict`） |
| 先做市场数据 + Phase1B 与定性产出，Phase3 可选或后接 | `pnpm run business-analysis:run -- ...` |
| 已有 `data_pack_market.md` / manifest，只要估值 JSON（与摘要） | `pnpm run valuation:run -- ...` |
| 在universe 上批量筛标的 | `pnpm run screener:run -- ...`（产物路径见 [workflows 文档](docs/guides/workflows.md) 选股器章节） |
| 只拉取/缓存年报 PDF | `pnpm run phase0:download -- ...` |
| 已有 `analysis_report.md`，需要 HTML | `pnpm run report-to-html:run -- ...` |

## 快速开始

```bash
pnpm install
pnpm run typecheck
pnpm run build
```

运行任意 `@trade-signal/research-strategies` CLI 前都需要先有 `dist/`（根目录 `pnpm run build` 即可）。

**`apps/screener-web`**：历史实验用 Next 壳层，**已冻结**；默认不参与根目录 `pnpm run build`。选股器请用 **`pnpm run screener:run`**（见上表与 [docs/guides/workflows.md](docs/guides/workflows.md)）。若仍要本地启动 `pnpm run web:dev`，请先 `pnpm run build`，并阅读 [`apps/screener-web/README.md`](apps/screener-web/README.md)。

## 5 分钟上手（A 股示例）

以下均在 **仓库根目录**执行，并需配置 `FEED_BASE_URL`（见下文）。

**1）商业分析（Phase1A/1B + 可选 PDF 分支，默认不跑完整 Phase3）**

```bash
pnpm run business-analysis:run -- \
  --code 600887 \
  --year 2024 \
  --output-dir "./output/business-analysis/600887"
```

实际产物在 `./output/business-analysis/600887/<runId>/`（`<runId>` 为 UUID；不传 `--output-dir` 时默认即此父目录）。

**2）严格全流程（优先传 PDF/URL；缺失时尝试自动发现）**

```bash
pnpm run workflow:run -- \
  --code 600887 \
  --year 2024 \
  --mode turtle-strict \
  --pdf "./path/to/annual.pdf" \
  --output-dir "./output/workflow/600887"
```

`--output-dir` 为父目录，写入 `./output/workflow/600887/<runId>/`。

**3）独立估值（市场包 + 可选报告包，或从 manifest 解析）**

```bash
pnpm run valuation:run -- \
  --from-manifest "./output/workflow/600887/<runId>/business_analysis_manifest.json"
```

可选：将已有 Markdown 转为 HTML：

```bash
pnpm run report-to-html:run -- \
  --input-md "./output/workflow/600887/<runId>/analysis_report.md" \
  --code 600887
```

## Claude Slash 与 pnpm 对照

| Slash | 根目录命令 |
|--------|------------|
| `/business-analysis` | `pnpm run business-analysis:run -- ...` |
| `/turtle-analysis` | `pnpm run workflow:run -- --mode turtle-strict ...` |
| `/download-annual-report` | `pnpm run phase0:download -- ...`（可无 `--url`，由 Feed 自动发现 PDF） |
| `/valuation` | `pnpm run valuation:run -- ...` |
| `/report-to-html` | `pnpm run report-to-html:run -- ...` |

规范说明见 `.claude/commands/*.md` 与 `.claude/skills/`。

## 产物速查（典型输出目录）

| 入口 | 关键文件 |
|------|-----------|
| `business-analysis:run` | `qualitative_report.md`、`qualitative_d1_d6.md`、`data_pack_market.md`、可选 `data_pack_report.md`、`business_analysis_manifest.json` |
| `workflow:run` | `analysis_report.md/html`、`valuation_computed.json`、`workflow_manifest.json` |
| `valuation:run` | `valuation_computed.json`、`valuation_summary.md`（可选 `--full-report` 追加完整报告 md/html） |
| `run:phase3`（包内） / 根目录仍可用 `workflow:run` 内含 Phase3 | 同 workflow 中 Phase3 三件套（见 [docs/guides/workflows.md](docs/guides/workflows.md)） |

`business_analysis_manifest.json` / `workflow_manifest.json` 内含 `pipeline.valuation.relativePaths` 与 `outputLayout`（`manifestVersion` 为 `2.0`），便于串接 `valuation:run`。详见 [docs/guides/workflows.md](docs/guides/workflows.md) 的 output v2 说明。

## 质量门禁

```bash
pnpm run quality:all
pnpm run test:linkage   # build + 链路烟测（市场包/2B/D1D6 结构）
```

默认覆盖 `cn_a` 与 `hk` 回归/黄金快照；`contract` / `regression` / `phase3-golden` 依赖仓库内已跟踪的 **`output/phase3_golden/`**（离线合成基线，**不是**某次业务 run 的产物）。误删后：`pnpm --filter @trade-signal/research-strategies run build` 再 `pnpm --filter @trade-signal/research-strategies run gen:phase3-golden`，详见 [docs/guides/data-source.md](docs/guides/data-source.md)。港股基线用于防回归，不代表深度能力已齐。

**环境与 Agent（含 Feed、`TS_LLM_*`、LangGraph 与排障）** 见 [docs/guides/agent-llm-and-env.md](docs/guides/agent-llm-and-env.md)；模板：`.env.example`、`.env.full.example`。

## 更多文档

- [流程与 CLI 细节](docs/guides/workflows.md)
- [数据契约与 quality](docs/guides/data-source.md)
- [环境与 Agent、`TS_LLM_*`、排障](docs/guides/agent-llm-and-env.md)
- [路线图（策略与版本）](docs/strategy/strategy-roadmap.md)
- [文档总索引](docs/README.md)
- [Claude Code 指引](CLAUDE.md)

## 参考

方法论参考：[Turtle_investment_framework](https://github.com/terancejiang/Turtle_investment_framework)。

## License

MIT
