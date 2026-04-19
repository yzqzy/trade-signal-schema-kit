#!/usr/bin/env node

import { runPhase0DownloadAndCache } from "../steps/phase0/downloader.js";
import { initCliEnv } from "../lib/init-cli-env.js";
import { type CliArgs, parsePhase0CliArgs, resolvePhase0CliInput } from "../steps/phase0/cli-args.js";
import {
  EXIT_BAD_ARGUMENTS,
  EXIT_SUCCESS,
  mapPhase0ErrorToExitCodeFromError,
  printPhase0CliResult,
} from "../steps/phase0/cli-output.js";
import { isPhase0NoDataError } from "../steps/phase0/phase0-errors.js";

async function main(): Promise<void> {
  initCliEnv();

  let args: CliArgs;
  try {
    args = parsePhase0CliArgs(process.argv.slice(2));
  } catch (error: any) {
    const message = error?.message ?? "Invalid arguments";
    printPhase0CliResult({
      status: "FAILED",
      url: "",
      stockCode: "",
      category: "",
      year: "",
      message,
    });
    process.exit(EXIT_BAD_ARGUMENTS);
    return;
  }

  const resolved = resolvePhase0CliInput(args, process.env);

  const requiredFields: Array<keyof typeof resolved> = ["stockCode", "category", "year"];
  for (const field of requiredFields) {
    if (!resolved[field]) {
      printPhase0CliResult({
        status: "FAILED",
        url: resolved.url ?? "",
        stockCode: resolved.stockCode ?? "",
        category: resolved.category ?? "",
        year: resolved.year ?? "",
        message: `Missing required argument or env for ${field}`,
      });
      process.exit(EXIT_BAD_ARGUMENTS);
      return;
    }
  }

  let reportUrl = resolved.url?.trim();
  if (!reportUrl) {
    try {
      const { discoverPhase0ReportUrlFromFeed } = await import("../steps/phase0/discover-report-url.js");
      reportUrl = await discoverPhase0ReportUrlFromFeed({
        stockCode: resolved.stockCode as string,
        fiscalYear: resolved.year as string,
        category: resolved.category as string,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Phase0 auto-discovery failed";
      const noData = isPhase0NoDataError(error);
      printPhase0CliResult({
        status: noData ? "NO_DATA" : "FAILED",
        url: "",
        stockCode: resolved.stockCode ?? "",
        category: resolved.category ?? "",
        year: resolved.year ?? "",
        message,
      });
      process.exit(mapPhase0ErrorToExitCodeFromError(error));
      return;
    }
  }

  try {
    const artifact = await runPhase0DownloadAndCache({
      code: resolved.stockCode as string,
      reportUrl,
      category: resolved.category as string,
      fiscalYear: resolved.year as string,
      saveDir: resolved.saveDir,
      maxRetries: resolved.maxRetries,
      forceRefresh: resolved.forceRefresh,
    });

    printPhase0CliResult({
      status: "SUCCESS",
      filepath: artifact.filePath,
      filesize: artifact.sizeBytes,
      url: reportUrl,
      stockCode: resolved.stockCode as string,
      category: resolved.category as string,
      year: resolved.year as string,
      source: artifact.source,
      sha256: artifact.sha256,
      versionTag: artifact.versionTag,
      message: "Download successful",
    });
    process.exit(EXIT_SUCCESS);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Download failed";
    const code = mapPhase0ErrorToExitCodeFromError(error);
    printPhase0CliResult({
      status: isPhase0NoDataError(error) ? "NO_DATA" : "FAILED",
      url: reportUrl,
      stockCode: resolved.stockCode as string,
      category: resolved.category as string,
      year: resolved.year as string,
      message,
    });
    process.exit(code);
  }
}

void main();
