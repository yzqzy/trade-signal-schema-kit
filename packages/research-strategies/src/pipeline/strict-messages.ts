/** 严格模式错误前缀，供 CLI / 文档对齐 */

export const STRICT_BUSINESS_ANALYSIS_PREFIX = "[strict:business-analysis]";
export const STRICT_WORKFLOW_TURTLE_PREFIX = "[strict:workflow:turtle-strict]";

export function strictBusinessAnalysisMissingPdf(): string {
  return `${STRICT_BUSINESS_ANALYSIS_PREFIX} 缺少 PDF 输入：请提供 --pdf <path> 或 --report-url <url>（用于生成 data_pack_report.md）。`;
}

export function strictBusinessAnalysisMissingReportPack(): string {
  return `${STRICT_BUSINESS_ANALYSIS_PREFIX} 未生成 data_pack_report.md：请确认 PDF 路径有效且 Phase2A/2B 成功。`;
}

export function strictWorkflowTurtleMissingPdf(): string {
  return `${STRICT_WORKFLOW_TURTLE_PREFIX} 缺少 PDF 输入：请提供 --pdf <path> 或 --report-url <url>（用于生成 data_pack_report.md 并进入 Phase3）。`;
}

export function strictWorkflowTurtleMissingReportPack(): string {
  return `${STRICT_WORKFLOW_TURTLE_PREFIX} 未生成 data_pack_report.md：请确认 PDF 可读且 Phase2A/2B 成功（或检查 --pdf / --report-url）。`;
}

export function strictWorkflowTurtleDiscoveryFailed(detail: string): string {
  return `${STRICT_WORKFLOW_TURTLE_PREFIX} 自动发现年报失败：${detail}。请改传 --report-url <url> 或 --pdf <path>。`;
}
