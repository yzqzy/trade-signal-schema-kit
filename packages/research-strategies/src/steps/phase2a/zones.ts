/**
 * A 股年报结构分区（对齐 Turtle `pdf_preprocessor.py` 的 ZONE_MARKERS / SECTION_ZONE_PREFERENCES）
 */
export const PHASE2A_ZONE_MARKERS: Array<{ pattern: RegExp; zone: string }> = [
  { pattern: /第[一二三四五六七八九十百]+节\s*重要提示/, zone: "INTRO_ZONE" },
  { pattern: /第[一二三四五六七八九十百]+节\s*公司简介/, zone: "INTRO_ZONE" },
  { pattern: /第[一二三四五六七八九十百]+节\s*管理层讨论与分析/, zone: "MDA_ZONE" },
  { pattern: /第[一二三四五六七八九十百]+节\s*经营情况讨论与分析/, zone: "MDA_ZONE" },
  { pattern: /第[一二三四五六七八九十百]+节\s*公司治理/, zone: "GOVERNANCE_ZONE" },
  { pattern: /第[一二三四五六七八九十百]+节\s*财务报告/, zone: "FIN_ZONE" },
  { pattern: /第[一二三四五六七八九十百]+节\s*会计数据/, zone: "FIN_ZONE" },
  { pattern: /[四五六]\s*[、.．]\s*重要会计政策/, zone: "POLICY_ZONE" },
  { pattern: /七\s*[、.．]\s*合并财务报表项目注释/, zone: "NOTES_ZONE" },
  { pattern: /[一二三四五六七八九十]+[、.．]\s*补充资料/, zone: "SUPPLEMENT_ZONE" },
];

/** sectionId -> 分区偏好（用于消歧） */
export const PHASE2A_SECTION_ZONE_PREFERENCES: Record<
  string,
  { prefer: string[]; avoid: string[] }
> = {
  P2: { prefer: ["NOTES_ZONE"], avoid: ["POLICY_ZONE"] },
  P3: { prefer: ["NOTES_ZONE"], avoid: ["POLICY_ZONE"] },
  P4: { prefer: ["NOTES_ZONE"], avoid: ["POLICY_ZONE"] },
  P6: { prefer: ["NOTES_ZONE"], avoid: ["POLICY_ZONE"] },
  P13: { prefer: ["SUPPLEMENT_ZONE", "NOTES_ZONE"], avoid: ["POLICY_ZONE"] },
  MDA: { prefer: ["MDA_ZONE"], avoid: ["NOTES_ZONE", "FIN_ZONE", "POLICY_ZONE", "SUPPLEMENT_ZONE"] },
  SUB: { prefer: ["NOTES_ZONE"], avoid: ["POLICY_ZONE"] },
};

export type PageText = { page: number; text: string };

/**
 * 返回每页所属「当前分区」（自上一标记页起继承）。
 */
export function detectPageZones(pages: PageText[]): Map<number, string> {
  const transitions: Array<{ page: number; zone: string }> = [];
  for (const { page, text } of pages) {
    if (!text) continue;
    for (const { pattern, zone } of PHASE2A_ZONE_MARKERS) {
      if (pattern.test(text)) {
        transitions.push({ page, zone });
        break;
      }
    }
  }
  transitions.sort((a, b) => a.page - b.page);
  const out = new Map<number, string>();
  if (transitions.length === 0) return out;

  let ti = 0;
  let current: string | undefined;
  for (const { page } of pages) {
    while (ti < transitions.length && transitions[ti]!.page <= page) {
      current = transitions[ti]!.zone;
      ti += 1;
    }
    if (current) out.set(page, current);
  }
  return out;
}
