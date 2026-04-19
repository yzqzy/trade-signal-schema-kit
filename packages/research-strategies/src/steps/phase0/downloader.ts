import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { fileTypeFromBuffer } from "file-type";
import got from "got";
import pRetry, { AbortError } from "p-retry";

export interface Phase0Input {
  code: string;
  reportUrl: string;
  fiscalYear?: string;
  category?: string;
  saveDir?: string;
  maxRetries?: number;
  forceRefresh?: boolean;
}

export interface Phase0Artifact {
  code: string;
  reportUrl: string;
  fiscalYear?: string;
  cacheKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  versionTag: string;
  fetchedAt: string;
  source: "network" | "cache";
  filePath: string;
  content: Uint8Array;
}

export interface Phase0CacheStore {
  get(cacheKey: string): Promise<Phase0Artifact | undefined>;
  set(cacheKey: string, artifact: Phase0Artifact): Promise<void>;
}

export class InMemoryPhase0CacheStore implements Phase0CacheStore {
  private readonly store = new Map<string, Phase0Artifact>();

  async get(cacheKey: string): Promise<Phase0Artifact | undefined> {
    return this.store.get(cacheKey);
  }

  async set(cacheKey: string, artifact: Phase0Artifact): Promise<void> {
    this.store.set(cacheKey, artifact);
  }
}

const defaultPhase0CacheStore = new InMemoryPhase0CacheStore();
const PDF_MAGIC = "%PDF-";
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const PHASE0_TIMEOUT_MS = 120_000;

function deriveFileName(reportUrl: string): string {
  try {
    const { pathname } = new URL(reportUrl);
    const name = pathname.split("/").filter(Boolean).at(-1);
    if (name && name.trim().length > 0) return name;
  } catch {
    // no-op: fallback below
  }
  return "annual-report.pdf";
}

function normalizeCategory(category?: string): string {
  if (!category) return "年报";
  const value = category.toLowerCase();
  const mapping: Record<string, string> = {
    annual: "年报",
    interim: "中报",
    q1: "一季报",
    q3: "三季报",
  };
  return mapping[value] ?? category;
}

function stripExchangePrefix(code: string): string {
  return code.replace(/^(SH|SZ)/i, "");
}

function buildOutputFileName(input: Phase0Input): string {
  if (input.fiscalYear) {
    return `${stripExchangePrefix(input.code)}_${input.fiscalYear}_${normalizeCategory(input.category)}.pdf`;
  }
  return deriveFileName(input.reportUrl);
}

function resolveOutputPath(input: Phase0Input): string {
  const saveRoot = input.saveDir ?? path.resolve(process.cwd(), "cache", "reports", input.code);
  return path.resolve(saveRoot, buildOutputFileName(input));
}

/** Phase0 下载白名单（与自动发现筛选一致） */
export function isPhase0WhitelistedPdfUrl(reportUrl: string): boolean {
  try {
    const url = new URL(reportUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (!url.pathname.toLowerCase().endsWith(".pdf")) return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "stockn.xueqiu.com" ||
      host === "10jqka.com.cn" ||
      host.endsWith(".10jqka.com.cn") ||
      host === "cninfo.com.cn" ||
      host.endsWith(".cninfo.com.cn")
    );
  } catch {
    return false;
  }
}

function isAllowedReportUrl(reportUrl: string): boolean {
  return isPhase0WhitelistedPdfUrl(reportUrl);
}

function resolveHeaders(reportUrl: string): Record<string, string> {
  const host = new URL(reportUrl).hostname.toLowerCase();
  let referer = "https://xueqiu.com/";
  if (host === "cninfo.com.cn" || host.endsWith(".cninfo.com.cn")) referer = "https://www.cninfo.com.cn/";
  if (host === "10jqka.com.cn" || host.endsWith(".10jqka.com.cn")) referer = "https://10jqka.com.cn/";

  return {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    accept: "application/pdf,application/octet-stream,*/*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    referer,
  };
}

function buildPhase0CacheKey(input: Pick<Phase0Input, "code" | "reportUrl" | "fiscalYear">): string {
  const yearPart = input.fiscalYear ?? "unknown";
  return `${input.code}:${yearPart}:${input.reportUrl}`;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  return createHash("sha256").update(data).digest("hex");
}

async function validatePdf(content: Uint8Array): Promise<void> {
  const header = new TextDecoder().decode(content.slice(0, 5));
  if (header !== PDF_MAGIC) {
    throw new Error("Phase0 validation failed: file does not start with %PDF-");
  }

  const sample = content.slice(0, Math.min(content.length, 4100));
  const detected = await fileTypeFromBuffer(sample);
  if (detected?.mime !== "application/pdf") {
    throw new Error(`Phase0 validation failed: expected PDF mime, got ${detected?.mime ?? "unknown"}`);
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function downloadReportPdf(input: Phase0Input): Promise<Uint8Array> {
  const retries = input.maxRetries ?? 3;
  return pRetry(
    async () => {
      const response = await got(input.reportUrl, {
        headers: resolveHeaders(input.reportUrl),
        throwHttpErrors: false,
        responseType: "buffer",
        timeout: { request: PHASE0_TIMEOUT_MS },
      });
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return new Uint8Array(response.rawBody);
      }
      if (RETRYABLE_STATUS.has(response.statusCode)) {
        throw new Error(`Retryable status: HTTP ${response.statusCode}`);
      }
      throw new AbortError(`Phase0 download failed: HTTP ${response.statusCode}`);
    },
    {
      retries,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 8000,
      randomize: true,
    },
  );
}

async function writeAtomically(targetPath: string, content: Uint8Array): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await writeFile(tempPath, content);
    await rename(tempPath, targetPath);
  } finally {
    if (await fileExists(tempPath)) await unlink(tempPath);
  }
}

export async function runPhase0DownloadAndCache(
  input: Phase0Input,
  cacheStore: Phase0CacheStore = defaultPhase0CacheStore,
): Promise<Phase0Artifact> {
  if (!isAllowedReportUrl(input.reportUrl)) {
    throw new Error(
      "Invalid report URL: must be a .pdf link from stockn.xueqiu.com, *.10jqka.com.cn, or *.cninfo.com.cn",
    );
  }

  const cacheKey = buildPhase0CacheKey(input);
  const outputPath = resolveOutputPath(input);

  if (!input.forceRefresh) {
    const cached = await cacheStore.get(cacheKey);
    if (cached) return { ...cached, source: "cache" };

    if (await fileExists(outputPath)) {
      const content = new Uint8Array(await readFile(outputPath));
      await validatePdf(content);
      const sha256 = await sha256Hex(content);
      const fetchedAt = (await stat(outputPath)).mtime.toISOString();
      const fromFile: Phase0Artifact = {
        code: input.code,
        reportUrl: input.reportUrl,
        fiscalYear: input.fiscalYear,
        cacheKey,
        fileName: path.basename(outputPath),
        mimeType: "application/pdf",
        sizeBytes: content.byteLength,
        sha256,
        versionTag: `${input.code}-${input.fiscalYear ?? "unknown"}-${sha256.slice(0, 8)}`,
        fetchedAt,
        source: "cache",
        filePath: outputPath,
        content,
      };
      await cacheStore.set(cacheKey, fromFile);
      return fromFile;
    }
  }

  const content = await downloadReportPdf(input);
  await validatePdf(content);
  const sha256 = await sha256Hex(content);
  await writeAtomically(outputPath, content);

  const fileName = path.basename(outputPath);
  const mimeType = "application/pdf";
  const fetchedAt = new Date().toISOString();

  const artifact: Phase0Artifact = {
    code: input.code,
    reportUrl: input.reportUrl,
    fiscalYear: input.fiscalYear,
    cacheKey,
    fileName,
    mimeType,
    sizeBytes: content.byteLength,
    sha256,
    versionTag: `${input.code}-${input.fiscalYear ?? "unknown"}-${sha256.slice(0, 8)}`,
    fetchedAt,
    source: "network",
    filePath: outputPath,
    content,
  };

  await cacheStore.set(cacheKey, artifact);
  return artifact;
}
