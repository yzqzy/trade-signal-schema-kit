import type { ScreenerRunOutput } from "./types.js";
import type {
  SelectionManifestBuildOptions,
  SelectionManifestV1,
} from "@trade-signal/research-contracts";
import { buildSelectionManifestFromScreener } from "@trade-signal/research-selection";

export type { SelectionManifestV1 };
export { SELECTION_MANIFEST_VERSION } from "@trade-signal/research-contracts";

export function buildSelectionManifestV1(
  output: ScreenerRunOutput,
  runId: string,
  options: SelectionManifestBuildOptions = {},
): SelectionManifestV1 {
  return buildSelectionManifestFromScreener(output, runId, options);
}
