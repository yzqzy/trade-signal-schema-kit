# Phase 0 年报下载器（对齐 Turtle 标准）

[返回项目首页](../../README.md) · [文档索引](../README.md)

## 支持能力

- **自动发现（可选）**：未传 `--url` 时，通过 Feed `GET /api/v1/stock/report/search`（与 Phase1B 同源）检索年报 PDF，再取白名单内链接下载（需 `FEED_BASE_URL`）。若该财年尚未披露或数据源暂无公告，CLI 会以 `NO_DATA` 状态与退出码 `4` 结束（非系统故障）；配置/参数问题仍为 `FAILED` + 退出码 `3`。
- **默认落盘目录**：未传 `--save-dir` 且未设置 `PHASE0_SAVE_DIR` 时，PDF 写入 **当前工作目录** 下的 `cache/reports/<stock-code>/`（与显式传 `./cache/reports/...` 一致）。
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
  --max-retries 3
```

（可选）自定义目录：`--save-dir "./cache/reports/SH600519"`。

**显式 PDF 链接**

```bash
pnpm run phase0:download -- \
  --url "https://stockn.xueqiu.com/path/to/report.pdf" \
  --stock-code "SH600519" \
  --category "年报" \
  --year "2024" \
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

参数优先级：**命令行参数 > `.env` 变量 > 内置默认值**（`--save-dir` / `PHASE0_SAVE_DIR` 未设置时使用默认 `cache/reports/<code>/`）。

## 退出码

- `0`：成功
- `1`：网络或上游失败
- `2`：PDF 校验失败
- `3`：参数错误、URL 不在白名单、或自动发现 **配置/调用失败**（需检查 `FEED_BASE_URL`、域名白名单或改传 `--url`）
- `4`：**暂无可用年报 PDF**（常见为该财年尚未披露）；结果块中 `status: NO_DATA`

## 相关文档

- [主流程与 Stage 映射](./workflows.md)

## 与 Phase3 / 商业分析（MVP 规则 A/B/C）

- 年报 PDF 经 Phase2A/2B 生成 `data_pack_report.md` 后，才满足 **D5（MD&A）交付级** 证据；仅 Phase1B 公告检索时为预研级（见 `phase3_preflight.md` 与 `qualitative_d1_d6.md` 中「PDF 与交付语义」/ D5 提示）。
- 自动发现依赖 `FEED_BASE_URL`，与 Phase1B 同源 `report/search`；下载结果可作为 `workflow:run --pdf ...` 的输入。
