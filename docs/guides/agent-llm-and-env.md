# 环境配置与实操教程

[返回文档索引](../README.md) · [流程与 CLI](./workflows.md) · [数据契约与 quality](./data-source.md)

本文按「先跑通，再细化」给出使用步骤：先配置 Feed，再在 Claude Code 或 CLI 中执行分析命令，最后补充续跑与排障要点。

> 建议直接按下面的「三步法」使用。Claude 命令与 CLI 共享同一条工作流入口，但交互能力不同（AI 可进行额外解释与辅助判断）。

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

### 第 2 步：先做商业分析（推荐起手）

- Claude Code：`/business-analysis`
- CLI 入口映射：

```bash
pnpm run business-analysis:run -- \
  --code 600887 \
  --year 2024 \
  --output-dir "./output/business-analysis/600887"
```

完成后重点看：
- `qualitative_report.md`
- `qualitative_d1_d6.md`
- `business_analysis_manifest.json`

### 第 3 步：按需要进入全流程或估值

- 全流程（含最终报告）：`/turtle-analysis`
- 只做估值：`/valuation`
- 年报下载：`/download-annual-report`

CLI 入口映射：

```bash
pnpm run workflow:run -- \
  --code 600887 \
  --year 2024 \
  --mode turtle-strict \
  --pdf "./path/to/annual.pdf"
```

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
