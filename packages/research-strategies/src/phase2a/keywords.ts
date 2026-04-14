export const PHASE2A_SECTION_ORDER = ["P2", "P3", "P4", "P6", "P13", "MDA", "SUB"] as const;

export type Phase2ASectionId = (typeof PHASE2A_SECTION_ORDER)[number];
export const PHASE2A_SECTION_PHASE2B_TARGETS = ["P2", "P3", "P4", "P6", "P13", "SUB"] as const;

export const PHASE2A_SECTION_TITLES: Record<Phase2ASectionId, string> = {
  P2: "受限资产",
  P3: "应收账款账龄",
  P4: "关联方交易",
  P6: "或有负债",
  P13: "非经常性损益",
  MDA: "管理层讨论与分析",
  SUB: "主要控股参股公司",
};

/** 与 Turtle `pdf_preprocessor.py` SECTION_KEYWORDS 对齐并去冗 */
export const PHASE2A_SECTION_KEYWORDS: Record<Phase2ASectionId, string[]> = {
  P2: [
    "所有权或使用权受限资产",
    "受限资产",
    "使用受限的资产",
    "所有权受限",
    "使用权受到限制",
    "受限的货币资金",
    "受到限制的资产",
    "所有權或使用權受限資產",
    "受限資產",
    "使用受限的資產",
  ],
  P3: [
    "应收账款账龄",
    "应收账款的账龄",
    "账龄分析",
    "应收账款按账龄披露",
    "应收账款按账龄列示",
    "应收款项账龄",
    "應收賬款賬齡",
    "應收賬款的賬齡",
    "賬齡分析",
  ],
  P4: [
    "关联方交易",
    "关联交易",
    "关联方及关联交易",
    "关联方关系及其交易",
    "重大关联交易",
    "關聯方交易",
    "關聯交易",
    "關聯方及關聯交易",
  ],
  P6: [
    "或有负债",
    "或有事项",
    "未决诉讼",
    "重大诉讼",
    "对外担保",
    "承诺及或有事项",
    "承诺和或有负债",
    "或有負債",
    "或有事項",
    "未決訴訟",
    "承諾及或有事項",
  ],
  P13: [
    "非经常性损益项目及金额",
    "非经常性损益合计",
    "非经常性损益",
    "非经常性损益明细",
    "非经常性损益项目",
    "扣除非经常性损益",
    "非经常性损益的项目和金额",
    "非經常性損益",
    "非經常性損益明細",
    "非經常性損益項目及金額",
  ],
  MDA: [
    "管理层讨论与分析",
    "经营情况讨论与分析",
    "经营情况的讨论与分析",
    "管理层分析与讨论",
    "董事会报告",
    "管理層討論與分析",
    "經營情況討論與分析",
    "董事會報告",
  ],
  SUB: [
    "主要控股参股公司分析",
    "主要子公司及对公司净利润的影响",
    "主要控股参股公司情况",
    "控股子公司情况",
    "在子公司中的权益",
    "在其他主体中的权益",
    "纳入合并范围的主体",
    "合并范围的变化",
    "长期股权投资——对子公司",
    "长期股权投资——联营企业",
    "主要控股參股公司分析",
    "在子公司中的權益",
    "在其他主體中的權益",
    "長期股權投資——對子公司",
  ],
};

/** 单章最大连续页数（防止边界失败吞全书） */
export const PHASE2A_SECTION_MAX_SPAN_PAGES: Record<Phase2ASectionId, number> = {
  P2: 20,
  P3: 20,
  P4: 20,
  P6: 20,
  P13: 20,
  MDA: 45,
  SUB: 28,
};

export const PHASE2A_SECTION_BUFFER_PAGES: Record<Phase2ASectionId, number> = {
  P2: 1,
  P3: 1,
  P4: 1,
  P6: 1,
  P13: 1,
  MDA: 3,
  SUB: 2,
};

export const PHASE2A_SECTION_MAX_CHARS: Record<Phase2ASectionId, number> = {
  P2: 4000,
  P3: 4000,
  P4: 4000,
  P6: 4000,
  P13: 4000,
  MDA: 8000,
  SUB: 6000,
};
