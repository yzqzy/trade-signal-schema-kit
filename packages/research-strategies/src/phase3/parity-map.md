# Phase3 Strict 1:1 Parity Map (A股)

| Rule ID | Turtle Requirement | Target File/Symbol | Status |
|---|---|---|---|
| P3-STEP1 | 读取 `data_pack_market.md`，优先检查 §13 Warnings | `phase3/market-pack-parser.ts::parseDataPackMarket` | implemented |
| P3-STEP1-REPORT | 读取 `data_pack_report.md` 与可选 `interim` | `phase3/report-pack-parser.ts::parseDataPackReport` | implemented |
| P3-STEP1-CRITICAL | 净利润/OCF/Capex 缺失终止 | `phase3/analyzer.ts::validateCriticalData` | implemented |
| P3-STEP1.5 | Q3/H1 年化规则与高季节性注记 | `phase3/factors/step15-normalize.ts::applyInterimNormalization` | implemented |
| P3-F1A-GATE | 因子1A 六项一票否决 | `phase3/factors/factor1.ts::runFactor1A` | implemented |
| P3-F1B-M6 | 模块六管理层否决门 | `phase3/factors/factor1.ts::runFactor1B` | implemented |
| P3-F2-S2 | FCF长期为负+持续借债一票否决 | `phase3/factors/factor2.ts::runFactor2` | implemented |
| P3-F2-S4 | R<Rf 或 R<II×0.5 不进入因子3 | `phase3/factors/factor2.ts::runFactor2` | implemented |
| P3-F3-S11 | 因子3交叉验证背离否决/折扣 | `phase3/factors/factor3.ts::runFactor3` | implemented |
| P3-F4-S1 | GG<II 且成长占比<30% 排除 | `phase3/factors/factor4.ts::runFactor4` | implemented |
| P3-F4-S2 | 价值陷阱>=2 且 GG<II×1.5 排除 | `phase3/factors/factor4.ts::runFactor4` | implemented |
| P3-CHECKPOINT | 每因子追加 checkpoint | `phase3/analyzer.ts::appendCheckpoint` | implemented |
| P3-TEMPLATE | 报告模板章节 1:1 | `phase3/report-renderer.ts::renderPhase3Markdown` | implemented |
| P3-CLI-CONTRACT | CLI 支持 market/report markdown 输入 | `phase3/cli.ts::parseArgs/loadInput` | implemented |
| P1A-MARKET-PACK | 编排生成 `data_pack_market.md`：§1~§17 骨架、多年表、§13 Warnings | `workflow/build-market-pack.ts` | implemented |
| PREFLIGHT-1A | `turtle-strict` / `business-analysis --strict` 下 Phase1A 后门禁 | `pipeline/preflight.ts` | implemented |
| P2B-MDA | `data_pack_report.md` 默认含 **MDA**（`--no-mda` 可关闭） | `phase2b/renderer.ts` | implemented |
| QUAL-D1D6 | 输出 `qualitative_d1_d6.md`（Turtle D1~D6 契约骨架） | `business-analysis/d1-d6-scaffold.ts` | implemented |
| HTML-SEM | Phase3 / `report-to-html` 默认语义化 HTML（`--legacy-pre` 回退） | `phase3/markdown-to-html.ts` | implemented |
| VAL-FULL-REPORT | `valuation:run --full-report` 额外写 `analysis_report.md/html` | `valuation/cli.ts` | implemented |
