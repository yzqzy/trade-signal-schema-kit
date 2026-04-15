import { randomUUID } from "node:crypto";
import path from "node:path";

import { normalizeCodeForFeed } from "../pipeline/normalize-stock-code.js";
import { resolveOutputPath } from "../pipeline/resolve-monorepo-path.js";

/** 产物目录布局版本（写入 workflow / business-analysis manifest） */
export const OUTPUT_LAYOUT_VERSION = "2.0" as const;

export type OutputLayoutV2Meta = {
  version: typeof OUTPUT_LAYOUT_VERSION;
  /** 逻辑分区：workflow | business-analysis | valuation | phase3 | report | screener */
  area: string;
  /** 归一化股票代码或占位（如 _ADHOC） */
  code: string;
  /** 单次运行目录名（UUID） */
  runId: string;
};

/**
 * Workflow / business-analysis（走同一条 LangGraph 管线）在**未传** `outputDir` 时：
 * - `workflow` 默认父目录：`output/workflow/<code>/` → 产物 `output/workflow/<code>/<runId>/`
 * - `business-analysis` 在 orchestrator 中传入父目录 `output/business-analysis/<code>/` → 产物 `output/business-analysis/<code>/<runId>/`
 *
 * - 若显式传入 `outputDir`，视为「父目录」，在其下创建 `<runId>` 子目录。
 * - 续跑时不得走本函数：应直接使用用户给出的 run 根目录。
 */
export function resolveWorkflowDefaultRunDirectory(input: {
  code: string;
  /** 父目录；未传则 `output/workflow/<normalizedCode>` */
  outputDir?: string;
  /** 与 LangGraph thread/run 对齐；未传则生成 UUID */
  runId: string;
}): { outputDir: string; normalizedCode: string; runId: string; layout: OutputLayoutV2Meta } {
  const normalizedCode = normalizeCodeForFeed(input.code);
  const runId = input.runId;
  const parent = input.outputDir?.trim()
    ? resolveOutputPath(input.outputDir.trim())
    : resolveOutputPath(path.join("output", "workflow", normalizedCode));
  const outputDir = path.join(parent, runId);
  return {
    outputDir,
    normalizedCode,
    runId,
    layout: {
      version: OUTPUT_LAYOUT_VERSION,
      area: "workflow",
      code: normalizedCode,
      runId,
    },
  };
}

/** 独立 valuation / phase3 CLI：默认 `output` 时落到 `output/valuation/<code>/<runId>/` */
export function resolveValuationOrPhase3DefaultRunDirectory(input: {
  /** 来自 CLI 的原始值，默认常为 `"output"` */
  outputDirArg: string;
  /** 可选股票代码；缺省为 `_adhoc` */
  stockCode?: string;
}): { outputDir: string; layout: OutputLayoutV2Meta } {
  const runId = randomUUID();
  const raw = input.outputDirArg.trim() || "output";
  if (raw !== "output") {
    return {
      outputDir: resolveOutputPath(raw),
      layout: {
        version: OUTPUT_LAYOUT_VERSION,
        area: "valuation",
        code: normalizeCodeForFeed(input.stockCode ?? "_adhoc"),
        runId: "",
      },
    };
  }
  const code = normalizeCodeForFeed((input.stockCode ?? "_adhoc").trim() || "_adhoc");
  const outputDir = resolveOutputPath(path.join("output", "valuation", code, runId));
  return {
    outputDir,
    layout: {
      version: OUTPUT_LAYOUT_VERSION,
      area: "valuation",
      code,
      runId,
    },
  };
}

/** report-to-html：未指定 `--output-html` 时写入 `output/report/<code>/<runId>/<stem>.html` */
export function resolveReportHtmlDefaultPath(input: {
  inputMdAbsolute: string;
  stockCode?: string;
}): { outputHtmlPath: string; layout: OutputLayoutV2Meta } {
  const runId = randomUUID();
  const code = normalizeCodeForFeed((input.stockCode ?? "_adhoc").trim() || "_adhoc");
  const stem = path.basename(input.inputMdAbsolute, path.extname(input.inputMdAbsolute));
  const outputHtmlPath = resolveOutputPath(path.join("output", "report", code, runId, `${stem}.html`));
  return {
    outputHtmlPath,
    layout: {
      version: OUTPUT_LAYOUT_VERSION,
      area: "report",
      code,
      runId,
    },
  };
}

/** screener：`output/screener/<market>/<mode>/<runId>/`（`--output-dir` 为根，默认 `output`） */
export function resolveScreenerRunDirectory(input: {
  outputRootArg: string;
  market: string;
  mode: string;
}): { outputDir: string; runId: string; layout: OutputLayoutV2Meta } {
  const runId = randomUUID();
  const root = resolveOutputPath(input.outputRootArg.trim() || "output");
  const outputDir = path.join(root, "screener", input.market, input.mode, runId);
  return {
    outputDir,
    runId,
    layout: {
      version: OUTPUT_LAYOUT_VERSION,
      area: "screener",
      code: `${input.market}_${input.mode}`,
      runId,
    },
  };
}
