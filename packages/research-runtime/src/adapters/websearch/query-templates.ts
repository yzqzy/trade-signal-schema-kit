import type { Phase1BInput } from "../../steps/phase1b/types.js";

export const PHASE1B_WEB_SEARCH_ITEMS = new Set<string>(["违规/处罚记录", "行业监管动态", "回购计划"]);

function clip100(s: string): string {
  const t = s.trim();
  if (t.length <= 100) return t;
  return t.slice(0, 100);
}

/**
 * 为三条目生成 primary / fallback 检索词（≤100 字符以符合火山限制）。
 */
export function buildPhase1bWebSearchQueries(
  item: string,
  input: Phase1BInput,
): { primary: string[]; fallback: string[] } {
  const name = (input.companyName ?? "").trim();
  const code = (input.stockCode ?? "").trim();
  const y = (input.year?.trim() && /^\d{4}$/.test(input.year.trim()) ? input.year.trim() : String(new Date().getFullYear() - 1));

  if (item === "违规/处罚记录") {
    return {
      primary: [
        clip100(`${name} ${code} 行政处罚 监管措施 警示函`),
        clip100(`${name} ${code} 证监会 问询函 立案`),
        clip100(`${name} ${code} 诉讼 仲裁 处罚 整改`),
      ],
      fallback: [
        clip100(`${name} 违规 处罚 监管`),
        clip100(`${code} 纪律处分 公开谴责`),
        clip100(`${name} 关注函 监管函 问询函`),
      ],
    };
  }

  if (item === "行业监管动态") {
    return {
      primary: [
        clip100(`${name} ${code} 行业监管 政策 规范 监管动态 ${y}`),
        clip100(`${name} ${code} 证监会 交易所 监管 问询 处罚 ${y}`),
      ],
      fallback: [
        clip100(`${name} ${code} 行业政策 法规 标准 ${y}`),
        clip100(`${name} ${code} 行业监管 通知 指引`),
      ],
    };
  }

  if (item === "回购计划") {
    return {
      primary: [
        clip100(`${name} ${code} 股份回购 回购进展`),
        clip100(`${name} 回购股份 实施完毕`),
      ],
      fallback: [
        clip100(`${name} 集中竞价回购`),
        clip100(`${code} 回购注销 回购方案`),
      ],
    };
  }

  return { primary: [], fallback: [] };
}
