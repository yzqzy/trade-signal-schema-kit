# 环境配置与实操教程

[返回文档索引](../README.md) · [流程与 CLI](./workflows.md) · [数据契约与 quality](./data-source.md)

本文按「先跑通，再细化」给出步骤：先配置 Feed，再优先用 **Claude Code** Slash（与根目录 [README.md](../../README.md) 一致），需要脚本化或续跑时再对照下方 CLI。续跑与排障见后文。

> Slash 与根目录 `pnpm` 命令触发同一套编排；IDE 内可多轮追问与改稿，CLI 适合 CI 与无界面环境。

## 三步法（推荐）

### 第 1 步：准备环境

```bash
pnpm install
pnpm run build
```

最小环境变量（仓库根 `.env`）：

```bash
FEED_BASE_URL=http://localhost:4000
FEED_API_KEY=
```

### 第 2 步：商业分析（起手）

- **Claude Code**：`/business-analysis`
- **CLI**：

```bash
pnpm run business-analysis:run -- \
  --code 600887 \
  --year 2024 \
  --output-dir "./output/business-analysis/600887"
```

无 `--pdf`/`--report-url` 时会对年报 URL **best-effort 自动发现**（需 `FEED_BASE_URL`）；交付级报告包可加 `--strict`（强制 PDF 链 + Pre-flight，前缀 `[strict:business-analysis]`）。

完成后重点看：
- `qualitative_report.md`
- `qualitative_d1_d6.md`
- `business_analysis_manifest.json`

### 第 3 步：全流程或估值

- **Claude Code**：`/turtle-analysis`（终稿）· `/valuation` · `/download-annual-report`（按需）
- **CLI**：

```bash
pnpm run workflow:run -- \
  --code 600887 \
  --year 2024 \
  --mode turtle-strict \
  --pdf "./path/to/annual.pdf"
```

可选 `--run-id <固定子目录名>` 与 manifest 对齐；**`--resume-from-stage` 时以 checkpoint 为准**，勿指望 `--run-id` 覆盖续跑身份。

```bash
pnpm run valuation:run -- \
  --from-manifest "./output/business-analysis/600887/<runId>/business_analysis_manifest.json"
```

## Feed（最小配置）

| 变量 | 用途 |
|------|------|
| `FEED_BASE_URL` | Phase1A HTTP Provider（**必填**） |
| `FEED_API_KEY` | 可选 |

更完整的可选变量（Phase0、预检等）见仓库根目录 **`.env.full.example`**；Feed 字段语义与质量门禁见 [data-source.md](./data-source.md)。

## 续跑（中断后恢复）

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
- `.env.full.example`：含 Phase0、预检等可选项注释模板
