import { randomUUID } from "node:crypto";
import path from "node:path";

import { normalizeCodeForFeed } from "../crosscut/normalization/normalize-stock-code.js";
import { resolveOutputPath } from "../crosscut/normalization/resolve-monorepo-path.js";

/** 产物目录布局版本（写入 workflow / business-analysis manifest） */
export const OUTPUT_LAYOUT_VERSION = "2.0" as const;

/** 产物分区（manifest `outputLayout.area`） */
export type OutputLayoutArea =
  | "workflow"
  | "business-analysis"
  | "valuation"
  | "phase3"
  | "report"
  | "screener";

export type OutputLayoutV2Meta = {
  version: typeof OUTPUT_LAYOUT_VERSION;
  area: OutputLayoutArea;
  /** 归一化股票代码或占位（如 _ADHOC） */
  code: string;
  /** 单次运行目录名（UUID）；显式写入根时可为空字符串 */
  runId: string;
};

/**
 * Workflow / business-analysis 在**未传** `outputDir` 时（同一套阶段语义与续跑文件布局）：
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
  /** 与 workflow checkpoint threadId/run 对齐；未传则生成 UUID */
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

function resolveCliDefaultRunUnderOutput(input: {
  outputDirArg: string;
  stockCode?: string;
  area: "valuation" | "phase3";
  /** `output` 下第一层目录名 */
  segment: "valuation" | "phase3";
}): { outputDir: string; layout: OutputLayoutV2Meta } {
  const runId = randomUUID();
  const raw = input.outputDirArg.trim() || "output";
  if (raw !== "output") {
    return {
      outputDir: resolveOutputPath(raw),
      layout: {
        version: OUTPUT_LAYOUT_VERSION,
        area: input.area,
        code: normalizeCodeForFeed(input.stockCode ?? "_adhoc"),
        runId: "",
      },
    };
  }
  const code = normalizeCodeForFeed((input.stockCode ?? "_adhoc").trim() || "_adhoc");
  const outputDir = resolveOutputPath(path.join("output", input.segment, code, runId));
  return {
    outputDir,
    layout: {
      version: OUTPUT_LAYOUT_VERSION,
      area: input.area,
      code,
      runId,
    },
  };
}

/** `valuation:run`：默认 `--output-dir output` → `output/valuation/<code>/<runId>/` */
export function resolveValuationDefaultRunDirectory(input: {
  outputDirArg: string;
  stockCode?: string;
}): { outputDir: string; layout: OutputLayoutV2Meta } {
  return resolveCliDefaultRunUnderOutput({
    ...input,
    area: "valuation",
    segment: "valuation",
  });
}

/** `run:phase3`：默认 `--output-dir output` → `output/phase3/<code>/<runId>/` */
export function resolvePhase3DefaultRunDirectory(input: {
  outputDirArg: string;
  stockCode?: string;
}): { outputDir: string; layout: OutputLayoutV2Meta } {
  return resolveCliDefaultRunUnderOutput({
    ...input,
    area: "phase3",
    segment: "phase3",
  });
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
