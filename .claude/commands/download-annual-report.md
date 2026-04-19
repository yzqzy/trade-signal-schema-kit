---
description: Phase0 年报下载与缓存（独立 CLI；仅获取 PDF，不做定性叙事）
argument-hint: [--stock-code] [--year] [--category] [--url 可选]
---

在 **monorepo 根目录**执行。

> **职责边界**：只解决 **年报 PDF 落盘**；不包含 Phase1A/1B 或任何 **final-narrative**。后续请 `/business-analysis` 或 `/workflow-analysis`（见 [entrypoint-narrative-contract.md](../../docs/guides/entrypoint-narrative-contract.md)）。

## Slash → CLI（脚本 / CI）

**模式 A：自动发现（Feed `/stock/report/search`，需 `FEED_BASE_URL`）**

```bash
pnpm run phase0:download -- \
  --stock-code 600887 \
  --year 2024 \
  --category 年报 \
  [--save-dir "./cache/reports/..."]
```

**模式 B：显式 PDF 直链（与历史行为一致）**

```bash
pnpm run phase0:download -- \
  --url "<https://...pdf>" \
  --stock-code 600887 \
  --year 2024 \
  --category 年报
```

环境变量兜底：`PHASE0_REPORT_URL`（可选）、`PHASE0_STOCK_CODE`、`PHASE0_YEAR`、`PHASE0_CATEGORY`。详见 [Phase 0 文档](../../docs/guides/phase0-download.md)。

## 输入校验

- `stock-code`、`year`、`category` 必填。
- 未提供 `--url` / `PHASE0_REPORT_URL` 时走自动发现；发现失败会提示改用 `--url`（退出码 3）。
- 下载成功后打印本地 `filepath`、校验和等，供后续 `--pdf` 传入 `workflow:run` 或 `business-analysis:run`。

## 与编排衔接

1. 本命令：拿到本地 PDF 路径。
2. `pnpm run workflow:run -- --code ... --pdf "<上一步路径>"` 或 `pnpm run business-analysis:run -- ...`。
