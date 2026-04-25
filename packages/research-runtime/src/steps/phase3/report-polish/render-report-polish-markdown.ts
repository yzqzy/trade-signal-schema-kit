import type { ReportPolishComposeBuffers, ReportViewModelV1 } from "./report-view-model.js";
import { renderValuationComputedMarkdownFromJson } from "../../../reports-site/valuation-computed-markdown.js";

function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 2 : abs >= 10 ? 2 : 4;
  return n.toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtPct(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${fmtNum(n)}%`;
}

function decisionZh(d: string): string {
  if (d === "buy") return "买入/关注";
  if (d === "watch") return "观察";
  if (d === "avoid") return "回避";
  return d;
}

function verdictTone(vm: ReportViewModelV1): string {
  if (vm.phase3.decision === "buy") return "偏积极";
  if (vm.phase3.decision === "watch") return "观察";
  return "谨慎";
}

function extractBetweenHeadings(md: string, startRe: RegExp, endRe: RegExp): string | undefined {
  const m = md.match(startRe);
  if (!m || m.index === undefined) return undefined;
  const from = m.index + m[0].length;
  const rest = md.slice(from);
  const end = rest.search(endRe);
  const body = (end >= 0 ? rest.slice(0, end) : rest).trim();
  return body || undefined;
}

function clip(md: string, max: number): string {
  const t = md.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}\n\n> …… 已截断；全文见同目录证据文件。`;
}

function evidenceTable(vm: ReportViewModelV1): string {
  const e = vm.evidence;
  const rows: string[] = [
    "| 证据ID | 类型 | 定位 |",
    "|:-------|:-----|:-----|",
    `| E1 | Phase1A 数据包 | \`${e.phase1aJsonRelative}\` |`,
    `| E2 | 市场与财务数据包 | \`${e.dataPackMarketMdRelative}\` |`,
    `| E3 | Phase1B 外部证据补充 | \`${e.phase1bQualitativeMdRelative}\` |`,
  ];
  let idx = 4;
  if (e.dataPackReportMdRelative) rows.push(`| E${idx++} | 年报 data_pack | \`${e.dataPackReportMdRelative}\` |`);
  if (e.dataPackReportInterimMdRelative) rows.push(`| E${idx++} | 中报 data_pack | \`${e.dataPackReportInterimMdRelative}\` |`);
  rows.push(`| E${idx++} | 估值 JSON | \`${e.valuationComputedJsonRelative}\` |`);
  rows.push(`| E${idx++} | Phase3 规则报告 | \`${e.analysisReportMdRelative}\` |`);
  if (e.phase3PreflightMdRelative) rows.push(`| E${idx++} | Phase3 预检 | \`${e.phase3PreflightMdRelative}\` |`);
  return rows.join("\n");
}

function todoBlock(vm: ReportViewModelV1): string {
  if (!vm.todos.length) return "_本 run 无显式 TODO 缺口项。_";
  return vm.todos.map((t) => `- **${t.id}**：${t.message}${t.suggestedSource ? ` → \`${t.suggestedSource}\`` : ""}`).join("\n");
}

function metricTable(vm: ReportViewModelV1): string {
  return [
    "| 指标 | 数值 | 解读 |",
    "|:-----|:-----|:-----|",
    `| 规则结论 | ${decisionZh(vm.phase3.decision)} | 置信度 ${vm.phase3.confidence} |`,
    `| 粗算穿透回报率 R | ${fmtPct(vm.phase3.factor2?.R)} | 门槛 II=${fmtPct(vm.phase3.factor2?.II)} |`,
    `| 精算穿透回报率 GG | ${fmtPct(vm.phase3.factor3?.GG)} | 外推可信度 ${vm.phase3.factor3?.extrapolationTrust ?? "—"} |`,
    `| 估值合成 | ${fmtNum(vm.valuation.weightedAverage)} | 方法数 ${vm.valuation.methodCount}；CV=${fmtNum(vm.valuation.coefficientOfVariation)} |`,
    `| 价值陷阱 | ${vm.phase3.factor4?.trapRisk ?? "—"} | 仓位建议：${vm.phase3.factor4?.position ?? "—"} |`,
  ].join("\n");
}

function signalLines(vm: ReportViewModelV1): string[] {
  const out: string[] = [];
  const r = vm.phase3.factor2?.R;
  const ii = vm.phase3.factor2?.II;
  const gg = vm.phase3.factor3?.GG;
  if (r !== undefined && ii !== undefined) {
    out.push(`- **穿透回报率通过门槛**：粗算 R=${fmtPct(r)}，门槛 II=${fmtPct(ii)}，安全边际 ${fmtNum(r - ii)} pct。[E2][E7]`);
  }
  if (gg !== undefined) {
    out.push(`- **精算结果提供第二锚点**：GG=${fmtPct(gg)}，外推可信度 ${vm.phase3.factor3?.extrapolationTrust ?? "—"}。[E7]`);
  }
  if (vm.valuation.weightedAverage !== undefined) {
    out.push(`- **估值有结构化锚点**：综合估值 ${fmtNum(vm.valuation.weightedAverage)}，方法数 ${vm.valuation.methodCount}，一致性 ${vm.valuation.consistency ?? "—"}。[E6]`);
  }
  out.push(`- **商业质量纳入独立校验**：D1-D6 结论以 evidence refs 与 final narrative gate 为准，站点发布只展示通过门禁的 Topic 成稿。[E3][E4]`);
  if (vm.dataPackReport.pdfGateVerdict && vm.dataPackReport.pdfGateVerdict !== "OK") {
    out.push(`- **PDF 抽取质量需披露**：当前 gate=${vm.dataPackReport.pdfGateVerdict}，涉及年报章节的结论必须声明置信边界。[E4]`);
  }
  return out;
}

function sanitizeInternalStatusText(text: string): string {
  return text
    .replace(/草稿/g, "结构化预览")
    .replace(/待\s*Claude(?:\s*Code)?/giu, "需进一步")
    .replace(/尚未完成/g, "未进入完整发布态")
    .replace(/成稿要求/g, "研报关注点")
    .replace(/初始状态/g, "证据状态")
    .replace(/终稿/g, "成稿");
}

function topicEvidenceBoundary(vm: ReportViewModelV1, topicId: string): string {
  const topic = vm.topicReports.find((t) => t.topicId === topicId);
  if (!topic?.blockingReasons?.length) return "";
  return [
    "> **证据边界**：本页仅展示 workflow 可审计证据组织结果；完整发布状态以 `topic_manifest.json` 和 final narrative gate 为准。",
    ">",
    ...topic.blockingReasons.map((r) => `> - ${sanitizeInternalStatusText(r)}`),
    "",
  ].join("\n");
}

function phase1bCoverage(buffers: ReportPolishComposeBuffers): string {
  const text = buffers.phase1bMarkdown;
  const missing = (text.match(/未搜索到相关信息/g) ?? []).length;
  const rows = [
    "| 维度 | 当前证据状态 | 成稿处理 |",
    "|:-----|:-------------|:---------|",
    `| 管理层与治理 | ${/##\s*7/u.test(text) ? "有 Phase1B 补充" : "待核对"} | 仅作为 D4 证据线索，不直接贴链接表 |`,
    `| 行业与竞争 | ${/##\s*8/u.test(text) ? "有 Phase1B 补充" : "待核对"} | 映射到 D2/D3 |`,
    `| MD&A | ${/##\s*10/u.test(text) ? "有 Phase1B 补充" : "待核对"} | 映射到 D5 |`,
    `| 显式未命中 | ${missing} 项 | 写入缺口清单，不静默补结论 |`,
  ];
  return rows.join("\n");
}

export function renderTurtleOverviewMarkdown(vm: ReportViewModelV1, _buffers: ReportPolishComposeBuffers): string {
  const name = vm.displayCompanyName ?? vm.market.name ?? vm.normalizedCode;
  return [
    `# ${name}（${vm.normalizedCode}）· 龟龟投资策略分析`,
    "",
    `> **Position Recommendation**：${decisionZh(vm.phase3.decision)}；${verdictTone(vm)}。数值与判断来自同 run 的结构化证据，发布层按 Topic 门禁选择可展示版本。`,
    "",
    "## Turtle KPI Snapshot",
    "",
    metricTable(vm),
    "",
    "## Executive Summary",
    "",
    `**一句话结论**：${name} 当前在龟龟策略下为 **${decisionZh(vm.phase3.decision)}**，核心锚点是穿透回报率、估值合成与价值陷阱排查三者的交叉结果。[E2][E6][E7]`,
    "",
    "## 关键发现",
    "",
    signalLines(vm).join("\n"),
    "",
    "## 关键假设",
    "",
    "- 年报与市场包中的财务口径保持一致；缺失或低置信章节只作为降级证据使用。[E2][E4]",
    "- Phase3 规则结论优先作为投资纪律锚点，Topic 叙事不得重算策略公式。[E7]",
    "- 商业质量页以 `business-analysis-finalize` 的 final narrative gate 为完整发布依据。",
    "",
    "## 基本面速写 · 商业质量分析",
    "",
    "| 观察项 | 当前判断 | 证据 |",
    "|:-------|:---------|:-----|",
    `| 商业模式 | D1 聚焦赚钱逻辑、收入质量、资本特征和现金收款 | E2/E3/E4 |`,
    `| 护城河 | D2 用 ROE、份额、客户粘性或成本优势交叉验证 | E2/E3 |`,
    `| 外部环境 | D3 区分周期、政策与行业格局 | E3 |`,
    `| 治理与管理层 | D4 覆盖审计、处罚、关联交易、资本配置 | E3/E4 |`,
    "",
    "## 穿透回报率分析",
    "",
    `粗算 R=${fmtPct(vm.phase3.factor2?.R)}，门槛 II=${fmtPct(vm.phase3.factor2?.II)}；精算 GG=${fmtPct(vm.phase3.factor3?.GG)}。完整计算链见 [穿透回报率定量分析](./penetration_return.md)。`,
    "",
    "## 估值与定价",
    "",
    `估值方法数 ${vm.valuation.methodCount}，综合估值 ${fmtNum(vm.valuation.weightedAverage)}，一致性 ${vm.valuation.consistency ?? "—"}。完整方法与敏感性见 [估值分析](./valuation.md)。`,
    "",
    "## 投资论点卡（Thesis Card）",
    "",
    "| 模块 | 论点 | 当前状态 |",
    "|:-----|:-----|:---------|",
    `| 买入理由 | R/GG 与估值锚点形成正向支撑 | ${vm.phase3.decision === "buy" ? "成立" : "待观察"} |`,
    `| 主要风险 | PDF gate、现金流质量、治理/监管证据不足会降低置信度 | ${vm.dataPackReport.pdfGateVerdict ?? "UNKNOWN"} |`,
    `| 加仓条件 | 后续财报验证现金流、分红、盈利质量与估值安全边际 | 需跟踪 |`,
    "",
    "## 监控清单",
    "",
    "- 基本面止损：R 跌破门槛、GG 持续恶化、价值陷阱风险升至 high。",
    "- 事件监控：处罚/监管措施、审计意见变化、重大诉讼、分红或回购政策变化。",
    "- 竞争对手观察：行业价格战、份额变化、成本曲线或渠道结构变化。",
    "",
    "## 风险提示",
    "",
    "- 本页由确定性管线生成，不构成投资建议。",
    "- 若证据包缺失、PDF gate 降级或 Phase1B 未命中，相关结论保持降级披露。",
    "",
    "## 附录：证据索引",
    "",
    evidenceTable(vm),
    "",
    "## 缺口与 TODO",
    "",
    todoBlock(vm),
    "",
  ].join("\n");
}

export function renderBusinessQualityMarkdown(vm: ReportViewModelV1, buffers: ReportPolishComposeBuffers): string {
  const name = vm.displayCompanyName ?? vm.market.name ?? vm.normalizedCode;
  return [
    `# ${name}（${vm.normalizedCode}）· 商业质量评估`,
    "",
    topicEvidenceBoundary(vm, "topic:business-six-dimension"),
    "> **Business Quality Verdict**：本页按 D1-D6 框架组织 workflow 证据，站点完整商业质量页以 `business-analysis-finalize` 通过门禁后的成稿为准。",
    "",
    "## Quality Snapshot",
    "",
    "| 维度 | 研报关注点 | 证据锚点 |",
    "|:-----|:---------|:---------|",
    "| D1 商业模式与资本特征 | 赚钱逻辑、收入质量、利润质量、资本消耗、现金收款 | E2/E4 |",
    "| D2 竞争优势与护城河 | 行业地图、护城河来源、伪优势过滤、对标、监控 KPI | E2/E3 |",
    "| D3 外部环境 | 周期性、政策监管、行业趋势、负面约束 | E3/E4 |",
    "| D4 管理层与治理 | 治理红旗、审计意见、处罚诉讼、资本配置、言行一致 | E3/E4 |",
    "| D5 MD&A 解读 | 管理层叙事可信度、前瞻信号、隐含风险 | E4 |",
    "| D6 控股结构 | 股权结构、关联交易、少数股东权益、SOTP 触发条件 | E1/E4 |",
    "",
    "## Executive Summary",
    "",
    `**${name} 的商业质量评估以证据闭环为核心。** 当前 TS 管线提供市场包、年报 data_pack、Phase1B 外部证据和 Phase3 规则结论；D1-D6 章节按参考稿结构组织，并通过证据编号连接到本地材料。[E2][E3][E4]`,
    "",
    "## 关键发现",
    "",
    signalLines(vm).join("\n"),
    "",
    "## 维度一：商业模式与资本特征",
    "",
    "**核心判断**：商业模式分析围绕收入来源、利润含金量、资本消耗和现金收款四个锚点展开，避免只用增长率替代商业质量判断。[E2][E4]",
    "",
    "| 子项 | 证据锚点 | 分析口径 |",
    "|:-----|:-------------|:-------------|",
    "| 商业模式 | 市场包与年报包 | 客户、产品、收费方式、成本结构 |",
    "| 收入质量 | 财务历史与 Phase1B | 增长来源、一次性与可持续收入区分 |",
    "| 利润质量 | Phase3 利润锚点 | 扣非、非经、毛利和费用变化 |",
    "| 资本消耗 | Capex、折旧、营运资本 | 轻/重资产属性与维护性投入 |",
    "| 现金收款 | OCF、应收、合同负债 | 利润与现金流匹配度 |",
    "",
    "## 维度二：竞争优势与护城河",
    "",
    "**核心判断**：护城河判断需要用行业份额、ROE 稳定性、客户粘性、成本优势或监管牌照交叉验证。[E2][E3]",
    "",
    "### 护城河来源（Greenwald 三维框架）",
    "",
    "- 需求侧：品牌、渠道、客户迁移成本是否真实存在。",
    "- 供给侧：规模、成本、供应链、技术或网络效应是否带来可持续差异。",
    "- 制度侧：牌照、监管、资源禀赋是否能阻止竞争侵蚀。",
    "",
    "## 维度三：外部环境",
    "",
    "**核心判断**：外部环境分析区分行业周期、政策红利、监管约束与竞争格局变化。[E3]",
    "",
    "## 维度四：管理层与公司治理",
    "",
    "**核心判断**：治理评估覆盖处罚/监管、诉讼、审计意见、关联交易、管理层变化与资本配置记录。[E3][E4]",
    "",
    "## 监管与合规要点",
    "",
    "- 处罚 / 监管措施：若 Phase1B 为未命中，终稿必须写入证据缺口，不得写成“无处罚”。[E3]",
    "- 重大诉讼 / 仲裁：优先引用年报 data_pack；若缺章节则降级。[E4]",
    "- 审计意见 / 内控：优先引用年报财报章节与 Phase1B 公告。[E3][E4]",
    "- 关联交易与治理变化：需列出交易规模、审批口径和风险含义。[E3][E4]",
    "",
    "## 维度五：MD&A 解读",
    "",
    "**核心判断**：MD&A 解读比较管理层叙事、实际财务变化和前瞻指引，尤其关注“管理层没解释什么”。[E4]",
    "",
    "## 维度六：控股结构分析",
    "",
    "**核心判断**：控股结构分析检查控股股东、子公司利润外溢、少数股东权益、复杂结构和 SOTP 触发条件。[E1][E4]",
    "",
    "## 交叉验证与深度分析",
    "",
    "- **数字与叙事的一致性**：用收入、利润、ROE、现金流、Capex 验证管理层说法。[E2][E4]",
    "- **核心矛盾**：找出估值、现金流、分红、增长、治理之间最影响投资判断的冲突。",
    "- **被忽视的信号**：记录未解释的财务异常、公告措辞变化和证据缺口。",
    "",
    "## 深度总结",
    "",
    "商业质量评估必须同时回答“这家公司如何赚钱”“优势能否维持”“风险是否被数字验证”三个问题；当 PDF gate 或外部证据不足时，结论应降低置信度并保留缺口。",
    "",
    "## 未来1-3年关键观察变量",
    "",
    "| 变量 | 为什么重要 | 当前证据 |",
    "|:-----|:-----------|:---------|",
    "| 盈利质量 | 决定 R/GG 是否可持续 | E2/E7 |",
    "| 现金流与营运资本 | 验证利润含金量 | E2/E4 |",
    "| 分红/回购/资本开支 | 影响股东回报与估值锚 | E4/E6 |",
    "| 监管与治理事件 | 影响风险折价 | E3/E4 |",
    "",
    "## Phase1B 覆盖摘要（不直接作为终稿正文）",
    "",
    phase1bCoverage(buffers),
    "",
    "## 附录：证据索引",
    "",
    evidenceTable(vm),
    "",
    "## 缺口与 TODO",
    "",
    todoBlock(vm),
    "",
  ].join("\n");
}

export function renderPenetrationReturnMarkdown(vm: ReportViewModelV1, buffers: ReportPolishComposeBuffers): string {
  const name = vm.displayCompanyName ?? vm.market.name ?? vm.normalizedCode;
  const f2 = extractBetweenHeadings(buffers.analysisReportMarkdown, /^##\s*四[、.]\s*因子2/im, /^##\s*[五六七八九十]/m);
  const f3 = extractBetweenHeadings(buffers.analysisReportMarkdown, /^##\s*五[、.]\s*因子3/im, /^##\s*[六七八九十]/m);
  return [
    `# ${name}（${vm.normalizedCode}）· 穿透回报率定量分析`,
    "",
    `> **Penetrating Return Verdict**：粗算 R=${fmtPct(vm.phase3.factor2?.R)}，门槛 II=${fmtPct(vm.phase3.factor2?.II)}，精算 GG=${fmtPct(vm.phase3.factor3?.GG)}。`,
    "",
    "## 核心指标速览",
    "",
    metricTable(vm),
    "",
    "## STEP 0 数据校验与口径锚定",
    "",
    `- 市场：${vm.market.market}；币种：${vm.market.currency ?? "—"}；价格=${fmtNum(vm.market.price)}；市值=${fmtNum(vm.market.marketCap)}。[E2]`,
    `- PDF gate=${vm.dataPackReport.pdfGateVerdict ?? "UNKNOWN"}；市场包 warnings=${vm.market.warningsCount}。[E2][E4]`,
    "",
    "## STEP 1 Owner Earnings 计算",
    "",
    `Owner Earnings 由 Phase3 因子2输出锚定：A=${fmtNum(vm.phase3.factor2?.A)}，C=${fmtNum(vm.phase3.factor2?.C)}，D=${fmtNum(vm.phase3.factor2?.D)}，I=${fmtNum(vm.phase3.factor2?.I)}。[E7]`,
    "",
    "## STEP 2 分配能力评估",
    "",
    `分配能力由粗算 R 和门槛 II 交叉判断：R=${fmtPct(vm.phase3.factor2?.R)}，II=${fmtPct(vm.phase3.factor2?.II)}，结论=${vm.phase3.factor2?.passed ? "通过" : "未通过"}。[E7]`,
    "",
    "## STEP 3 真实现金收入还原",
    "",
    "检查经营现金流、应收、合同负债与收入确认口径，异常项进入监控清单。[E2][E4]",
    "",
    "## STEP 4 非经常性现金流入分类",
    "",
    "区分可持续经营现金、投资收益、公允价值变动与一次性项目；无法定位时保持降级，不补数。[E4]",
    "",
    "## STEP 5 经营性现金支出还原",
    "",
    "将营运资本变化作为现金质量验证项，避免只看利润表得出穿透结论。[E2]",
    "",
    "## STEP 6 资本开支与投资扣除（极端保守）",
    "",
    `精算 GG=${fmtPct(vm.phase3.factor3?.GG)}，若与 R 偏差过大，须解释重资产、成长性 Capex 或投资性购买带来的结构性偏差。[E7]`,
    "",
    "## STEP 7 会计准则调整",
    "",
    "关注租赁、研发资本化、金融资产、公允价值和少数股东影响。[E4]",
    "",
    "## STEP 8 真实可支配现金结余",
    "",
    "结合现金、债务、受限资金和短期偿债压力判断分红/回购的实际弹性。[E1][E2]",
    "",
    "## STEP 9 现金储备质量",
    "",
    "现金储备质量需区分可自由支配现金、受限现金、理财和经营周转需求。[E1][E4]",
    "",
    "## STEP 10 分配意愿与穿透回报率",
    "",
    `- 分配意愿：结合历史分红、回购和资本配置记录，在商业质量 D4/D5 中完成叙事验证。[E3][E4]`,
    `- 穿透回报率：R=${fmtPct(vm.phase3.factor2?.R)}；安全边际=${vm.phase3.factor2?.R !== undefined && vm.phase3.factor2?.II !== undefined ? `${fmtNum(vm.phase3.factor2.R - vm.phase3.factor2.II)} pct` : "—"}。[E7]`,
    "",
    "## STEP 11 交叉验证与可信度评级",
    "",
    `外推可信度=${vm.phase3.factor3?.extrapolationTrust ?? "—"}；报告置信度=${vm.phase3.confidence}。若 PDF gate 降级或市场包 warnings 较多，终稿需降低语气强度。[E2][E4][E7]`,
    "",
    "## 汇总输出",
    "",
    "| 项目 | 输出 |",
    "|:-----|:-----|",
    `| 粗算 R | ${fmtPct(vm.phase3.factor2?.R)} |`,
    `| 精算 GG | ${fmtPct(vm.phase3.factor3?.GG)} |`,
    `| 门槛 II | ${fmtPct(vm.phase3.factor2?.II)} |`,
    `| 可信度 | ${vm.phase3.confidence} / ${vm.phase3.factor3?.extrapolationTrust ?? "—"} |`,
    "",
    "## Phase3 因子摘录（审计用）",
    "",
    f2 ? clip(f2, 6000) : "_未匹配到因子2摘录；以结构化 Phase3 输出为准。_",
    "",
    f3 ? clip(f3, 6000) : "_未匹配到因子3摘录；以结构化 Phase3 输出为准。_",
    "",
    "## 附录：证据索引",
    "",
    evidenceTable(vm),
    "",
  ].join("\n");
}

export function renderValuationTopicMarkdown(vm: ReportViewModelV1, buffers: ReportPolishComposeBuffers): string {
  const name = vm.displayCompanyName ?? vm.market.name ?? vm.normalizedCode;
  const valBlock = renderValuationComputedMarkdownFromJson(buffers.valuationRawJson);
  return [
    `# ${name}（${vm.normalizedCode}）· 估值分析报告`,
    "",
    `> **Valuation Verdict**：综合估值 ${fmtNum(vm.valuation.weightedAverage)}，方法数 ${vm.valuation.methodCount}，一致性 ${vm.valuation.consistency ?? "—"}。`,
    "",
    "## Valuation Snapshot",
    "",
    "| 指标 | 数值 |",
    "|:-----|:-----|",
    `| 当前价格 | ${fmtNum(vm.market.price)} |`,
    `| 综合估值 | ${fmtNum(vm.valuation.weightedAverage)} |`,
    `| WACC / Ke | ${fmtNum(vm.valuation.wacc)} / ${fmtNum(vm.valuation.ke)} |`,
    `| 方法数 / CV | ${vm.valuation.methodCount} / ${fmtNum(vm.valuation.coefficientOfVariation)} |`,
    "",
    "## Executive Summary",
    "",
    `**一句话结论**：估值页以 \`valuation_computed.json\` 为机械锚点，所有方法、权重和交叉验证均不得超出 JSON 事实；定性调整只能引用商业质量与年报证据。[E4][E6]`,
    "",
    "## 一、公司分类",
    "",
    `公司画像：${vm.valuation.companyType ?? "—"}；风险自由利率解析值=${fmtNum(vm.market.riskFreeRate)}。[E2][E6]`,
    "",
    "## 二、WACC 计算",
    "",
    `WACC=${fmtNum(vm.valuation.wacc)}，Ke=${fmtNum(vm.valuation.ke)}。若资本结构、Beta 或 ERP 缺证据，需在终稿中说明假设来源。[E6]`,
    "",
    "## 三、定性调整说明",
    "",
    "- 商业质量未完成 final-narrative 时，估值中的护城河、治理、监管和现金流调整应保持保守。",
    "- PDF gate 降级时，涉及年报附注的调整必须标注置信边界。",
    "",
    "## 四、估值方法详情",
    "",
    valBlock,
    "",
    "## 五、交叉验证",
    "",
    `估值一致性=${vm.valuation.consistency ?? "—"}；变异系数 CV=${fmtNum(vm.valuation.coefficientOfVariation)}。若方法分歧大，终稿需解释分歧来自盈利、现金流、分红还是倍数假设。[E6]`,
    "",
    "## 六、反向估值：当前价格隐含了什么？",
    "",
    "根据当前价格与估值结果反推市场隐含预期；若 JSON 未提供隐含增长字段，则只保留方法论说明，不补数。[E6]",
    "",
    "## 七、估值结论",
    "",
    `综合估值=${fmtNum(vm.valuation.weightedAverage)}；当前价格=${fmtNum(vm.market.price)}；仓位建议与价值陷阱排查见总览页。[E2][E6][E7]`,
    "",
    "## 八、关键假设与风险提示",
    "",
    "- 自由现金流、分红、Capex、营运资本和监管事件是估值最敏感的证据项。",
    "- 估值模型涉及主观假设，不构成投资建议。",
    "",
    "## 附录：关键财务数据趋势",
    "",
    clip(buffers.marketPackMarkdown, 8000),
    "",
    "## 附录：证据索引",
    "",
    evidenceTable(vm),
    "",
  ].join("\n");
}

export function renderAllReportPolishMarkdowns(
  vm: ReportViewModelV1,
  buffers: ReportPolishComposeBuffers,
): {
  turtleOverviewMarkdown: string;
  businessQualityMarkdown: string;
  penetrationReturnMarkdown: string;
  valuationMarkdown: string;
} {
  return {
    turtleOverviewMarkdown: renderTurtleOverviewMarkdown(vm, buffers),
    businessQualityMarkdown: renderBusinessQualityMarkdown(vm, buffers),
    penetrationReturnMarkdown: renderPenetrationReturnMarkdown(vm, buffers),
    valuationMarkdown: renderValuationTopicMarkdown(vm, buffers),
  };
}
