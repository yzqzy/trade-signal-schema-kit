/** 严格模式错误前缀，供 CLI / 文档对齐 */

export const STRICT_BUSINESS_ANALYSIS_PREFIX = "[strict:business-analysis]";
/** workflow 严格编排（`--mode turtle-strict`）相关错误前缀；与 Slash `/workflow-analysis` 对应，不含策略名 */
export const STRICT_WORKFLOW_STRICT_PREFIX = "[strict:workflow:strict]";
export const STRICT_PREFLIGHT_PREFIX = "[strict:preflight]";

export function strictBusinessAnalysisMissingPdf(): string {
  return `${STRICT_BUSINESS_ANALYSIS_PREFIX} 缺少可解析的年报 PDF：请提供 --pdf <path> 或 --report-url <url>；或在可用数据源下由自动发现补齐（失败时会单独报错）。`;
}

export function strictBusinessAnalysisDiscoveryFailed(detail: string): string {
  return `${STRICT_BUSINESS_ANALYSIS_PREFIX} 自动发现年报失败：${detail}。请改传 --report-url <url> 或 --pdf <path>。`;
}

export function strictBusinessAnalysisMissingReportPack(): string {
  return `${STRICT_BUSINESS_ANALYSIS_PREFIX} 未生成 data_pack_report.md：请确认 PDF 路径有效且 Phase2A/2B 成功。`;
}

export function strictWorkflowStrictMissingPdf(): string {
  return `${STRICT_WORKFLOW_STRICT_PREFIX} 缺少 PDF 输入：请提供 --pdf <path> 或 --report-url <url>（用于生成 data_pack_report.md 并进入 Phase3）。`;
}

export function strictWorkflowStrictMissingReportPack(): string {
  return `${STRICT_WORKFLOW_STRICT_PREFIX} 未生成 data_pack_report.md：请确认 PDF 可读且 Phase2A/2B 成功（或检查 --pdf / --report-url）。`;
}

export function strictWorkflowStrictDiscoveryFailed(detail: string): string {
  return `${STRICT_WORKFLOW_STRICT_PREFIX} 自动发现年报失败：${detail}。请改传 --report-url <url> 或 --pdf <path>。`;
}

export function strictPreflightPhase1AFailed(detail: string): string {
  return `${STRICT_PREFLIGHT_PREFIX} Phase1A Pre-flight 未通过：${detail}`;
}

export function strictPreflightPhase3Abort(detail: string): string {
  return `${STRICT_PREFLIGHT_PREFIX} Phase3 Pre-flight ABORT：${detail}`;
}

export function strictPreflightPhase3SupplementNeeded(): string {
  return `${STRICT_PREFLIGHT_PREFIX} Phase3 Pre-flight 需要补救（SUPPLEMENT_NEEDED）。请按同目录 phase3_preflight.md 中的 SUPPLEMENT_REQUEST 补齐后，使用 --preflight-remedy-pass 1 重跑（最多一次）。`;
}
