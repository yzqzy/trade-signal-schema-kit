#!/usr/bin/env node

import { runPhase0DownloadAndCache } from "./phase0/downloader.js";
import {
  type CliArgs,
  initPhase0CliEnv,
  parsePhase0CliArgs,
  resolvePhase0CliInput,
} from "./phase0/cli-args.js";
import {
  EXIT_BAD_ARGUMENTS,
  EXIT_SUCCESS,
  mapPhase0ErrorToExitCode,
  printPhase0CliResult,
} from "./phase0/cli-output.js";

async function main(): Promise<void> {
  initPhase0CliEnv();

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
      const { discoverPhase0ReportUrlFromFeed } = await import("./phase0/discover-report-url.js");
      reportUrl = await discoverPhase0ReportUrlFromFeed({
        stockCode: resolved.stockCode as string,
        fiscalYear: resolved.year as string,
        category: resolved.category as string,
      });
    } catch (error: any) {
      const message = error?.message ?? "Phase0 auto-discovery failed";
      printPhase0CliResult({
        status: "FAILED",
        url: "",
        stockCode: resolved.stockCode ?? "",
        category: resolved.category ?? "",
        year: resolved.year ?? "",
        message,
      });
      process.exit(mapPhase0ErrorToExitCode(message));
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
  } catch (error: any) {
    const message = error?.message ?? "Download failed";
    const code = mapPhase0ErrorToExitCode(message);
    printPhase0CliResult({
      status: "FAILED",
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
