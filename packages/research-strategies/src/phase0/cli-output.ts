export const EXIT_SUCCESS = 0;
export const EXIT_NETWORK_FAILURE = 1;
export const EXIT_PDF_VALIDATION_FAILURE = 2;
export const EXIT_BAD_ARGUMENTS = 3;

export type CliResultInput = {
  status: "SUCCESS" | "FAILED";
  filepath?: string;
  filesize?: number;
  url: string;
  stockCode: string;
  category: string;
  year: string;
  message: string;
  source?: "network" | "cache";
  sha256?: string;
  versionTag?: string;
};

export function printPhase0CliResult(input: CliResultInput): void {
  console.log("---RESULT---");
  console.log(`status: ${input.status}`);
  console.log(`filepath: ${input.filepath ?? ""}`);
  console.log(`filesize: ${input.filesize ?? 0}`);
  console.log(`url: ${input.url}`);
  console.log(`stock_code: ${input.stockCode}`);
  console.log(`category: ${input.category}`);
  console.log(`year: ${input.year}`);
  console.log(`source: ${input.source ?? ""}`);
  console.log(`sha256: ${input.sha256 ?? ""}`);
  console.log(`version_tag: ${input.versionTag ?? ""}`);
  console.log(`message: ${input.message}`);
  console.log("---END---");
}

export function mapPhase0ErrorToExitCode(message: string): number {
  if (message.includes("validation failed") || message.includes("expected PDF")) {
    return EXIT_PDF_VALIDATION_FAILURE;
  }
  if (message.includes("Invalid report URL")) {
    return EXIT_BAD_ARGUMENTS;
  }
  if (message.includes("[phase0]") && (message.includes("--url") || message.includes("请手动指定"))) {
    return EXIT_BAD_ARGUMENTS;
  }
  return EXIT_NETWORK_FAILURE;
}
