# Phase2A/2B 与 Turtle 参考仓差异画像（`pdf_preprocessor.py`）

> 基线参考：`references/projects/Turtle_investment_framework/scripts/pdf_preprocessor.py`  
> 本仓实现：`phase2a/extractor.ts`、`phase2a/zones.ts`、`phase2a/keywords.ts`、`phase2b/renderer.ts`

## 已对齐能力（本轮强化后）

| 维度 | Python 参考 | TS 实现 | 说明 |
|------|---------------|---------|------|
| 分区消歧 | `ZONE_MARKERS` + `detect_zones` | `detectPageZones` | 继承式页→分区映射 |
| 章节分区偏好 | `SECTION_ZONE_PREFERENCES` | `PHASE2A_SECTION_ZONE_PREFERENCES` | prefer/avoid 加减分 |
| 交叉引用惩罚 | `详见/参见/参照` 前窗 | `scoreSectionCandidate` | 降低误召回附注索引行 |
| SUB 上下文 | 权益法/减值 vs 营收/注册资本 | 同左 | 降低误提长期股权投资附注 |
| P3 上下文 | 预付/应付等非应收账龄 | 同左 | 降低误提其他账龄表 |
| 标题形态加分 | `\d+[、.．]关键词` | `headingBonusForKeyword` | 提升真标题命中 |
| 诊断输出 | （脚本日志） | `metadata.sectionDiagnostics` + `PdfSectionBlock.extractionWarnings` | 可回归、可解释 |
| 附注起点 | 财务报告节 / 附注 | `detectAnnexStartPage` | 与参考类似的启发式 |

## 已知残差 / 误差来源

| 类型 | 风险 | 缓解 |
|------|------|------|
| 漏召回 | OCR/扫描件无文本、`pdf-parse` 与 pdfplumber 版式差异 | 依赖上游 PDF 质量；可考虑未来接表格感知管道 |
| 误召回 | 目录页、索引页关键词 | TOC 惩罚 + 分区 avoid |
| 页码边界 | 章节极长或跨节粘连 | `findSectionEndPage` + 最大跨度钳制 |
| Interim | 中报章节标题与年报不一致 | `reportKind: interim` 文案提示 + 仍用同一套关键词 |

## 回归与验收

- `pnpm --filter @trade-signal/research-strategies run test:phase2`：分区与评分单测
- `pnpm run test:linkage`：Phase2B 渲染契约
- `pnpm run quality:all`：全链路不变
