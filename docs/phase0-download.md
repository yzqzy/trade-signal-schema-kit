# Phase 0 年报下载器（对齐 Turtle 标准）

[返回 README](../README.md) · [文档索引](./README.md)

## 支持能力

- **自动发现（可选）**：未传 `--url` 时，通过 Feed `GET /api/v1/stock/report/search`（与 Phase1B 同源）检索年报 PDF，再取白名单内链接下载（需 `FEED_BASE_URL`）。失败时提示手动传 `--url`。
- 严格白名单：`stockn.xueqiu.com`、`*.10jqka.com.cn`、`*.cninfo.com.cn`
- 自动重试与指数退避（默认 3 次）
- PDF 双重校验（`%PDF-` 魔数 + MIME 检测）
- `tmp` 写入后原子重命名落盘
- 缓存复用（同参数默认命中本地缓存）

## 执行命令

从仓库根目录执行。

**自动发现（推荐在已配置 Feed 时使用）**

```bash
pnpm run phase0:download -- \
  --stock-code "600519" \
  --category "年报" \
  --year "2024" \
  --save-dir "./cache/reports/SH600519" \
  --max-retries 3
```

**显式 PDF 链接**

```bash
pnpm run phase0:download -- \
  --url "https://stockn.xueqiu.com/path/to/report.pdf" \
  --stock-code "SH600519" \
  --category "年报" \
  --year "2024" \
  --save-dir "./cache/reports/SH600519" \
  --max-retries 3
```

发布到 npm 后也可使用 `npx`（统一命令 `ts-phase0-download`）：

```bash
npx --package @trade-signal/research-strategies ts-phase0-download \
  --url "https://stockn.xueqiu.com/path/to/report.pdf" \
  --stock-code "SH600519" \
  --category "年报" \
  --year "2024"
```

## 可选参数

- `--force-refresh`：忽略缓存并强制重新下载

## 环境变量（`.env`）

CLI 会自动尝试加载项目根目录 `.env`，支持以下变量：

- `PHASE0_REPORT_URL`
- `PHASE0_STOCK_CODE`
- `PHASE0_CATEGORY`
- `PHASE0_YEAR`
- `PHASE0_SAVE_DIR`
- `PHASE0_MAX_RETRIES`
- `PHASE0_FORCE_REFRESH`

参数优先级：**命令行参数 > `.env` 变量 > 内置默认值**。

## 退出码

- `0`：成功
- `1`：网络或上游失败
- `2`：PDF 校验失败
- `3`：参数错误、URL 不在白名单、或 **自动发现失败**（需改传 `--url`）
