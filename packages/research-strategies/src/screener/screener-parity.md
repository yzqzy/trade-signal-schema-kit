# Screener Python ↔ TypeScript 能力对照

参考：`references/projects/Turtle_investment_framework/scripts/screener_core.py`、`screener_config.py`、`tests/test_screener.py`（逻辑参考，数据源以本仓 feed / 自选 universe 为准）。

| 能力域 | 参考实现 (Python) | TS (`packages/research-strategies/src/screener`) | 状态 |
|--------|-------------------|--------------------------------------------------|------|
| Tier1 全市场快照 | 脚本内合并多表 | 由上游 **universe JSON**（或 HTTP feed）提供等价字段 | 已对齐（数据契约） |
| ST/PT/退市 名称过滤 | `_tier1_filter` | `cn-a.ts` 同名正则 | 已对齐 |
| 银行股 | `include_bank` | `includeBank` | 已对齐 |
| 上市年限 | `list_date` 日历截断 | `listDate` YYYYMMDD 日历截断 | 已对齐 |
| 市值门槛 | 脚本侧「万元→亿元」换算 | `marketCap` **百万元** ≥ `minMarketCapYi * 100` | 已对齐 |
| 换手率 | `min_turnover_pct`（%） | `minTurnoverPct` | 已对齐 |
| PB 区间 | `0 < pb <= max_pb` | 同左 | 已对齐 |
| 双通道 PE | 主通道：`pe` 有效且 `0<PE<=max_pe`；观察：`pe` **缺失** | 主通道同左；观察：**仅 `pe` 缺失**（finite `pe<=0` 整体丢弃） | 已对齐 |
| 主通道股息 | 股息率 > 0 | `dv > 0` | 已对齐 |
| Tier1 打分权重 | `dv_weight/pe_weight/pb_weight` | `ScreenerConfig` 三权重 | 已对齐 |
| Tier1 主通道裁剪 | `tier2_main_limit` | `tier2MainLimit` | 已对齐 |
| Tier2 硬否决 | 质押、审计意见 | 行字段 `pledgeRatio`、`auditResult`（无字段则跳过该检查） | 已对齐（契约） |
| Tier2 财务质量（主） | ROE/毛利率/负债率 | `roe`/`grossMargin`/`debtRatio` 与阈值 | 已对齐 |
| 观察通道质量 | FCF 边际、OCF>0、5 年 FCF 正年数等 | `validateObservationQuality` 使用 `ocf`/`capex`/`revenue`/`fcfPositiveYears` | 已对齐（需 universe 提供） |
| Factor2 R | `R = AA*(M/100)/mkt_cap*100` | `computeFactorSummary`：`payoutRatio`(M)、AA 分项、`marketCap` | 已对齐（M 缺省弱回退） |
| Factor4 / 打分 | 五维分位 + 权重 | `computeStandaloneScore` 同结构 | 已对齐 |
| Floor premium | `_extract_floor_price.premium` | `floorPremium` 行字段优先；否则 **受控回退**：默认 `pe/3`（`floorPremiumSource=pe_over_3_heuristic`）；`SCREENER_FLOOR_PREMIUM_FALLBACK=zero` 时为 0 | 已对齐（工程侧：**无 Turtle 五法底价**时显式标注来源；五法需 feed 提供 `floorPremium` 或后续专项实现） |
| 缓存分层 TTL | Parquet + meta；financial/market/global | `ScreenerDiskCache` JSON + `.meta.json`；分层 TTL 配置项 | 已对齐（实现形态不同） |
| CLI | `--tier1-only`、`--tier2-limit`、阈值覆盖、缓存刷新 | `cli.ts` 同名语义 | 已对齐 |
| 导出 CSV/HTML | 参考脚本列顺序 | `exportScreenerResultsCsv` / 报告表列 | 已对齐 |
| 数据源 | 参考脚本内联拉取 | **`fetchScreenerUniverseFromHttp`** 仅请求 **`GET …/stock/screener/universe`**；响应须为 `{ success, data: { total, page, pageSize, items } }`，否则 **抛错**；CLI 使用 `--input-json`；字段映射由 feed 适配层完成 | 按宿主 API 配置 |

## 数据接入（feed / 自选接口）

- **推荐**：由 **trade-signal-feed**（或实现同一契约的网关）提供上述 **单一路径、单一 JSON 形状**；不再支持多路径回退或顶层数组/`data` 数组兼容。
- **离线/批处理**：与现有一致，使用 `--input-json` 传入 universe 数组即可。

## 单位约定（TS universe）

- `marketCap`：**百万元**（与参考脚本中「万元总市值 → 百万元」换算结果一致）。
- `minMarketCapYi`：**亿元**，与参考配置 `min_market_cap_yi` 同语义。

## HK 未接入与 CLI 语义

- `trade-signal-feed` 的 `screener/universe` 在 `market=HK` 时返回空 `items`（`capability=not_ready`）。若将 **空数组** 作为 `--input-json` 且 `--market HK`，`runScreenerPipeline` 会写入 `capability.status = hk_not_ready`，**并非**「筛选条件过严」。
- `screener:run`（`cli.ts`）在 `hk_not_ready` 时向 **stderr** 输出人类可读说明 + 单行 JSON：`{"screenerExit":{"status":"hk_not_ready","reasonCodes":[...]}}`，并设置 **`process.exitCode = 2`**（仍写出 `screener_results.json` 供审计）。

## 字段分层（required_for_run / required_for_tier2 / optional）

运行前由 `buildUniverseCapability` 对全表统计缺失，并写入 `ScreenerRunOutput.capability`：

| 分层 | 含义 | 行为 |
|------|------|------|
| `required_for_run` | Tier1 可靠运行所需字段（见 `capability.ts` 常量） | 若 `marketCap`/`turnover`/`pb`/`dv` 等在**全部行**缺失 → `blocked_missing_required_fields`，pipeline **短路**，`results=[]`；CLI `exitCode=1` |
| `required_for_tier2_main` | Tier2 主通道质量门（`debtRatio`/`grossMargin`/`roe`/`netProfit`） | 若四者在**全部行**缺失 → `degraded_tier2_fields`，**仍跑 Tier1**；CLI **warn** + `screenerWarning` JSON |
| `optional_enhancement` | 因子/硬否决/观察通道增强字段 | 仅统计 `missingCountByField`，供解释降级，不单独阻断 |

部分行缺失 Tier2 主字段时：`status` 仍为 `ok`，但 `reasonCodes` 含 `required_for_tier2_main_partial_missing` 并在 `messages` 中给出计数。

## 弃用说明

- 旧配置键 `minMarketCap`（百万元绝对门槛）：`resolveScreenerConfig` 会转换为 `minMarketCapYi = minMarketCap/100`。
- `hardVetoDebtRatio`：参考 Python 默认无此项；若 overrides 仍传入则保留额外否决逻辑以兼容旧 JSON。
