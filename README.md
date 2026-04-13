# trade-signal-schema-kit

面向 **A 股优先** 的 TypeScript 研究流水线：标准字段采集 → 定性补充 →（可选）年报 PDF 精提取 → 定量/估值 → 报告输出。

**港股**：具备基础数据与质量门禁中的 `hk` 黄金样例；与 A 股同等级别的深度流程与专项验证 **暂未实现**，将在后续里程碑补齐。

**版本**：v0.1-alpha（研究验证阶段）。

## 快速开始

```bash
pnpm install
pnpm run typecheck
pnpm run build
```

运行任意 `@trade-signal/research-strategies` CLI 前都需要先有 `dist/`（根目录 `pnpm run build` 即可）。

## 5 分钟上手（A 股示例）

以下均在 **仓库根目录**执行，并需配置 `FEED_BASE_URL`（见下文）。

**1）商业分析（Phase1A/1B + 可选 PDF 分支，默认不跑完整 Phase3）**

```bash
pnpm run business-analysis:run -- \
  --code 600887 \
  --year 2024 \
  --output-dir "./output/run/600887_ba"
```

**2）严格全流程（优先传 PDF/URL；缺失时尝试自动发现）**

```bash
pnpm run workflow:run -- \
  --code 600887 \
  --year 2024 \
  --mode turtle-strict \
  --pdf "./path/to/annual.pdf" \
  --output-dir "./output/run/600887_wf"
```

**3）独立估值（市场包 + 可选报告包，或从 manifest 解析）**

```bash
pnpm run valuation:run -- \
  --from-manifest "./output/run/600887_ba/business_analysis_manifest.json"
```

可选：将已有 Markdown 转为 HTML：

```bash
pnpm run report-to-html:run -- \
  --input-md "./output/run/600887_wf/analysis_report.md"
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
| `phase3:run` | 同 workflow 中 Phase3 三件套（见 [docs/workflows.md](docs/workflows.md)） |

`business_analysis_manifest.json` / `workflow_manifest.json` 内含 `pipeline.valuation.relativePaths`，便于串接 `valuation:run`。

## 严格模式报错前缀

- `business-analysis --strict`：`[strict:business-analysis]`
- `workflow --mode turtle-strict`：`[strict:workflow:turtle-strict]`
- Phase1A Pre-flight（`turtle-strict` / `business-analysis --strict` / `--preflight strict`）：`[strict:preflight]`

## 常见故障

| 现象 | 处理 |
|------|------|
| 找不到模块 / CLI 不运行 | 先执行 `pnpm run build` |
| Phase1A 失败 | 检查 `FEED_BASE_URL`、网络与 API Key |
| turtle-strict 立即报错 | 若未传 `--pdf/--report-url` 会先尝试自动发现；失败时按提示改传 `--report-url` 或 `--pdf`，并确保可生成 `data_pack_report.md` |

## 质量门禁

```bash
pnpm run quality:all
pnpm run test:linkage   # build + 链路烟测（市场包/2B/D1D6 结构）
```

默认覆盖 `cn_a` 与 `hk` 回归/黄金快照（港股基线用于防回归，不代表深度能力已齐）。详见 [docs/data-source.md](docs/data-source.md)。

## 环境变量（最小集）

| 变量 | 用途 |
|------|------|
| `FEED_BASE_URL` | Phase1A HTTP Provider（必填） |
| `FEED_API_KEY` | 可选 |

模板：`.env.example`、`.env.full`。

## 更多文档

- [流程与 CLI 细节](docs/workflows.md)
- [数据契约与 quality](docs/data-source.md)
- [路线图](docs/roadmap.md)
- [Claude Code 指引](CLAUDE.md)

## 参考

方法论参考：[Turtle_investment_framework](https://github.com/terancejiang/Turtle_investment_framework)。

## License

MIT
