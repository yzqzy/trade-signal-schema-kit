import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { PageText } from "./zones.js";

type PdfjsWorkerResult = { ok: true; pages: PageText[] } | { ok: false; error: string };

function workerPath(): string {
  return fileURLToPath(new URL("./pdf-text-pdfjs-worker.js", import.meta.url));
}

function parseWorkerResult(stdout: string): PageText[] {
  const parsed = JSON.parse(stdout) as PdfjsWorkerResult;
  if (!parsed.ok) {
    throw new Error(parsed.error || "pdfjs worker failed");
  }
  return parsed.pages;
}

/**
 * 使用独立 Node 子进程运行 pdf.js legacy 构建抽取每页文本。
 *
 * `pdf-parse` 自带 pdfjs-dist@5，而本包直接依赖 pdfjs-dist@4；把 fallback 放进
 * 独立进程可避免两个 pdfjs 版本在同一进程内共享 worker/global 状态导致偶发失败。
 * 作为 `pdf-parse` 的条件回退，改善表格密集页排序。
 */
export async function extractPageTextsPdfjs(pdfPath: string): Promise<PageText[]> {
  const child = spawn(process.execPath, [workerPath(), pdfPath], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_OPTIONS: "" },
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  const timeoutMs = 60_000;
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`pdfjs worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

  const stdout = Buffer.concat(stdoutChunks).toString("utf-8").trim();
  const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
  if (exitCode !== 0) {
    throw new Error(`pdfjs worker exited with code ${exitCode}${stderr ? `: ${stderr}` : ""}`);
  }
  try {
    return parseWorkerResult(stdout);
  } catch (err) {
    throw new Error(`pdfjs worker returned invalid output${stderr ? `; stderr=${stderr}` : ""}: ${String(err)}`);
  }
}
