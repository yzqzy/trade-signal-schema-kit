---
description: Phase0 年报下载与缓存（独立 CLI）
argument-hint: [--url] [--stock-code] [--year] [--category]
---

在 **monorepo 根目录**执行。

## 映射 CLI

```bash
pnpm run phase0:download -- \
  --url "<年报 PDF 直链或页面 URL>" \
  --stock-code <如 600887> \
  --year <如 2024> \
  --category 年报 \
  [--save-dir "./cache/reports/..."] \
  [--max-retries 3] \
  [--force-refresh]
```

环境变量兜底：`PHASE0_REPORT_URL`、`PHASE0_STOCK_CODE`、`PHASE0_YEAR`、`PHASE0_CATEGORY`。详见 [Phase 0 文档](../../docs/phase0-download.md)。

## 输入校验

- `url`、`stock-code`、`year`、`category` 为 CLI 必填项（缺失则非零退出）。
- 下载成功后打印本地 `filepath`、校验和等，供后续 `--pdf` 传入 `workflow:run` 或 `business-analysis:run`。

## 与编排衔接

1. 本命令：拿到本地 PDF 路径。
2. `pnpm run workflow:run -- --code ... --pdf "<上一步路径>"` 或 `pnpm run business-analysis:run -- ...`。
